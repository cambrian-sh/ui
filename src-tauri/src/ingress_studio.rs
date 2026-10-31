//! The Ingress Studio plane (ADR-0112 §13) — the operator surface for the
//! full ingress lifecycle: create, secure, capture, draft, confirm, dry-run,
//! arm, pause, repair, retire.
//!
//! Mounted on the same kernel server, over the same connection and bearer
//! token as every other plane. A kernel without the studio (no Postgres, no
//! evidence capture) never advertises `ingress-studio` and this client is
//! simply never called.
//!
//! **Credentials are write-only across this whole file.** `set_credential`
//! passes the value straight through; nothing returns one, logs one, or keeps
//! one — status carries `configured` + `last_four` only. Specs travel as JSON
//! strings and are validated KERNEL-side by the same strict parsers that
//! validate hand-written specs; this file adds no second grammar.

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::ingress::ingress_studio_admin_client::IngressStudioAdminClient;

type StudioClient = IngressStudioAdminClient<InterceptedService<Channel, AuthInterceptor>>;

/// The outcome of a studio write. Refusals — a stale transition, a missing
/// reason, an unpinned arm — are authoring results carried in `error`, not
/// transport failures; the panel renders them inline beside the control.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioAck {
    pub ok: bool,
    pub error: String,
    /// What succeeded and what it left undone.
    pub detail: String,
}

/// One ingress row for the rail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioIngress {
    pub ingress_id: String,
    pub display_name: String,
    pub state: String,
    pub health: String,
    pub pinned_release: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioCredential {
    pub name: String,
    pub configured: bool,
    /// Presence indicator only — never the value.
    pub last_four: String,
}

