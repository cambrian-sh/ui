//! The knowledge-substrate plane (ADR-0118) — the Knowledge console's transport.
//!
//! Mounted on the same kernel server, over the same connection and bearer token
//! as the operator console, exactly like the access-policy and record planes. A
//! kernel without the substrate plugin answers `Unimplemented`; a kernel WITH
//! the plugin and no Postgres never advertises `substrate-query` at all. Both
//! are correct deployments and neither is an error.
//!
//! **Three things here are load-bearing.**
//!
//! First, [`AskOutcome`] is exactly one of ANSWERED or REFUSED, and a refusal is
//! a first-class answer — the substrate's whole promise is that it refuses
//! rather than guesses. The console must render the two distinctly (and both
//! distinctly from an error): "refused: open-ended" with the memory lane named
//! is the product working, not the product failing.
//!
//! Second, [`AskOutcome::compiled`] is the transparency contract: the exact
//! query that ran travels WITH the answer, so NL convenience never becomes NL
//! ambiguity. Dropping it here would make the ask box a black box downstream.
//!
//! Third, rows stay JSON strings (the plane's v1 wire shape) end to end. The
//! row keys are shape-specific and the webview renders them as a dynamic
//! table; decoding them into a fixed struct here would force every new row
//! shape through a Rust release.

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::state::ts_iso;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::substrate::substrate_lane_client::SubstrateLaneClient;

type SubstrateClient = SubstrateLaneClient<InterceptedService<Channel, AuthInterceptor>>;

/// The compiled closed-AST query, echoed back with every answered ask and
/// accepted as the input of [`Transport::knowledge_query`]. Times are RFC-3339
/// strings at this seam ("" = unset) — the webview never handles protobuf
/// timestamps.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CompiledQuery {
    /// "point" | "history" | "as_of" | "current" | "contradictions" |
    /// "aggregate" | "events" | "traverse" | "evidence".
    pub kind: String,
    pub entity_id: String,
    pub predicate: String,
    pub item_kind: String,
    pub actor: String,
    pub aggregate: String,
    pub hops: i32,
    pub limit: i32,
    pub evidence_id: String,
    pub as_of: String,
    pub from: String,
    pub to: String,
    /// ADR-0148: `why` returns stored lineage only unless this asks for the
    /// RELATED rows too (shared participant, windowed, ranked — not causal).
    pub include_correlation: bool,
    /// 0 = the kernel's default window (72 h).
    pub correlation_window_seconds: i64,
    pub correlation_roles: Vec<String>,
}

/// One executed query's answer: the §14 guarantee label plus the rows.
///
/// The guarantee is carried verbatim and must be RENDERED verbatim — a row set
/// without its warranty is just another ranked list, which is the thing this
/// plane exists not to be.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeAnswer {
    pub guarantee: String,
    /// JSON objects, one per row (v1 wire shape).
    pub rows: Vec<String>,
}

/// One ask outcome. `answered == false` with a `refusal_reason` is the plane
/// WORKING — see the module note.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskOutcome {
    pub answered: bool,
    pub guarantee: String,
    pub rows: Vec<String>,
    /// Present exactly when answered: the query that actually ran.
    pub compiled: Option<CompiledQuery>,
    pub refusal_reason: String,
    /// "memory" when the corpus lane is the right tool for the question.
    pub lane_hint: String,
}

/// What one source surface (ingress/stream) has contributed, with the
/// classification tags its rows carry — which scopes gate that material. The
/// per-surface breakdown is the point: ingress data is scoped by the surface
/// it arrived through (ADR-0112 floor + ADR-0118 read filter), and this is
/// where that model becomes visible instead of implicit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceHolding {
    pub source_id: String,
    pub evidence_count: i64,
    pub last_seen: String,
    pub classification: Vec<String>,
}

/// One knowledge-item kind and how many items it holds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KindCount {
    pub kind: String,
    pub count: i64,
}

