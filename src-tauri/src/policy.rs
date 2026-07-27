//! The access-policy plane (ADR-0085 / 0086 / 0087) — the UI's first premium surface.
//!
//! Two planes are involved and they are not the same thing:
//!
//! - **`OperatorConsole`** (the pinned OSS contract) carries `ExplainAccess` and
//!   `ListClassificationTags`. These are what the KERNEL must be able to answer for
//!   itself, so they live in the OSS contract and work against any kernel that
//!   serves contract `0066`.
//! - **`AccessPolicyAdmin`** (premium's own proto) carries groups, policy objects,
//!   links, What-If, and the audit export. Those are the product, so they live on
//!   premium's plane, mounted on the same server behind the same operator auth
//!   interceptors (ADR-0073/0088).
//!
//! **How the UI decides whether any of this exists.** The kernel advertises the
//! `access-policy` capability on the handshake when the plugin is active (ADR-0082
//! D2: the kernel forwards a plugin's capability strings without interpreting
//! them). The webview gates on that string, exactly as it already gates `chat` and
//! `memory-answer`. Every RPC here answers `Unimplemented` on a kernel without the
//! plugin — so the gate is a courtesy that produces a good empty state, and the
//! failure mode if someone skips it is a clean error rather than bad data.

use tauri::AppHandle;
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::pb::authz::access_policy_admin_client::AccessPolicyAdminClient;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

type PolicyClient = AccessPolicyAdminClient<InterceptedService<Channel, AuthInterceptor>>;

// ---- DTOs -----------------------------------------------------------------
//
// `invoke<T>()` on the webview side is an UNCHECKED cast, so these shapes must
// stay identical to `src/ipc/types.ts`. They are deliberately flat strings rather
// than the proto's nested optionals: the webview renders them, it does not
// recompute policy from them.

/// One policy, linked at one container, contributing one term. This is what turns
/// a denial from "no" into "because policy P, linked at L, contributed tag T".
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PolicyContribution {
    pub policy_id: String,
    pub policy_name: String,
    /// `organisation` | `group:<id>` | `principal:<id>` | `surface:<id>`
    pub linked_at: String,
    /// `required` | `any_of` | `forbidden` | `effect`
    pub term: String,
    pub values: Vec<String>,
    pub enforced: bool,
}

