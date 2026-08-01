//! The record lane (ADR-0102) — the drift product's operator surface.
//!
//! Mounted on the same kernel server, over the same connection and bearer token as
//! the operator console, exactly like the access-policy and Telegram planes. A
//! kernel without the drift plugin answers `Unimplemented`; a kernel WITH the
//! plugin and no Postgres never advertises `record-lane` at all. Both are correct
//! deployments and neither is an error.
//!
//! **Two things in this file are load-bearing and easy to get wrong.**
//!
//! First, [`DriftStats::available`] is not a count. `available == false` means this
//! deployment has no reconciler, and it must never reach a screen that renders four
//! zeros — a detector that was never switched on and a deployment with nothing
//! wrong produce identical tallies, and only this flag tells them apart. It is
//! carried through to the webview unmodified for that reason.
//!
//! Second, [`Alert::tags`] is INHERITED classification (ADR-0095 D9), derived from
//! both the message and the record an alert quotes. An alert is never more visible
//! than the material behind it, and it is the artifact most likely to be forwarded
//! — so every copy/export/share affordance downstream keys off these. Dropping them
//! here would make that impossible to enforce anywhere else.

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::state::ts_iso;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::records::record_lane_client::RecordLaneClient;

type RecordsClient = RecordLaneClient<InterceptedService<Channel, AuthInterceptor>>;

/// How many alerts one poll asks for.
///
/// `ListAlerts` has no filtering or pagination beyond `limit` (DRIFT-02 §4), so
/// this is the whole window. Generous rather than tight: the feed's own stat strip
/// counts over what it holds, and a cap that silently truncated the tally would
/// make those numbers quietly wrong rather than visibly missing.
const ALERT_LIMIT: i32 = 200;

/// One piece of evidence behind an alert, and the anchor for one `[n]` marker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertCitation {
    /// 1-based, contiguous, and matching a marker in [`Alert::text`]. Every marker
    /// has a citation and every citation has a marker — a citation with no anchor
    /// is one the operator cannot follow.
    pub index: i32,
    /// "message" or "record".
    pub kind: String,
    /// The subject: a message id, or `KEY@date` for a record.
    pub r#ref: String,
    /// Populated on the alert itself, which is what lets the inspector render with
    /// no second round trip.
    pub quote: String,
    /// RFC-3339, or "" when absent.
    pub at: String,
    /// The record version quoted; 0 for a message citation. There is no RPC to
    /// fetch a version by id, so this is shown and not followed.
    pub version_id: i64,
}

/// One raised drift alert: someone promised a date the system of record disagrees
/// with, with both sides quoted.
///
/// **Advisory.** It notifies. It does not email the customer, amend the purchase
/// order or touch a CRM, and nothing downstream may imply that it does.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: i64,
    pub kind: String,
    pub record_key: String,
    pub owner: String,
    pub speaker: String,
    pub message_id: String,
    /// SIGNED. Positive means the record is LATER than promised — the direction a
    /// customer feels, and the single most load-bearing field on the alert.
    pub delta_days: i32,
    pub promised: String,
    pub recorded: String,
    /// How many DISTINCT dates the record has carried. Distinct rather than
    /// versions: a nightly export rewrites every open row, so a version count would
    /// report "moved 90 times" for a date that never moved. `>= 2` is the "this
    /// keeps moving" signal, which is a different conversation from "it slipped".
    pub slip_count: i32,
    /// The rendered sentence, carrying inline `[n]` markers (ADR-0081).
    pub text: String,
    pub citations: Vec<AlertCitation>,
    /// Inherited classification — see the module note. Not decorative.
    pub tags: Vec<String>,
    pub raised_at: String,
    /// Measured from the MESSAGE arriving, not from when reconciliation started.
    pub detect_latency_ms: i64,
}

/// The reconciliation tally.
///
/// PROCESS-LIFETIME, not durable: it resets when the kernel restarts while
/// [`Self::available`] stays true. A window on the current process, not a trend —
/// `ListAlerts` is the durable truth, and no "total ever" figure may be built on
/// this.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftStats {
    pub consistent: i32,
    pub drift: i32,
    /// Alerts NOT derived because they would have crossed a closed-tag boundary.
    /// Working as intended — never styled as an error.
    pub refused: i32,
    /// Keyed by reason, and kept broken out. 400 `record_not_found` means the
    /// export is stale; 400 `ambiguous_match` means the counterparty naming is —
    /// same number, different team, different week. Summing them destroys the only
    /// actionable part.
    pub unresolved: Vec<UnresolvedReason>,
    /// The DENOMINATOR. "12 drifts" means nothing without it: 12 of 15 and 12 of
    /// 40 000 are opposite findings.
    pub total: i32,
    /// False when this deployment has no reconciler. See the module note.
    pub available: bool,
}