/// The operator's whole picture of one ingress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioStatus {
    pub summary: StudioIngress,
    pub latest_transport_revision: i32,
    pub latest_mapping_revision: i32,
    pub release_id: String,
    pub armed_transport_revision: i32,
    pub armed_mapping_revision: i32,
    pub capture_samples: i32,
    pub failure_count: i32,
    pub credentials: Vec<StudioCredential>,
    pub egress_policy_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioSaveResult {
    pub ok: bool,
    pub error: String,
    pub revision: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioSpec {
    pub ok: bool,
    pub error: String,
    pub revision: i32,
    pub spec_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioFieldChange {
    pub target: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioDiff {
    pub ok: bool,
    pub error: String,
    pub added: Vec<StudioFieldChange>,
    pub removed: Vec<StudioFieldChange>,
    pub changed: Vec<StudioFieldChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioDraft {
    pub ok: bool,
    pub error: String,
    pub spec_json: String,
    pub abstained: String,
    pub corrections: i32,
    pub first_draft_accepted: bool,
    pub coverage_json: String,
    /// Per-field decisions the drafter declined to make while still proposing a
    /// mapping for the rest. These arrive WITH a spec, unlike `abstained`,
    /// which is the whole draft.
    pub field_abstentions: Vec<StudioFieldAbstention>,
}

/// One field the drafter would not guess at.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioFieldAbstention {
    pub path: String,
    /// The drafter's own words, shown verbatim on the review row.
    pub reason: String,
    /// The readings it was choosing between; these become the operator's buttons.
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioCaptureStatus {
    pub samples: i32,
    pub profile_json: String,
}

/// Real deliveries, redacted at capture, newest first.
///
/// `total` is the whole capture window rather than `bodies.len()`: the list is
/// capped for transport, and reporting the cap as the total would quietly shrink
/// the evidence base the operator is being asked to trust.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioCaptureSamples {
    pub bodies_json: Vec<String>,
    pub total: i32,
}

/// ADR-0115 Source Discovery.
///
/// The five calls are separate because the CAPABILITIES are separate:
/// `approve_origin` is not implied by `run`, and `accept_proposal` is not
/// implied by `answer`. Collapsing them into one "do discovery" command here
/// would put the split back together at the only layer an operator touches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryFinding {
    pub field: String,
    pub proposed_value: String,
    /// observed | documented | inferred | assumed | operator_confirmed.
    /// The console renders the first two as fact and the rest as candidates, so
    /// the distinction has to survive the wire.
    pub status: String,
    pub confidence: f64,
    pub rule_id: String,
    pub evidence_refs: Vec<String>,
    pub explanation: String,
    pub observed_at: String,
    pub bounds_min: i32,
    pub bounds_max: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryGap {
    pub field: String,
    pub why: String,
    /// A gap no further probing can close, because the transport schema cannot
    /// express the answer. Renders as a refusal, not as a to-do.
    pub refusal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryQuestion {
    pub id: String,
    pub shape: String,
    pub prompt: String,
    pub options: Vec<String>,
    pub path: String,
    pub status: String,
    pub asked_at_revision: i32,
    pub version: i32,
    /// Generated downstream of content Cambrian did not author. Marked so
    /// "paste your token here" can never look like it originated here.
    pub from_untrusted: bool,
    pub auth_scheme_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryProposal {
    pub revision: i32,
    pub archetype: String,
    pub protocol: String,
    pub format: String,
    pub cadence_seconds: i32,
    /// The operator's own words the cadence was derived from.
    pub cadence_because: String,
    pub collection_root: String,
    pub cursor_path: String,
    pub cursor_param: String,
    /// body | header | link; empty reads as body.
    pub cursor_source: String,
    pub auth_scheme_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverySession {
    pub ok: bool,
    pub error: String,
    pub session_id: String,
    /// proposed | abstained | budget_exhausted | policy_refused. Every one is a
    /// terminal SUCCESS: the session stopped saying something true.
    pub outcome: String,
    pub reason: String,
    pub findings: Vec<DiscoveryFinding>,
    pub gaps: Vec<DiscoveryGap>,
    pub questions: Vec<DiscoveryQuestion>,
    pub proposal: Option<DiscoveryProposal>,
    pub pending_origins: Vec<String>,
    pub requests_used: i32,
    pub model_calls_used: i32,
    /// True while the loop is still going. A session that researches an API runs
    /// for minutes, so the console shows work in progress rather than a frozen
    /// button.
    pub running: bool,
    /// The trajectory so far, appended as it happens.
    pub steps: Vec<DiscoveryStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryStep {
    pub n: i32,
    pub action: String,
    pub summary: String,
    pub refusal: String,
    pub observed_ref: String,
    pub at: String,
    /// The step being executed right now. Without it a slow model call is
    /// indistinguishable from a hung session.
    pub in_flight: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioPreviewEntry {
    pub delivery_ref: String,
    pub received_at: String,
    pub outcome: String,
    pub detail: String,
    pub envelopes_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioFailure {
    pub evidence_id: String,
    pub delivery_ref: String,
    pub mapping_revision: i32,
    pub outcome: String,
    pub detail: String,
    pub finished_at: String,
}

fn ack(a: pb::ingress::Ack) -> StudioAck {
    StudioAck { ok: a.ok, error: a.error, detail: a.detail }
}

fn field_changes(cs: Vec<pb::ingress::FieldChange>) -> Vec<StudioFieldChange> {
    cs.into_iter()
        .map(|c| StudioFieldChange { target: c.target, from: c.from, to: c.to })
        .collect()
}

impl Transport {
    async fn studio_client(&self) -> Result<StudioClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(IngressStudioAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    pub async fn studio_create_ingress(
        &self,
        ingress_id: String,
        display_name: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .create_ingress(Request::new(pb::ingress::CreateIngressRequest { ingress_id, display_name }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_list_ingresses(&self) -> Result<Vec<StudioIngress>, String> {
        let mut client = self.studio_client().await?;
        let resp = client
            .list_ingresses(Request::new(pb::ingress::ListIngressesRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .ingresses
            .into_iter()
            .map(|i| StudioIngress {
                ingress_id: i.ingress_id,
                display_name: i.display_name,
                state: i.state,
                health: i.health,
                pinned_release: i.pinned_release,
            })
            .collect())
    }

    pub async fn studio_get_ingress(&self, ingress_id: String) -> Result<StudioStatus, String> {
        let mut client = self.studio_client().await?;
        let s = client
            .get_ingress(Request::new(pb::ingress::IngressRef { ingress_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        let summary = s.summary.unwrap_or_default();
        Ok(StudioStatus {
            summary: StudioIngress {
                ingress_id: summary.ingress_id,
                display_name: summary.display_name,
                state: summary.state,
                health: summary.health,
                pinned_release: summary.pinned_release,
            },
            latest_transport_revision: s.latest_transport_revision,
            latest_mapping_revision: s.latest_mapping_revision,
            release_id: s.release_id,
            armed_transport_revision: s.armed_transport_revision,
            armed_mapping_revision: s.armed_mapping_revision,
            capture_samples: s.capture_samples,
            failure_count: s.failure_count,
            credentials: s
                .credentials
                .into_iter()
                .map(|c| StudioCredential {
                    name: c.name,
                    configured: c.configured,
                    last_four: c.last_four,
                })
                .collect(),
            egress_policy_json: s.egress_policy_json,
        })
    }

    /// One helper for every lifecycle verb that is (ingress_id, reason) →
    /// Ack: the state machine kernel-side decides legality, the panel just
    /// renders the named refusal.
    pub async fn studio_lifecycle(
        &self,
        verb: String,
        ingress_id: String,
        reason: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let req = pb::ingress::TransitionRequest { ingress_id, reason };
        let a = match verb.as_str() {
            "start_capture" => client.start_capture(Request::new(req)).await,
            "confirm_mapping" => client.confirm_mapping(Request::new(req)).await,
            "start_dry_run" => client.start_dry_run(Request::new(req)).await,
            "pause" => client.pause(Request::new(req)).await,
            "resume" => client.resume(Request::new(req)).await,
            "retire" => client.retire(Request::new(req)).await,
            other => return Err(format!("unknown lifecycle verb {other}")),
        }
        .map_err(map_status)?
        .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_arm(
        &self,
        ingress_id: String,
        transport_revision: i32,
        mapping_revision: i32,
        reason: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .arm(Request::new(pb::ingress::ArmRequest {
                ingress_id,
                transport_revision,
                mapping_revision,
                // History-lane field newly vendored by the proto sync; 0 is the
                // wire default (no history transport pinned) — the console does
                // not arm history transports yet.
                history_transport_revision: 0,
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_rollback(
        &self,
        ingress_id: String,
        release_id: String,
        reason: String,
        resume: bool,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .rollback(Request::new(pb::ingress::RollbackRequest {
                ingress_id,
                release_id,
                reason,
                resume,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_save_spec(
        &self,
        kind: String,
        ingress_id: String,
        spec_json: String,
    ) -> Result<StudioSaveResult, String> {
        let mut client = self.studio_client().await?;
        let req = pb::ingress::SaveSpecRequest { ingress_id, spec_json };
        let r = match kind.as_str() {
            "transport" => client.save_transport_spec(Request::new(req)).await,
            "mapping" => client.save_mapping_spec(Request::new(req)).await,
            other => return Err(format!("unknown spec kind {other}")),
        }
        .map_err(map_status)?
        .into_inner();
        Ok(StudioSaveResult { ok: r.ok, error: r.error, revision: r.revision })
    }

    pub async fn studio_get_revision(
        &self,
        kind: String,
        ingress_id: String,
        revision: i32,
    ) -> Result<StudioSpec, String> {
        let mut client = self.studio_client().await?;
        let req = pb::ingress::RevisionRef { ingress_id, revision };
        let r = match kind.as_str() {
            "transport" => client.get_transport_revision(Request::new(req)).await,
            "mapping" => client.get_mapping_revision(Request::new(req)).await,
            other => return Err(format!("unknown spec kind {other}")),
        }
        .map_err(map_status)?
        .into_inner();
        Ok(StudioSpec { ok: r.ok, error: r.error, revision: r.revision, spec_json: r.spec_json })
    }

    pub async fn studio_diff_mapping(
        &self,
        ingress_id: String,
        from_revision: i32,
        to_revision: i32,
    ) -> Result<StudioDiff, String> {
        let mut client = self.studio_client().await?;
        let d = client
            .diff_mapping_revisions(Request::new(pb::ingress::DiffRequest {
                ingress_id,
                from_revision,
                to_revision,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioDiff {
            ok: d.ok,
            error: d.error,
            added: field_changes(d.added),
            removed: field_changes(d.removed),
            changed: field_changes(d.changed),
        })
    }

    pub async fn studio_draft_mapping(
        &self,
        ingress_id: String,
        guidance: String,
        base_spec_json: String,
    ) -> Result<StudioDraft, String> {
        // base_spec_json non-empty = REVISE that mapping per the guidance (the
        // "what is wrong with this mapping" box finally means what it says);
        // empty keeps the from-scratch draft.
        let mut client = self.studio_client().await?;
        let d = client
            .draft_mapping(Request::new(pb::ingress::DraftRequest {
                ingress_id,
                guidance,
                base_spec_json,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioDraft {
            ok: d.ok,
            error: d.error,
            spec_json: d.spec_json,
            abstained: d.abstained,
            corrections: d.corrections,
            first_draft_accepted: d.first_draft_accepted,
            coverage_json: d.coverage_json,
            field_abstentions: d
                .field_abstentions
                .into_iter()
                .map(|f| StudioFieldAbstention {
                    path: f.path,
                    reason: f.reason,
                    options: f.options,
                })
                .collect(),
        })
    }

    pub async fn studio_capture_status(&self, ingress_id: String) -> Result<StudioCaptureStatus, String> {
        let mut client = self.studio_client().await?;
        let c = client
            .get_capture_status(Request::new(pb::ingress::IngressRef { ingress_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioCaptureStatus { samples: c.samples, profile_json: c.profile_json })
    }

    pub async fn studio_capture_samples(
        &self,
        ingress_id: String,
        limit: i32,
    ) -> Result<StudioCaptureSamples, String> {
        let mut client = self.studio_client().await?;
        let c = client
            .list_capture_samples(Request::new(pb::ingress::CaptureSamplesRequest {
                ingress_id,
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioCaptureSamples { bodies_json: c.bodies_json, total: c.total })
    }

    pub async fn studio_start_discovery(
        &self,
        ingress_id: String,
        intent: String,
        endpoint: String,
    ) -> Result<DiscoverySession, String> {
        let mut client = self.studio_client().await?;
        let r = client
            .start_discovery(Request::new(pb::ingress::StartDiscoveryRequest {
                ingress_id,
                intent,
                endpoint,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(discovery_session_from(r))
    }

    pub async fn studio_get_discovery(
        &self,
        ingress_id: String,
        session_id: String,
    ) -> Result<DiscoverySession, String> {
        let mut client = self.studio_client().await?;
        let r = client
            .get_discovery_session(Request::new(pb::ingress::DiscoverySessionRef {
                ingress_id,
                session_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(discovery_session_from(r))
    }

    pub async fn studio_answer_discovery(
        &self,
        ingress_id: String,
        session_id: String,
        question_id: String,
        answer: String,
        expected_version: i32,
        proposal_revision: i32,
        idempotency_key: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .answer_discovery_question(Request::new(
                pb::ingress::AnswerDiscoveryQuestionRequest {
                    ingress_id,
                    session_id,
                    question_id,
                    answer,
                    expected_version,
                    proposal_revision,
                    idempotency_key,
                    rebase: false,
                },
            ))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioAck { ok: a.ok, error: a.error, detail: a.detail })
    }

    /// Its own call because it is its own right: a newly discovered origin is
    /// never pre-approved, and the grant is exact — scheme, host AND port.
    pub async fn studio_approve_origin(
        &self,
        ingress_id: String,
        session_id: String,
        scheme: String,
        host: String,
        port: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .approve_discovery_origin(Request::new(
                pb::ingress::ApproveDiscoveryOriginRequest {
                    ingress_id,
                    session_id,
                    scheme,
                    host,
                    port,
                },
            ))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioAck { ok: a.ok, error: a.error, detail: a.detail })
    }

    pub async fn studio_accept_discovery(
        &self,
        ingress_id: String,
        session_id: String,
    ) -> Result<StudioSaveResult, String> {
        let mut client = self.studio_client().await?;
        let r = client
            .accept_discovery_proposal(Request::new(pb::ingress::DiscoverySessionRef {
                ingress_id,
                session_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioSaveResult { ok: r.ok, error: r.error, revision: r.revision })
    }

    /// Send the operator's own words back to the discovery agent.
    ///
    /// Not an accept and not a reject. A proposal usually arrives with one field
    /// wrong and the rest right, and neither existing verb covers that: reject
    /// discards a run that already asked a human questions, accept arms the
    /// mistake. The comment re-enters the agent, which revises.
    pub async fn studio_comment_discovery(
        &self,
        ingress_id: String,
        session_id: String,
        comment: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let r = client
            .comment_on_proposal(Request::new(pb::ingress::CommentOnProposalRequest {
                ingress_id,
                session_id,
                comment,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(StudioAck { ok: r.ok, error: r.error, detail: r.detail })
    }

    pub async fn studio_preview(&self, ingress_id: String) -> Result<Vec<StudioPreviewEntry>, String> {
        let mut client = self.studio_client().await?;
        let p = client
            .get_preview(Request::new(pb::ingress::IngressRef { ingress_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(p.entries
            .into_iter()
            .map(|e| StudioPreviewEntry {
                delivery_ref: e.delivery_ref,
                received_at: e.received_at,
                outcome: e.outcome,
                detail: e.detail,
                envelopes_json: e.envelopes_json,
            })
            .collect())
    }

    pub async fn studio_shadow_reprocess(
        &self,
        ingress_id: String,
        mapping_revision: i32,
        limit: i32,
    ) -> Result<String, String> {
        let mut client = self.studio_client().await?;
        let r = client
            .shadow_reprocess(Request::new(pb::ingress::ReprocessRequest {
                ingress_id,
                mapping_revision,
                limit,
                reason: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        if !r.ok {
            return Err(r.error);
        }
        Ok(r.preview_json)
    }

    pub async fn studio_promote_repair(
        &self,
        ingress_id: String,
        mapping_revision: i32,
        limit: i32,
        reason: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .promote_repair(Request::new(pb::ingress::ReprocessRequest {
                ingress_id,
                mapping_revision,
                limit,
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    /// Store a credential. The value passes straight through — never retained,
    /// echoed, or logged on this side.
    pub async fn studio_set_credential(
        &self,
        ingress_id: String,
        name: String,
        value: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .set_credential(Request::new(pb::ingress::SetCredentialRequest { ingress_id, name, value }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_clear_credential(
        &self,
        ingress_id: String,
        name: String,
        reason: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .clear_credential(Request::new(pb::ingress::ClearCredentialRequest { ingress_id, name, reason }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_set_egress_policy(
        &self,
        ingress_id: String,
        policy_json: String,
    ) -> Result<StudioAck, String> {
        let mut client = self.studio_client().await?;
        let a = client
            .set_egress_policy(Request::new(pb::ingress::SetEgressPolicyRequest { ingress_id, policy_json }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack(a))
    }

    pub async fn studio_delivery_failures(&self, ingress_id: String) -> Result<Vec<StudioFailure>, String> {
        let mut client = self.studio_client().await?;
        let f = client
            .list_delivery_failures(Request::new(pb::ingress::IngressRef { ingress_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(f.failures
            .into_iter()
            .map(|x| StudioFailure {
                evidence_id: x.evidence_id,
                delivery_ref: x.delivery_ref,
                mapping_revision: x.mapping_revision,
                outcome: x.outcome,
                detail: x.detail,
                finished_at: x.finished_at,
            })
            .collect())
    }
}


/// Maps the proto session onto the UI shape.
///
/// Written out rather than derived so the epistemic status, the refusal flag and
/// the untrusted marker are each visibly carried. Those three are the fields the
/// console renders differently, and a silent rename would degrade them to
/// ordinary text without anything failing.
fn discovery_session_from(r: pb::ingress::DiscoverySession) -> DiscoverySession {
    DiscoverySession {
        running: r.running,
        steps: r
            .steps
            .into_iter()
            .map(|s| DiscoveryStep {
                n: s.n,
                action: s.action,
                summary: s.summary,
                refusal: s.refusal,
                observed_ref: s.observed_ref,
                at: s.at,
                in_flight: s.in_flight,
            })
            .collect(),
        ok: r.ok,
        error: r.error,
        session_id: r.session_id,
        outcome: r.outcome,
        reason: r.reason,
        findings: r
            .findings
            .into_iter()
            .map(|f| DiscoveryFinding {
                field: f.field,
                proposed_value: f.proposed_value,
                status: f.status,
                confidence: f.confidence,
                rule_id: f.rule_id,
                evidence_refs: f.evidence_refs,
                explanation: f.explanation,
                observed_at: f.observed_at,
                bounds_min: f.bounds_min,
                bounds_max: f.bounds_max,
            })
            .collect(),
        gaps: r
            .gaps
            .into_iter()
            .map(|g| DiscoveryGap { field: g.field, why: g.why, refusal: g.refusal })
            .collect(),
        questions: r
            .questions
            .into_iter()
            .map(|q| DiscoveryQuestion {
                id: q.id,
                shape: q.shape,
                prompt: q.prompt,
                options: q.options,
                path: q.path,
                status: q.status,
                asked_at_revision: q.asked_at_revision,
                version: q.version,
                from_untrusted: q.from_untrusted,
                auth_scheme_ref: q.auth_scheme_ref,
            })
            .collect(),
        proposal: r.proposal.map(|p| DiscoveryProposal {
            revision: p.revision,
            archetype: p.archetype,
            protocol: p.protocol,
            format: p.format,
            cadence_seconds: p.cadence_seconds,
            cadence_because: p.cadence_because.clone(),
            collection_root: p.collection_root,
            cursor_path: p.cursor_path,
            cursor_param: p.cursor_param,
            cursor_source: p.cursor_source,
            auth_scheme_ref: p.auth_scheme_ref,
        }),
        pending_origins: r.pending_origins,
        requests_used: r.requests_used,
        model_calls_used: r.model_calls_used,
    }
}