/// A structured, explainable access decision.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AccessDecision {
    pub allowed: bool,
    pub reason: String,
    /// The SPECIFIC tag, clause, or effect responsible — what makes the reason
    /// actionable rather than merely true.
    pub detail: String,
    pub decided_by: Vec<PolicyContribution>,
    pub policy_version: String,
    pub report_only: bool,
    pub would_have_denied: bool,
    /// One administrator-readable sentence, rendered kernel-side so a surface that
    /// only knows how to show a string still shows something useful.
    pub explain: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ScopeRule {
    pub required_tags: Vec<String>,
    pub any_of_tags: Vec<String>,
    pub forbidden_tags: Vec<String>,
    /// Reopens a CLOSED tag (ADR-0091). The only term that adds access rather than
    /// removing it, and the kernel refuses it on an open tag — so the editor must
    /// offer closed tags only, or the author gets a rejection they cannot explain.
    #[serde(default)]
    pub granted_tags: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct EffectRule {
    /// Empty means every effect (subject to `deny`).
    pub allow: Vec<String>,
    /// Always wins, consistent with forbidden tags being absolute.
    pub deny: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GroupSpec {
    pub id: String,
    pub name: String,
    pub members: Vec<String>,
    pub subgroups: Vec<String>,
    pub block_inheritance: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PolicySpec {
    pub id: String,
    pub name: String,
    pub version: i32,
    pub rule: ScopeRule,
    pub effects: EffectRule,
    /// `enforced` | `report_only`
    pub mode: String,
    pub expires_at_unix_ms: i64,
    pub granted_by: String,
    pub updated_at_unix_ms: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LinkSpec {
    pub policy_id: String,
    /// `organisation` | `group` | `principal` | `surface`, in application order.
    pub container_kind: String,
    pub target_id: String,
    pub enforced: bool,
    pub order: i32,
    pub expires_at_unix_ms: i64,
    pub granted_by: String,
}

/// `gpresult` for a principal: the effective predicate AND its attribution.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ResultantPolicy {
    pub effective: ScopeRule,
    /// CNF: each clause is an OR-set, all clauses ANDed.
    pub any_of_clauses: Vec<Vec<String>>,
    pub contributions: Vec<PolicyContribution>,
    pub effects: EffectRule,
    pub policy_version: String,
    /// Set when the effective predicate can never match anything. A SAFE state
    /// (zero rows) and therefore the easiest one to mistake for "there is no
    /// data", so it is stated rather than implied.
    pub unsatisfiable_reason: String,
    /// The containers the principal resolved into, outermost first.
    pub groups: Vec<String>,
}

/// One journalled decision replayed through a draft policy set.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SimulatedDecision {
    pub principal: String,
    pub surface: String,
    pub resource: String,
    pub tags: Vec<String>,
    pub allowed_now: bool,
    pub allowed_under_draft: bool,
    pub reason_under_draft: String,
    pub detail_under_draft: String,
    pub at_unix_ms: i64,
}

/// The blast radius of a draft.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SimulationResult {
    pub decisions: Vec<SimulatedDecision>,
    /// Allowed today, denied under the draft — the number an administrator
    /// actually looks at.
    pub newly_denied: i32,
    pub newly_allowed: i32,
    pub unchanged: i32,
}

/// One reason a proposal is not safe to apply as it stands. `severity` is
/// `blocking` or `warning` — data, so the console sorts and colours without
/// parsing sentences.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProposalProblem {
    pub severity: String,
    pub message: String,
}

/// A policy drafted from a description, with everything needed to judge it.
/// Nothing here is applied: approving means calling `save_policy` and
/// `link_policy`, the same two commands an operator uses by hand.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PolicyProposal {
    /// The model's explanation, shown as context. NOT the thing being approved.
    pub rationale: String,
    pub policy: PolicySpec,
    pub links: Vec<LinkSpec>,
    pub problems: Vec<ProposalProblem>,
    pub simulation: SimulationResult,
    /// How many journalled decisions the simulation replayed. Zero counts over an
    /// empty journal mean "nothing to compare", not "no effect" — the console has
    /// to say which of the two it is showing.
    pub simulation_basis: i32,
    /// Server-computed, so a client cannot disagree about whether this is safe.
    pub blocking: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DecisionRecord {
    pub at_unix_ms: i64,
    pub principal: String,
    pub surface: String,
    pub resource: String,
    pub allowed: bool,
    pub reason: String,
    pub detail: String,
    pub policy_version: String,
    pub report_only: bool,
    pub would_have_denied: bool,
    pub decided_by: Vec<PolicyContribution>,
}

/// An authoring outcome that is NOT an error: a group cycle, an unsatisfiable
/// rule, a tag outside the vocabulary. The kernel returns these inline so a form
/// can render them next to the field, rather than as a transport failure the UI
/// has to translate.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SaveOutcome {
    pub ok: bool,
    pub error: String,
    pub version: i32,
}

// ---- conversions ----------------------------------------------------------

fn contribs(v: Vec<pb::authz::PolicyTermOp>) -> Vec<PolicyContribution> {
    v.into_iter()
        .map(|c| PolicyContribution {
            policy_id: c.policy_id,
            policy_name: c.policy_name,
            linked_at: c.linked_at,
            term: c.term,
            values: c.values,
            enforced: c.enforced,
        })
        .collect()
}

fn scope_rule(r: Option<pb::authz::ScopeRule>) -> ScopeRule {
    r.map(|r| ScopeRule {
        required_tags: r.required_tags,
        any_of_tags: r.any_of_tags,
        forbidden_tags: r.forbidden_tags,
        granted_tags: r.granted_tags,
    })
    .unwrap_or_default()
}