/// One unresolved reason and its count.
///
/// A list rather than a map because the wire type is a map, whose iteration order
/// is unspecified — and a page whose rows reshuffle between polls is one an
/// operator stops trusting. Sorted by count descending, then by reason, so the
/// order is a property of the data rather than of the hash seed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnresolvedReason {
    pub reason: String,
    pub count: i32,
}

/// One derivation that was refused because it would have crossed a closed-tag
/// boundary (ADR-0095 D9).
///
/// This is not an error log. It is what keeps "suppressed by policy" distinct from
/// "nothing found", and an operator who cannot see it cannot act on it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Refusal {
    pub id: i64,
    pub at: String,
    /// What was being derived, e.g. "drift_alert".
    pub kind: String,
    /// The subject, e.g. the record key.
    pub r#ref: String,
    /// The distinct closed tags that could not be combined. Naming them is the
    /// difference between a refusal an administrator can act on and one they can
    /// only notice.
    pub boundary: Vec<String>,
    pub reason: String,
}

/// One retention pass, as the record lane's own plane reports it.
///
/// The same shape the operator feed carries as `RetentionRunOp`, deliberately: the
/// feed is the live lane and this is the cold-start backfill, and a console that
/// modelled them differently would show a different history depending on how long
/// it had been connected.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionRun {
    /// The retention domain that ran. Free-form, because an enum here would have to
    /// enumerate premium plugins to be useful.
    pub source: String,
    pub run_id: i64,
    pub started_at: String,
    pub finished_at: String,
    pub deleted: Vec<RetentionDeletion>,
    /// True when the pass hit its per-pass cap and MORE REMAINS. On every tick it
    /// says the backlog is not draining — a capacity warning, not a status line.
    pub bounded: bool,
    /// Empty on success. Non-empty means retention has STOPPED HAPPENING and data
    /// that should have been erased is still on disk. Failed passes are published
    /// precisely so this cannot be silent.
    pub error: String,
}

/// One category a pass removed. A list rather than fixed columns because sources
/// delete different things, and fixed fields would force every later source to
/// misname its counts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionDeletion {
    pub category: String,
    pub count: i32,
}

/// What one connector can and cannot see (BRAIN-03).
///
/// PUSHED by the connector, not queried: the kernel cannot enumerate a customer's
/// Slack channels, and the bot in that workspace can — only for the channels it
/// was invited to, because Slack has no read-the-whole-workspace scope. Same
/// reasoning as records.
///
/// Held in memory kernel-side, process-lifetime. An absent report is the honest
/// rendering of an absent connector: durability would buy the ability to render
/// coverage for a connector that is currently DOWN, which is precisely the moment
/// the number would be a lie.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCoverage {
    /// The ingress surface this describes, e.g. "slack".
    pub source: String,
    /// The daemon that reported it.
    pub connector: String,
    pub invited_channels: Vec<String>,
    /// Derived server-side from the channel list, never trusted from the wire.
    pub channel_count: i32,
    pub plan_tier: String,
    /// How far back the SOURCE retains history.
    ///
    /// `-1` means "not reported", deliberately distinct from `0` ("retains
    /// nothing"), and it is meaningless when [`Self::horizon_unlimited`] is set.
    /// Carried raw rather than pre-formatted here: one integer cannot express
    /// three states, and collapsing them in the core would mean the webview could
    /// not tell "unlimited" from "unknown" — a wrong horizon is a recall claim
    /// measured against the wrong denominator.
    pub retention_horizon_days: i32,
    pub horizon_unlimited: bool,
    /// True only for an approved Enterprise Grid partner. False means private
    /// channels, DMs and Slack Connect are NOT covered.
    pub discovery_api: bool,
    /// The connector's own plain-English list, carried verbatim rather than
    /// re-derived from the booleans above — two places deriving the same sentence
    /// is two places to drift apart, and the connector is the one that knows.
    pub limits: Vec<String>,
    /// Stamped kernel-side on receipt. What makes staleness visible rather than
    /// implied: a console rendering coverage without an age is making a claim it
    /// cannot support.
    pub reported_at: String,
}