/// What the substrate holds. All counts are FULL-VISIBILITY numbers — the
/// operator console sees everything by design (ADR-0118 v1), so these include
/// classified material.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubstrateOverview {
    pub evidence_count: i64,
    pub event_count: i64,
    pub observation_count: i64,
    pub knowledge_item_count: i64,
    pub live_resolution_count: i64,
    pub entity_count: i64,
    pub actor_count: i64,
    /// Evidence archived but not yet transformed into typed rows — "your data
    /// is still materializing". Non-zero is normal moments after ingest;
    /// growing without draining is the ingest-health warning. Excludes dead
    /// items (`outbox_dead`) since the 2026-11-13 contract change.
    pub outbox_pending: i64,
    /// Evidence whose transformation failed on every attempt and was parked
    /// dead: never retried by itself. Replayed per ingress from Ingress Studio's
    /// failure list once the cause is fixed.
    pub outbox_dead: i64,
    /// Entities whose current resolutions disagree across actors. Disagreement
    /// is a headline metric for this product, not a buried query.
    pub contradiction_count: i64,
    pub earliest: String,
    pub latest: String,
    pub sources: Vec<SourceHolding>,
    pub kinds: Vec<KindCount>,
}

/// One browsable entity: names, predicates and counts only — VALUES are
/// disclosed exclusively through the query plane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityOverview {
    pub entity_id: String,
    pub observation_count: i64,
    pub predicates: Vec<String>,
    pub last_seen: String,
}

fn iso_ts(s: &str) -> Option<prost_types::Timestamp> {
    if s.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| prost_types::Timestamp {
            seconds: d.timestamp(),
            nanos: d.timestamp_subsec_nanos() as i32,
        })
}

fn to_wire(q: &CompiledQuery) -> pb::substrate::QueryRequest {
    pb::substrate::QueryRequest {
        kind: q.kind.clone(),
        // Contract 0098: alias expansion exists on the wire; the Knowledge
        // console does not surface it yet, so the compiled query never asks.
        expand_aliases: false,
        entity_id: q.entity_id.clone(),
        predicate: q.predicate.clone(),
        item_kind: q.item_kind.clone(),
        policy: String::new(),
        actor: q.actor.clone(),
        as_of: iso_ts(&q.as_of),
        from: iso_ts(&q.from),
        to: iso_ts(&q.to),
        aggregate: q.aggregate.clone(),
        hops: q.hops,
        limit: q.limit,
        evidence_id: q.evidence_id.clone(),
        include_correlation: q.include_correlation,
        correlation_window_seconds: q.correlation_window_seconds,
        correlation_roles: q.correlation_roles.clone(),
    }
}

fn from_wire(q: pb::substrate::QueryRequest) -> CompiledQuery {
    CompiledQuery {
        kind: q.kind,
        entity_id: q.entity_id,
        predicate: q.predicate,
        item_kind: q.item_kind,
        actor: q.actor,
        aggregate: q.aggregate,
        hops: q.hops,
        limit: q.limit,
        evidence_id: q.evidence_id,
        as_of: ts_iso(&q.as_of),
        from: ts_iso(&q.from),
        to: ts_iso(&q.to),
        include_correlation: q.include_correlation,
        correlation_window_seconds: q.correlation_window_seconds,
        correlation_roles: q.correlation_roles,
    }
}