fn effect_rule(r: Option<pb::authz::EffectRule>) -> EffectRule {
    r.map(|r| EffectRule {
        allow: r.allow,
        deny: r.deny,
    })
    .unwrap_or_default()
}

impl From<pb::AccessDecisionOp> for AccessDecision {
    fn from(d: pb::AccessDecisionOp) -> Self {
        AccessDecision {
            allowed: d.allowed,
            reason: d.reason,
            detail: d.detail,
            decided_by: d
                .decided_by
                .into_iter()
                .map(|c| PolicyContribution {
                    policy_id: c.policy_id,
                    policy_name: c.policy_name,
                    linked_at: c.linked_at,
                    term: c.term,
                    values: c.values,
                    enforced: c.enforced,
                })
                .collect(),
            policy_version: d.policy_version,
            report_only: d.report_only,
            would_have_denied: d.would_have_denied,
            explain: d.explain,
        }
    }
}

impl From<pb::authz::PolicySpec> for PolicySpec {
    fn from(p: pb::authz::PolicySpec) -> Self {
        PolicySpec {
            id: p.id,
            name: p.name,
            version: p.version,
            rule: scope_rule(p.rule),
            effects: effect_rule(p.effects),
            mode: p.mode,
            expires_at_unix_ms: p.expires_at_unix_ms,
            granted_by: p.granted_by,
            updated_at_unix_ms: p.updated_at_unix_ms,
        }
    }
}

impl From<PolicySpec> for pb::authz::PolicySpec {
    fn from(p: PolicySpec) -> Self {
        pb::authz::PolicySpec {
            id: p.id,
            name: p.name,
            version: p.version,
            rule: Some(pb::authz::ScopeRule {
                required_tags: p.rule.required_tags,
                any_of_tags: p.rule.any_of_tags,
                forbidden_tags: p.rule.forbidden_tags,
                granted_tags: p.rule.granted_tags,
            }),
            effects: Some(pb::authz::EffectRule {
                allow: p.effects.allow,
                deny: p.effects.deny,
            }),
            mode: p.mode,
            expires_at_unix_ms: p.expires_at_unix_ms,
            granted_by: p.granted_by,
            updated_at_unix_ms: p.updated_at_unix_ms,
        }
    }
}

impl From<pb::authz::LinkSpec> for LinkSpec {
    fn from(l: pb::authz::LinkSpec) -> Self {
        LinkSpec {
            policy_id: l.policy_id,
            container_kind: l.container_kind,
            target_id: l.target_id,
            enforced: l.enforced,
            order: l.order,
            expires_at_unix_ms: l.expires_at_unix_ms,
            granted_by: l.granted_by,
        }
    }
}

impl From<LinkSpec> for pb::authz::LinkSpec {
    fn from(l: LinkSpec) -> Self {
        pb::authz::LinkSpec {
            policy_id: l.policy_id,
            container_kind: l.container_kind,
            target_id: l.target_id,
            enforced: l.enforced,
            order: l.order,
            expires_at_unix_ms: l.expires_at_unix_ms,
            granted_by: l.granted_by,
        }
    }
}

// ---- transport ------------------------------------------------------------