/// The last accepted push for one record kind.
///
/// Only kinds that have actually been pushed appear — the query is driven off the
/// record rows themselves. A kind configured but never pushed once has no rows and
/// therefore no entry, which the console has to state rather than imply.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KindPushStatus {
    pub kind: String,
    pub last_push_id: String,
    /// Which door the batch came through: "webhook" | "csv" | "view".
    pub transport: String,
    /// Rows in that push.
    pub record_count: i32,
    pub received_at: String,
    /// Rows of this kind currently un-superseded — the number a customer
    /// recognises as "our open orders", as opposed to every version ever pushed.
    pub live_records: i32,
}

impl Transport {
    async fn records_client(&self) -> Result<RecordsClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(RecordLaneClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    /// Raised alerts, newest first, scoped to the caller.
    ///
    /// Poll-only: alerts are not on the operator event feed, and adding them would
    /// be a contract bump. The caller is expected to say so on screen rather than
    /// draw a live indicator over a poll.
    pub async fn list_alerts(&self) -> Result<Vec<Alert>, String> {
        let mut client = self.records_client().await?;
        let resp = client
            .list_alerts(Request::new(pb::records::ListAlertsRequest {
                limit: ALERT_LIMIT,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.alerts.into_iter().map(map_alert).collect())
    }

    /// The four-outcome tally. See [`DriftStats`] for why `available` is not a count.
    pub async fn drift_stats(&self) -> Result<DriftStats, String> {
        let mut client = self.records_client().await?;
        let s = client
            .get_drift_stats(Request::new(pb::records::GetDriftStatsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();

        // The wire type is a map, so the order the server iterates it in is not
        // stable. Sorting here rather than in the webview keeps every consumer —
        // screen, test, future export — reading the same order.
        let mut unresolved: Vec<UnresolvedReason> = s
            .unresolved
            .into_iter()
            .map(|(reason, count)| UnresolvedReason { reason, count })
            .collect();
        unresolved.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.reason.cmp(&b.reason)));

        Ok(DriftStats {
            consistent: s.consistent,
            drift: s.drift,
            refused: s.refused,
            unresolved,
            total: s.total,
            available: s.available,
        })
    }

    /// What was declined, and across which boundary.
    pub async fn list_refusals(&self) -> Result<Vec<Refusal>, String> {
        let mut client = self.records_client().await?;
        let resp = client
            .list_refusals(Request::new(pb::records::ListRefusalsRequest { limit: 100 }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .refusals
            .into_iter()
            .map(|r| Refusal {
                id: r.id,
                at: ts_iso(&r.at),
                kind: r.kind,
                r#ref: r.r#ref,
                boundary: r.boundary,
                reason: r.reason,
            })
            .collect())
    }

    /// Retention history for the RECORD source.
    ///
    /// The operator feed is the live lane for this and covers both sources, but it
    /// only carries passes that happened while this console was connected. A failed
    /// pass three hours before login has to be visible on the first paint, so this
    /// backfills what the feed cannot replay.
    pub async fn list_retention_runs(&self) -> Result<Vec<RetentionRun>, String> {
        let mut client = self.records_client().await?;
        let resp = client
            .list_retention_runs(Request::new(pb::records::ListRetentionRunsRequest {
                limit: 50,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .runs
            .into_iter()
            .map(|r| RetentionRun {
                // This plane only reports its own domain, and the RPC has no source
                // field. Naming it here is what lets one panel merge these with the
                // feed's source-agnostic events without inventing a second shape.
                source: "records".to_string(),
                run_id: r.id,
                started_at: ts_iso(&r.started_at),
                finished_at: ts_iso(&r.finished_at),
                deleted: deletions_of(r.versions_deleted, r.commands_deleted),
                bounded: r.bounded,
                error: r.error,
            })
            .collect())
    }

    /// What every connected source can and cannot see.
    ///
    /// An EMPTY list means no connector has reported — not "coverage is zero".
    /// The store is process-lifetime and self-healing (a connector re-reports on
    /// every reconnect), so an empty answer shortly after a kernel restart is
    /// expected rather than alarming. The console must not render it as a
    /// coverage claim.
    ///
    /// **This console never calls `ReportCoverage`.** Reporting is a connector's
    /// job, and an operator console asserting what a daemon can see would be
    /// inventing the denominator this surface exists to make honest.
    pub async fn coverage(&self) -> Result<Vec<SourceCoverage>, String> {
        let mut client = self.records_client().await?;
        let resp = client
            .get_coverage(Request::new(pb::records::GetCoverageRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .sources
            .into_iter()
            .map(|c| SourceCoverage {
                source: c.source,
                connector: c.connector,
                invited_channels: c.invited_channels,
                channel_count: c.channel_count,
                plan_tier: c.plan_tier,
                retention_horizon_days: c.retention_horizon_days,
                horizon_unlimited: c.horizon_unlimited,
                discovery_api: c.discovery_api,
                limits: c.limits,
                reported_at: ts_iso(&c.reported_at),
            })
            .collect())
    }

    /// The last accepted push per record kind.
    ///
    /// Empty is a real answer — "no import recorded" — and the lane returns it
    /// rather than erroring when its store keeps no push audit.
    pub async fn push_status(&self) -> Result<Vec<KindPushStatus>, String> {
        let mut client = self.records_client().await?;
        let resp = client
            .get_push_status(Request::new(pb::records::GetPushStatusRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .kinds
            .into_iter()
            .map(|k| KindPushStatus {
                kind: k.kind,
                last_push_id: k.last_push_id,
                transport: k.transport,
                record_count: k.record_count,
                received_at: ts_iso(&k.received_at),
                live_records: k.live_records,
            })
            .collect())
    }
}

/// The record lane's typed columns, as the feed's category list.
///
/// Zero counts are dropped rather than sent as `record_versions 0`: the feed's
/// contract says an empty `deleted` means the pass ran and removed nothing, which
/// is a normal outcome, and emitting explicit zeroes here would make a merged
/// panel show two different renderings of the same fact.
fn deletions_of(versions: i32, commands: i32) -> Vec<RetentionDeletion> {
    let mut out = Vec::new();
    if versions > 0 {
        out.push(RetentionDeletion {
            category: "record_versions".to_string(),
            count: versions,
        });
    }
    if commands > 0 {
        out.push(RetentionDeletion {
            category: "push_commands".to_string(),
            count: commands,
        });
    }
    out
}

fn map_alert(a: pb::records::Alert) -> Alert {
    Alert {
        id: a.id,
        kind: a.kind,
        record_key: a.record_key,
        owner: a.owner,
        speaker: a.speaker,
        message_id: a.message_id,
        delta_days: a.delta_days,
        promised: ts_iso(&a.promised),
        recorded: ts_iso(&a.recorded),
        slip_count: a.slip_count,
        text: a.text,
        citations: a
            .citations
            .into_iter()
            .map(|c| AlertCitation {
                index: c.index,
                kind: c.kind,
                r#ref: c.r#ref,
                quote: c.quote,
                at: ts_iso(&c.at),
                version_id: c.version_id,
            })
            .collect(),
        tags: a.tags,
        raised_at: ts_iso(&a.raised_at),
        detect_latency_ms: a.detect_latency_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unresolved_reasons_are_ordered_by_count_then_name() {
        // Two reasons at the same count is the case the ledger's own copy calls
        // out — they are the same number and completely different work — so the
        // tie-break has to be deterministic or the two rows swap between polls.
        let mut v = vec![
            UnresolvedReason { reason: "record_not_found".into(), count: 41 },
            UnresolvedReason { reason: "no_record_reference".into(), count: 2 },
            UnresolvedReason { reason: "ambiguous_match".into(), count: 41 },
        ];
        v.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.reason.cmp(&b.reason)));
        assert_eq!(
            v.iter().map(|r| r.reason.as_str()).collect::<Vec<_>>(),
            vec!["ambiguous_match", "record_not_found", "no_record_reference"]
        );
    }

    #[test]
    fn zero_counts_do_not_become_categories() {
        // An empty `deleted` means "ran, removed nothing". A `record_versions 0`
        // row would render as a deletion category that deleted nothing, which is a
        // different and wrong statement.
        assert!(deletions_of(0, 0).is_empty());
        let d = deletions_of(5000, 0);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].category, "record_versions");
        assert_eq!(d[0].count, 5000);
    }
}