impl Transport {
    async fn substrate_client(&self) -> Result<SubstrateClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(SubstrateLaneClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    /// One natural-language question → compiled AST + answer, or a refusal.
    pub async fn knowledge_ask(&self, question: String) -> Result<AskOutcome, String> {
        let mut client = self.substrate_client().await?;
        let resp = client
            .ask_knowledge(Request::new(pb::substrate::AskKnowledgeRequest { question }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(AskOutcome {
            answered: resp.answered,
            guarantee: resp.guarantee,
            rows: resp.rows,
            compiled: resp.compiled.map(from_wire),
            refusal_reason: resp.refusal_reason,
            lane_hint: resp.lane_hint,
        })
    }

    /// One closed-AST query (the console's own drill-ins: entity cards, the
    /// contradictions view, evidence receipts, the neighborhood graph). This
    /// is internal plumbing behind curated affordances — the USER-facing query
    /// surface is the ask box, not a structured builder.
    pub async fn knowledge_query(&self, q: CompiledQuery) -> Result<KnowledgeAnswer, String> {
        let mut client = self.substrate_client().await?;
        let resp = client
            .query(Request::new(to_wire(&q)))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(KnowledgeAnswer {
            guarantee: resp.guarantee,
            rows: resp.rows,
        })
    }

    /// What the substrate holds, per source surface.
    pub async fn knowledge_overview(&self) -> Result<SubstrateOverview, String> {
        let mut client = self.substrate_client().await?;
        let o = client
            .overview(Request::new(pb::substrate::OverviewRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SubstrateOverview {
            evidence_count: o.evidence_count,
            event_count: o.event_count,
            observation_count: o.observation_count,
            knowledge_item_count: o.knowledge_item_count,
            live_resolution_count: o.live_resolution_count,
            entity_count: o.entity_count,
            actor_count: o.actor_count,
            outbox_pending: o.outbox_pending,
            outbox_dead: o.outbox_dead,
            contradiction_count: o.contradiction_count,
            earliest: ts_iso(&o.earliest),
            latest: ts_iso(&o.latest),
            sources: o
                .sources
                .into_iter()
                .map(|s| SourceHolding {
                    source_id: s.source_id,
                    evidence_count: s.evidence_count,
                    last_seen: ts_iso(&s.last_seen),
                    classification: s.classification,
                })
                .collect(),
            kinds: o
                .kinds
                .into_iter()
                .map(|k| KindCount {
                    kind: k.kind,
                    count: k.count,
                })
                .collect(),
        })
    }

    /// Browsable entities matching a substring; empty query = most recent.
    pub async fn knowledge_entities(
        &self,
        query: String,
        limit: i32,
    ) -> Result<Vec<EntityOverview>, String> {
        let mut client = self.substrate_client().await?;
        let resp = client
            .list_entities(Request::new(pb::substrate::ListEntitiesRequest {
                query,
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .entities
            .into_iter()
            .map(|e| EntityOverview {
                entity_id: e.entity_id,
                observation_count: e.observation_count,
                predicates: e.predicates,
                last_seen: ts_iso(&e.last_seen),
            })
            .collect())
    }

    /// The full agent-drafted ontology change behind an `ontology_change`
    /// approval (its object is the draft id), for the person deciding it
    /// (T-20261113-approvers-of-an-ontology-change-see-only-a-200). Operator-only
    /// on the kernel; a read, writes nothing.
    pub async fn ontology_draft(&self, draft_id: String) -> Result<OntologyDraftView, String> {
        let mut client = self.substrate_client().await?;
        let resp = client
            .get_ontology_draft(Request::new(pb::substrate::GetOntologyDraftRequest { draft_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(draft_from_wire(resp))
    }
}

/// One classified difference (`additive` | `tightening` | `breaking`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyChangeLine {
    pub class: String,
    pub subject: String,
    pub detail: String,
}

/// One kind or relation spec the draft declares, next to what is declared now
/// under that name. Specs stay JSON strings (the GetOntology shape) so a new
/// spec field never needs a Rust release; `current_json` "" = the name is new.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyDraftSpec {
    pub r#type: String,
    pub name: String,
    pub new_json: String,
    pub current_json: String,
}

/// The approver's view of one draft (substrate GetOntologyDraft).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyDraftView {
    pub draft_id: String,
    pub namespace: String,
    pub proposer: String,
    pub reason: String,
    pub created_at_unix_ms: i64,
    pub base_version: i64,
    pub class: String,
    pub changes: Vec<OntologyChangeLine>,
    pub change_json: String,
    pub specs: Vec<OntologyDraftSpec>,
    pub state: String,
    pub state_by: String,
    pub detail: String,
    pub applied_version: i64,
    pub approval_id: String,
    pub current_version: i64,
    pub dry_run_ran: bool,
    pub dry_run_class: String,
    pub dry_run_changes: Vec<OntologyChangeLine>,
    pub dry_run_refusal: String,
}

fn change_lines(v: Vec<pb::substrate::OntologyChange>) -> Vec<OntologyChangeLine> {
    v.into_iter()
        .map(|c| OntologyChangeLine { class: c.class, subject: c.subject, detail: c.detail })
        .collect()
}

fn draft_from_wire(r: pb::substrate::GetOntologyDraftResponse) -> OntologyDraftView {
    OntologyDraftView {
        draft_id: r.draft_id,
        namespace: r.namespace,
        proposer: r.proposer,
        reason: r.reason,
        created_at_unix_ms: r.created_at_unix_ms,
        base_version: r.base_version,
        class: r.class,
        changes: change_lines(r.changes),
        change_json: r.change_json,
        specs: r
            .specs
            .into_iter()
            .map(|s| OntologyDraftSpec {
                r#type: s.r#type,
                name: s.name,
                new_json: s.new_json,
                current_json: s.current_json,
            })
            .collect(),
        state: r.state,
        state_by: r.state_by,
        detail: r.detail,
        applied_version: r.applied_version,
        approval_id: r.approval_id,
        current_version: r.current_version,
        dry_run_ran: r.dry_run_ran,
        dry_run_class: r.dry_run_class,
        dry_run_changes: change_lines(r.dry_run_changes),
        dry_run_refusal: r.dry_run_refusal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every field of the approver's view survives the wire → webview mapping;
    /// the spec field `type` (a Rust keyword) serialises as "type".
    #[test]
    fn ontology_draft_maps_every_field() {
        let wire = pb::substrate::GetOntologyDraftResponse {
            draft_id: "od_1".into(),
            namespace: "ns1".into(),
            proposer: "agent:planner".into(),
            reason: "lost orders".into(),
            created_at_unix_ms: 7,
            base_version: 3,
            class: "tightening".into(),
            changes: vec![pb::substrate::OntologyChange {
                class: "tightening".into(),
                subject: "kind order.status".into(),
                detail: "enum narrowed".into(),
            }],
            change_json: "{\"kinds\":[]}".into(),
            specs: vec![pb::substrate::OntologyDraftSpec {
                r#type: "kind".into(),
                name: "order".into(),
                new_json: "{\"kind\":\"order\"}".into(),
                current_json: "".into(),
            }],
            state: "pending".into(),
            state_by: "agent:planner".into(),
            detail: "".into(),
            applied_version: 0,
            approval_id: "apr-1".into(),
            current_version: 4,
            dry_run_ran: true,
            dry_run_class: "tightening".into(),
            dry_run_changes: vec![],
            dry_run_refusal: "moved".into(),
        };
        let v = draft_from_wire(wire);
        assert_eq!(v.draft_id, "od_1");
        assert_eq!(v.base_version, 3);
        assert_eq!(v.current_version, 4);
        assert_eq!(v.changes[0].subject, "kind order.status");
        assert_eq!(v.specs[0].name, "order");
        assert!(v.dry_run_ran && v.dry_run_refusal == "moved");
        let json = serde_json::to_value(&v).unwrap();
        assert_eq!(json["specs"][0]["type"], "kind");
        assert_eq!(json["approval_id"], "apr-1");
    }

    #[test]
    fn iso_round_trips_through_the_wire_types() {
        // The webview speaks RFC-3339 and the wire speaks protobuf Timestamp;
        // a drift here would silently shift every as_of answer.
        let ts = iso_ts("2026-08-06T12:30:00Z").expect("parse");
        assert_eq!(ts.seconds, 1786019400);
        assert!(iso_ts("").is_none());
        assert!(iso_ts("yesterday").is_none());
    }

    #[test]
    fn unset_times_stay_unset_on_the_wire() {
        // A zero-value Timestamp is 1970, not "absent" — sending it would turn
        // "no window" into "since the epoch" for history/events validation.
        let q = CompiledQuery {
            kind: "current".into(),
            item_kind: "commitment".into(),
            ..Default::default()
        };
        let wire = to_wire(&q);
        assert!(wire.as_of.is_none() && wire.from.is_none() && wire.to.is_none());
    }

    /// ADR-0148: the why opt-in reaches the wire as sent, and comes back.
    #[test]
    fn correlation_fields_round_trip_the_wire() {
        let q = CompiledQuery {
            kind: "why".into(),
            entity_id: "entity:customer/C-1".into(),
            include_correlation: true,
            correlation_window_seconds: 3600,
            correlation_roles: vec!["customer".into()],
            ..Default::default()
        };
        let wire = to_wire(&q);
        assert!(wire.include_correlation);
        assert_eq!(wire.correlation_window_seconds, 3600);
        assert_eq!(wire.correlation_roles, vec!["customer".to_string()]);
        let back = from_wire(wire);
        assert!(back.include_correlation && back.correlation_window_seconds == 3600);
        // Default stays off: the stored-lineage answer is what a plain ask gets.
        assert!(!to_wire(&CompiledQuery::default()).include_correlation);
    }
}