impl Transport {
    /// The premium policy-administration client, over the SAME connection and
    /// bearer token as the operator console.
    async fn policy_client(&self) -> Result<PolicyClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(AccessPolicyAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    // ---- OSS contract: explain + vocabulary --------------------------------

    /// Answer "why can / can't this principal reach this?" WITHOUT performing the
    /// access. Asking must never be the thing that changes the answer, so this is
    /// a read with no command_id and no audit mutation.
    #[allow(clippy::too_many_arguments)]
    pub async fn explain_access(
        &self,
        principal_id: String,
        principal_kind: String,
        surface_kind: String,
        surface_id: String,
        resource_kind: String,
        resource_id: String,
        tags: Vec<String>,
        effects: Vec<String>,
    ) -> Result<AccessDecision, String> {
        let mut client = self.client().await?;
        let resp = client
            .explain_access(Request::new(pb::ExplainAccessOpRequest {
                principal_id,
                principal_kind,
                surface_kind,
                surface_id,
                resource_kind,
                resource_id,
                tags,
                effects,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        resp.decision
            .map(AccessDecision::from)
            .ok_or_else(|| "kernel returned no decision".to_string())
    }

    /// The controlled classification vocabulary, so the UI can offer SELECTION.
    /// A free-text tag field is a defect: a typo is the primary route to a scope
    /// that silently matches nothing (ADR-0085 D11).
    pub async fn list_classification_tags(&self) -> Result<Vec<String>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_classification_tags(Request::new(pb::ListClassificationTagsOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.tags)
    }

    // ---- premium plane: groups ---------------------------------------------

    pub async fn list_groups(&self) -> Result<Vec<GroupSpec>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .list_groups(Request::new(pb::authz::ListGroupsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .groups
            .into_iter()
            .map(|g| GroupSpec {
                id: g.id,
                name: g.name,
                members: g.members,
                subgroups: g.subgroups,
                block_inheritance: g.block_inheritance,
            })
            .collect())
    }

    /// Create or replace a group. A nesting cycle comes back in `error` rather
    /// than as a transport failure — it is a normal authoring outcome a form
    /// renders inline, and the message carries the offending path.
    pub async fn save_group(&self, group: GroupSpec) -> Result<SaveOutcome, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .save_group(Request::new(pb::authz::SaveGroupRequest {
                group: Some(pb::authz::GroupSpec {
                    id: group.id,
                    name: group.name,
                    members: group.members,
                    subgroups: group.subgroups,
                    block_inheritance: group.block_inheritance,
                }),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SaveOutcome {
            ok: resp.ok,
            error: resp.error,
            version: 0,
        })
    }

    pub async fn delete_group(&self, id: String) -> Result<(), String> {
        let mut client = self.policy_client().await?;
        client
            .delete_group(Request::new(pb::authz::DeleteGroupRequest { id }))
            .await
            .map_err(map_status)?;
        Ok(())
    }

    // ---- premium plane: policies -------------------------------------------

    pub async fn list_policies(&self) -> Result<Vec<PolicySpec>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .list_policies(Request::new(pb::authz::ListPoliciesRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.policies.into_iter().map(PolicySpec::from).collect())
    }

    /// Save a policy. An unsatisfiable rule or a tag outside the vocabulary comes
    /// back in `error`: the administrator is told at SAVE time rather than
    /// discovering it through an empty result three days later (ADR-0085 D14).
    pub async fn save_policy(&self, policy: PolicySpec) -> Result<SaveOutcome, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .save_policy(Request::new(pb::authz::SavePolicyRequest {
                policy: Some(policy.into()),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SaveOutcome {
            ok: resp.ok,
            error: resp.error,
            version: resp.version,
        })
    }

    pub async fn delete_policy(&self, id: String) -> Result<(), String> {
        let mut client = self.policy_client().await?;
        client
            .delete_policy(Request::new(pb::authz::DeletePolicyRequest { id }))
            .await
            .map_err(map_status)?;
        Ok(())
    }

    // ---- premium plane: links ----------------------------------------------

    pub async fn list_links(&self) -> Result<Vec<LinkSpec>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .list_links(Request::new(pb::authz::ListLinksRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.links.into_iter().map(LinkSpec::from).collect())
    }

    pub async fn link_policy(&self, link: LinkSpec) -> Result<(), String> {
        let mut client = self.policy_client().await?;
        client
            .link_policy(Request::new(pb::authz::LinkPolicyRequest {
                link: Some(link.into()),
            }))
            .await
            .map_err(map_status)?;
        Ok(())
    }

    pub async fn unlink_policy(
        &self,
        policy_id: String,
        container_kind: String,
        target_id: String,
    ) -> Result<(), String> {
        let mut client = self.policy_client().await?;
        client
            .unlink_policy(Request::new(pb::authz::UnlinkPolicyRequest {
                policy_id,
                container_kind,
                target_id,
            }))
            .await
            .map_err(map_status)?;
        Ok(())
    }

    // ---- premium plane: rollout --------------------------------------------

    /// The effective policy for a principal AND which link produced each term.
    pub async fn resultant_policy(
        &self,
        principal_id: String,
        principal_kind: String,
        surface_kind: String,
        surface_id: String,
    ) -> Result<ResultantPolicy, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .resultant_policy(Request::new(pb::authz::ResultantPolicyRequest {
                principal_id,
                principal_kind,
                surface_kind,
                surface_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ResultantPolicy {
            effective: scope_rule(resp.effective),
            any_of_clauses: resp
                .any_of_clauses
                .into_iter()
                .map(|c| c.any_of_tags)
                .collect(),
            contributions: contribs(resp.contributions),
            effects: effect_rule(resp.effects),
            policy_version: resp.policy_version,
            unsatisfiable_reason: resp.unsatisfiable_reason,
            groups: resp.groups,
        })
    }

    /// "What would change if I enabled this?", answered against REAL journalled
    /// history. Nothing is persisted and the simulation is not itself journalled.
    pub async fn simulate_policy(
        &self,
        draft_policies: Vec<PolicySpec>,
        draft_links: Vec<LinkSpec>,
        limit: i32,
    ) -> Result<SimulationResult, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .simulate_policy(Request::new(pb::authz::SimulatePolicyRequest {
                draft_policies: draft_policies.into_iter().map(Into::into).collect(),
                draft_links: draft_links.into_iter().map(Into::into).collect(),
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SimulationResult {
            decisions: resp
                .decisions
                .into_iter()
                .map(|d| SimulatedDecision {
                    principal: d.principal,
                    surface: d.surface,
                    resource: d.resource,
                    tags: d.tags,
                    allowed_now: d.allowed_now,
                    allowed_under_draft: d.allowed_under_draft,
                    reason_under_draft: d.reason_under_draft,
                    detail_under_draft: d.detail_under_draft,
                    at_unix_ms: d.at_unix_ms,
                })
                .collect(),
            newly_denied: resp.newly_denied,
            newly_allowed: resp.newly_allowed,
            unchanged: resp.unchanged,
        })
    }

    /// The decision journal, for audit. Denials are never sampled kernel-side, so
    /// a denials-only export is complete by construction.
    pub async fn export_decisions(
        &self,
        limit: i32,
        denials_only: bool,
    ) -> Result<Vec<DecisionRecord>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .export_decisions(Request::new(pb::authz::ExportDecisionsRequest {
                limit,
                denials_only,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .records
            .into_iter()
            .map(|r| DecisionRecord {
                at_unix_ms: r.at_unix_ms,
                principal: r.principal,
                surface: r.surface,
                resource: r.resource,
                allowed: r.allowed,
                reason: r.reason,
                detail: r.detail,
                policy_version: r.policy_version,
                report_only: r.report_only,
                would_have_denied: r.would_have_denied,
                decided_by: contribs(r.decided_by),
            })
            .collect())
    }
}

/// Unused today, kept so a future surface can emit state after a policy write the
/// way the tool/skill lists do. Policy is deliberately NOT folded into the feed:
/// it is authored rarely and read on demand, and putting it on the absolute-state
/// feed would make every operator pay for a surface most never open.
#[allow(dead_code)]
pub(crate) fn touch(_app: &AppHandle) {}

// ---- premium plane: vocabulary + ingress registry (ADR-0091 / ADR-0090) ----

/// One classification tag and whether it is deny-by-default.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TagSpec {
    pub tag: String,
    /// Nobody reaches a closed tag unless a policy grants it. The authoring UI has
    /// to show this: it changes what every other term in a policy means.
    pub closed: bool,
}

/// One registered ingress — a point where the outside world enters.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IngressSpec {
    pub agent_id: String,
    pub surface_kind: String,
    pub surface_id: String,
    pub namespace: Vec<String>,
}

impl Transport {
    /// The vocabulary, with closed-ness per tag.
    pub async fn list_tags(&self) -> Result<Vec<TagSpec>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .list_tags(Request::new(pb::authz::ListTagsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .tags
            .into_iter()
            .map(|t| TagSpec { tag: t.tag, closed: t.closed })
            .collect())
    }

    /// Draft a policy from a description in English. Read-only on the server: it
    /// returns a proposal, and applying it is the operator's separate act.
    pub async fn propose_policy(
        &self,
        request: String,
        simulate_limit: i32,
    ) -> Result<PolicyProposal, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .propose_policy(Request::new(pb::authz::ProposePolicyRequest {
                request,
                simulate_limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        let sim = resp.simulation.unwrap_or_default();
        Ok(PolicyProposal {
            rationale: resp.rationale,
            // A proposal with no policy is a server bug rather than a state the UI
            // should render, so it fails loudly instead of showing an empty draft
            // the operator might approve.
            policy: resp
                .policy
                .map(Into::into)
                .ok_or_else(|| "the proposal carried no policy".to_string())?,
            links: resp.links.into_iter().map(Into::into).collect(),
            problems: resp
                .problems
                .into_iter()
                .map(|p| ProposalProblem { severity: p.severity, message: p.message })
                .collect(),
            simulation: SimulationResult {
                decisions: sim
                    .decisions
                    .into_iter()
                    .map(|d| SimulatedDecision {
                        principal: d.principal,
                        surface: d.surface,
                        resource: d.resource,
                        tags: d.tags,
                        allowed_now: d.allowed_now,
                        allowed_under_draft: d.allowed_under_draft,
                        reason_under_draft: d.reason_under_draft,
                        detail_under_draft: d.detail_under_draft,
                        at_unix_ms: d.at_unix_ms,
                    })
                    .collect(),
                newly_denied: sim.newly_denied,
                newly_allowed: sim.newly_allowed,
                unchanged: sim.unchanged,
            },
            simulation_basis: resp.simulation_basis,
            blocking: resp.blocking,
        })
    }

    pub async fn list_ingresses(&self) -> Result<Vec<IngressSpec>, String> {
        let mut client = self.policy_client().await?;
        let resp = client
            .list_ingresses(Request::new(pb::authz::ListIngressesRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .ingresses
            .into_iter()
            .map(|i| IngressSpec {
                agent_id: i.agent_id,
                surface_kind: i.surface_kind,
                surface_id: i.surface_id,
                namespace: i.namespace,
            })
            .collect())
    }

    /// Register an ingress. Validation failures come back in `error` rather than as
    /// a transport failure — an inert registration or a wildcard-looking namespace
    /// prefix is a normal authoring outcome the form renders inline.
    pub async fn register_ingress(&self, ingress: IngressSpec) -> Result<SaveOutcome, String> {
        let mut client = self.policy_client().await?;
        match client
            .register_ingress(Request::new(pb::authz::RegisterIngressRequest {
                ingress: Some(pb::authz::IngressSpec {
                    agent_id: ingress.agent_id,
                    surface_kind: ingress.surface_kind,
                    surface_id: ingress.surface_id,
                    namespace: ingress.namespace,
                }),
            }))
            .await
        {
            Ok(_) => Ok(SaveOutcome { ok: true, error: String::new(), version: 0 }),
            Err(st) if st.code() == tonic::Code::InvalidArgument => {
                Ok(SaveOutcome { ok: false, error: st.message().to_string(), version: 0 })
            }
            Err(st) => Err(map_status(st)),
        }
    }

    pub async fn deregister_ingress(&self, agent_id: String) -> Result<(), String> {
        let mut client = self.policy_client().await?;
        client
            .deregister_ingress(Request::new(pb::authz::DeregisterIngressRequest { agent_id }))
            .await
            .map_err(map_status)?;
        Ok(())
    }
}
