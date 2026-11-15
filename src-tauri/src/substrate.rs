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
    /// ENG-1045: point/history/events also return RETIRED typed rows (marked
    /// `retired` with reason/by/at). Operator plane only — the kernel refuses
    /// it for every agent principal.
    pub include_retired: bool,
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
    /// Present when an AST query answered: the query that actually ran.
    pub compiled: Option<CompiledQuery>,
    /// Present when the ask answered with an objects request instead
    /// (ADR-0149 D6, ENG-1092): what ran, rendered for the compiled chip. The
    /// rows above carry the same answer, one row per object or group.
    pub compiled_objects: Option<CompiledObjects>,
    pub refusal_reason: String,
    /// "memory" when the corpus lane is the right tool for the question.
    pub lane_hint: String,
}

/// The ListObjects request an ask ran, flattened for display: each condition,
/// order key and metric as one readable string ("total gt 50000").
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CompiledObjects {
    pub kind: String,
    pub conditions: Vec<String>,
    pub links: Vec<String>,
    pub order_by: Vec<String>,
    pub group_by: Vec<String>,
    pub metrics: Vec<String>,
    pub page_size: i32,
}

fn condition_text(c: &pb::substrate::ObjectCondition) -> String {
    let values: Vec<String> = c
        .values
        .iter()
        .map(|v| value_from_wire(Some(v.clone())).display)
        .collect();
    format!("{} {} {}", c.property, c.op, values.join(", ")).trim_end().to_string()
}

fn compiled_objects_from_wire(r: pb::substrate::ListObjectsRequest) -> CompiledObjects {
    CompiledObjects {
        kind: r.kind,
        conditions: r.r#where.iter().map(condition_text).collect(),
        links: r
            .links
            .iter()
            .map(|l| {
                let cond = l.r#where.as_ref().map(condition_text).unwrap_or_default();
                format!("{} → {}", l.path.join("."), cond)
            })
            .collect(),
        order_by: r
            .order_by
            .iter()
            .map(|o| format!("{}{}", o.property, if o.desc { " desc" } else { "" }))
            .collect(),
        group_by: r.group_by,
        metrics: r
            .metrics
            .iter()
            .map(|m| if m.property.is_empty() { m.r#fn.clone() } else { format!("{}({})", m.r#fn, m.property) })
            .collect(),
        page_size: r.page_size,
    }
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
        include_retired: q.include_retired,
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
        include_retired: q.include_retired,
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
            compiled_objects: resp.compiled_objects.map(compiled_objects_from_wire),
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

    /// One object page (ADR-0149 D7, substrate GetObject) — the Explore card's
    /// single call for an entity that is an object of a declared table kind.
    /// `None` when the kernel answers NotFound: the entity is not such an object
    /// (or the reader may not know it exists), and the card falls back to the
    /// query-plane shapes that serve every other entity.
    pub async fn get_object(&self, entity_id: String) -> Result<Option<ObjectPage>, String> {
        let mut client = self.substrate_client().await?;
        match client
            .get_object(Request::new(pb::substrate::GetObjectRequest {
                namespace: String::new(),
                entity_id,
            }))
            .await
        {
            Ok(resp) => Ok(Some(object_from_wire(resp.into_inner()))),
            Err(e) if e.code() == tonic::Code::NotFound => Ok(None),
            Err(e) => Err(map_status(e)),
        }
    }
}

/// A typed value for the webview: its type ("text" | "number" | "date" |
/// "entity"; "" = absent) and a display string (dates RFC-3339, entities their id).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ObjectValue {
    pub r#type: String,
    pub display: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectAlternative {
    pub value: ObjectValue,
    pub at: String,
    pub source: String,
    pub evidence_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectProperty {
    pub property: String,
    pub value: ObjectValue,
    pub at: String,
    pub source: String,
    pub evidence_id: String,
    pub conflict: bool,
    pub alternatives: Vec<ObjectAlternative>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectLifecycle {
    pub state_predicate: String,
    pub state: String,
    pub allowed: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectLink {
    pub link_id: String,
    pub relation: String,
    pub label: String,
    pub family: String,
    /// "out" | "in".
    pub direction: String,
    pub other_ref: String,
    pub other_kind: String,
    pub evidence_id: String,
    pub asserted_at: String,
    pub valid_from: String,
    pub valid_to: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectTimelineEntry {
    /// "event" | "property".
    pub kind: String,
    pub at: String,
    pub event_id: String,
    pub event_type: String,
    pub roles: std::collections::BTreeMap<String, String>,
    pub property: String,
    pub value: ObjectValue,
    pub evidence_id: String,
}

/// GetObject's answer as the webview reads it. Everything absent is absent
/// for this reader — the kernel omits, never redacts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectPage {
    pub entity_id: String,
    pub kind: String,
    pub namespace: String,
    pub created_at: String,
    pub first_seen_evidence: String,
    pub decl_version: i64,
    pub updated_at: String,
    pub properties: Vec<ObjectProperty>,
    pub lifecycle: Option<ObjectLifecycle>,
    pub aliases: Vec<ObjectLink>,
    pub links: Vec<ObjectLink>,
    pub timeline: Vec<ObjectTimelineEntry>,
    pub evidence: Vec<String>,
    /// An open kind's undeclared properties, read-only, each fenced kernel-side by
    /// its own classification (ENG-1109). Empty from an older kernel.
    pub extra_properties: Vec<ObjectProperty>,
}

fn property_from_wire(p: pb::substrate::ObjectProperty) -> ObjectProperty {
    ObjectProperty {
        property: p.property,
        value: value_from_wire(p.value),
        at: ts_iso(&p.at),
        source: p.source,
        evidence_id: p.evidence_id,
        conflict: p.conflict,
        alternatives: p
            .alternatives
            .into_iter()
            .map(|a| ObjectAlternative {
                value: value_from_wire(a.value),
                at: ts_iso(&a.at),
                source: a.source,
                evidence_id: a.evidence_id,
            })
            .collect(),
    }
}

fn value_from_wire(v: Option<pb::substrate::TypedValue>) -> ObjectValue {
    use pb::substrate::typed_value::Value;
    match v.and_then(|v| v.value) {
        Some(Value::Date(t)) => ObjectValue { r#type: "date".into(), display: ts_iso(&Some(t)) },
        Some(Value::Number(n)) => ObjectValue { r#type: "number".into(), display: n.to_string() },
        Some(Value::Text(s)) => ObjectValue { r#type: "text".into(), display: s },
        Some(Value::EntityId(s)) => ObjectValue { r#type: "entity".into(), display: s },
        None => ObjectValue::default(),
    }
}

fn links_from_wire(v: Vec<pb::substrate::ObjectLink>) -> Vec<ObjectLink> {
    v.into_iter()
        .map(|l| ObjectLink {
            link_id: l.link_id,
            relation: l.relation,
            label: l.label,
            family: l.family,
            direction: l.direction,
            other_ref: l.other_ref,
            other_kind: l.other_kind,
            evidence_id: l.evidence_id,
            asserted_at: ts_iso(&l.asserted_at),
            valid_from: ts_iso(&l.valid_from),
            valid_to: ts_iso(&l.valid_to),
        })
        .collect()
}

fn object_from_wire(r: pb::substrate::GetObjectResponse) -> ObjectPage {
    ObjectPage {
        entity_id: r.entity_id,
        kind: r.kind,
        namespace: r.namespace,
        created_at: ts_iso(&r.created_at),
        first_seen_evidence: r.first_seen_evidence,
        decl_version: r.decl_version,
        updated_at: ts_iso(&r.updated_at),
        properties: r.properties.into_iter().map(property_from_wire).collect(),
        extra_properties: r.extra_properties.into_iter().map(property_from_wire).collect(),
        lifecycle: r.lifecycle.map(|l| ObjectLifecycle {
            state_predicate: l.state_predicate,
            state: l.state,
            allowed: l.allowed,
        }),
        aliases: links_from_wire(r.aliases),
        links: links_from_wire(r.links),
        timeline: r
            .timeline
            .into_iter()
            .map(|e| ObjectTimelineEntry {
                kind: e.kind,
                at: ts_iso(&e.at),
                event_id: e.event_id,
                event_type: e.event_type,
                roles: e.roles.into_iter().collect(),
                property: e.property,
                value: value_from_wire(e.value),
                evidence_id: e.evidence_id,
            })
            .collect(),
        evidence: r.evidence,
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

// ── Ontology and objects (ADR-0149 D2, D6; ENG-1395) ─────────────────────────
//
// The operator's governance surface over the live model layer: the current
// declarations, a dry-run-then-apply change (Operator only, through the
// kernel's RunOperatorMutation with a command id minted here and a mandatory
// reason), the violations report, and the objects list. Every rule is
// kernel-side; these are mappings.

/// The current declarations of one namespace, as the kernel's JSON
/// (`{"kinds":[…],"relations":[…]}`), with the version they are at.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyView {
    pub namespace: String,
    pub version: i64,
    pub declarations_json: String,
}

/// What an apply (or its dry run) classified and did.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyApplyOutcome {
    pub command_id: String,
    pub deduped: bool,
    pub applied: bool,
    pub version: i64,
    /// additive | tightening | breaking — the most severe among `changes`.
    pub class: String,
    pub changes: Vec<OntologyChangeLine>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyViolationRow {
    pub rule: String,
    pub subject: String,
    /// The offending item, link or entity id.
    pub reference: String,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct OntologyViolationsView {
    pub version: i64,
    pub violations: Vec<OntologyViolationRow>,
    pub truncated: bool,
}

/// A typed literal as the webview enters it: `type` is date | number | text |
/// entity and `value` its text; parsed here into the wire's typed value.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ObjectValueInput {
    pub r#type: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ObjectConditionInput {
    pub property: String,
    pub op: String,
    pub values: Vec<ObjectValueInput>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ObjectOrderInput {
    pub property: String,
    pub desc: bool,
}

/// The objects list the console asks for: one kind, ANDed conditions, sort,
/// keyset paging. (Link filters and grouping stay on the list_objects tool.)
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ObjectsListInput {
    pub kind: String,
    pub conditions: Vec<ObjectConditionInput>,
    pub order_by: Vec<ObjectOrderInput>,
    pub fields: Vec<String>,
    pub page_size: i32,
    pub page_token: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectListValue {
    pub property: String,
    pub value: ObjectValue,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectListRow {
    pub entity_id: String,
    pub values: Vec<ObjectListValue>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ObjectsList {
    pub kind: String,
    pub decl_version: i64,
    pub rows: Vec<ObjectListRow>,
    pub next_page_token: String,
}

/// A literal the operator typed, as the wire's typed value. A number or date
/// that does not parse is refused here with the field named, rather than sent
/// as text the kernel would refuse less helpfully.
fn typed_value_input(v: &ObjectValueInput) -> Result<pb::substrate::TypedValue, String> {
    use pb::substrate::typed_value::Value;
    let value = match v.r#type.as_str() {
        "number" => Value::Number(
            v.value
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("{:?} is not a number", v.value))?,
        ),
        "date" => Value::Date(
            iso_ts(v.value.trim()).ok_or_else(|| format!("{:?} is not an RFC 3339 date", v.value))?,
        ),
        "entity" => Value::EntityId(v.value.clone()),
        _ => Value::Text(v.value.clone()),
    };
    Ok(pb::substrate::TypedValue { value: Some(value) })
}

fn list_request(input: &ObjectsListInput) -> Result<pb::substrate::ListObjectsRequest, String> {
    let mut conditions = Vec::with_capacity(input.conditions.len());
    for c in &input.conditions {
        let mut values = Vec::with_capacity(c.values.len());
        for v in &c.values {
            values.push(typed_value_input(v).map_err(|e| format!("{} {}: {}", c.property, c.op, e))?);
        }
        conditions.push(pb::substrate::ObjectCondition {
            property: c.property.clone(),
            op: c.op.clone(),
            values,
        });
    }
    Ok(pb::substrate::ListObjectsRequest {
        namespace: String::new(),
        kind: input.kind.clone(),
        r#where: conditions,
        order_by: input
            .order_by
            .iter()
            .map(|o| pb::substrate::ObjectOrder { property: o.property.clone(), desc: o.desc })
            .collect(),
        fields: input.fields.clone(),
        page_size: input.page_size,
        page_token: input.page_token.clone(),
        ..Default::default()
    })
}

fn objects_list_from_wire(r: pb::substrate::ListObjectsResponse) -> ObjectsList {
    ObjectsList {
        kind: r.kind,
        decl_version: r.decl_version,
        rows: r
            .rows
            .into_iter()
            .map(|row| ObjectListRow {
                entity_id: row.entity_id,
                values: row
                    .values
                    .into_iter()
                    .map(|v| ObjectListValue { property: v.property, value: value_from_wire(v.value) })
                    .collect(),
            })
            .collect(),
        next_page_token: r.next_page_token,
    }
}

impl Transport {
    pub async fn get_ontology(&self) -> Result<OntologyView, String> {
        let mut client = self.substrate_client().await?;
        let r = client
            .get_ontology(Request::new(pb::substrate::GetOntologyRequest { namespace: String::new() }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(OntologyView { namespace: r.namespace, version: r.version, declarations_json: r.declarations_json })
    }

    /// Dry run (classify only: no audit, no dedupe, no command id) or apply
    /// (a fresh command id, the reason audited before the kernel applies).
    pub async fn apply_ontology_change(
        &self,
        change_json: String,
        reason: String,
        dry_run: bool,
    ) -> Result<OntologyApplyOutcome, String> {
        let mut client = self.substrate_client().await?;
        let command_id = if dry_run { String::new() } else { crate::transport::new_command_id() };
        let r = client
            .apply_ontology_change(Request::new(pb::substrate::ApplyOntologyChangeRequest {
                command_id,
                reason,
                namespace: String::new(),
                change_json,
                dry_run,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(OntologyApplyOutcome {
            command_id: r.command_id,
            deduped: r.deduped,
            applied: r.applied,
            version: r.version,
            class: r.class,
            changes: change_lines(r.changes),
        })
    }

    pub async fn ontology_violations(&self, limit: i32) -> Result<OntologyViolationsView, String> {
        let mut client = self.substrate_client().await?;
        let r = client
            .list_ontology_violations(Request::new(pb::substrate::ListOntologyViolationsRequest {
                namespace: String::new(),
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(OntologyViolationsView {
            version: r.version,
            truncated: r.truncated,
            violations: r
                .violations
                .into_iter()
                .map(|v| OntologyViolationRow { rule: v.rule, subject: v.subject, reference: v.r#ref, detail: v.detail })
                .collect(),
        })
    }

    pub async fn list_objects(&self, input: ObjectsListInput) -> Result<ObjectsList, String> {
        let req = list_request(&input)?;
        let mut client = self.substrate_client().await?;
        let r = client.list_objects(Request::new(req)).await.map_err(map_status)?.into_inner();
        Ok(objects_list_from_wire(r))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// GetObject's answer reaches the webview whole: typed values keep their
    /// type, times become RFC-3339, an absent value stays absent, and the link
    /// direction and inverse label survive.
    #[test]
    fn object_page_maps_every_section() {
        use pb::substrate::typed_value::Value;
        let t = prost_types::Timestamp { seconds: 1_790_000_000, nanos: 0 };
        let tv = |v: Value| Some(pb::substrate::TypedValue { value: Some(v) });
        let page = object_from_wire(pb::substrate::GetObjectResponse {
            entity_id: "order/O-1".into(),
            kind: "order".into(),
            namespace: "default".into(),
            created_at: Some(t),
            first_seen_evidence: "ev-1".into(),
            decl_version: 7,
            updated_at: Some(t),
            properties: vec![pb::substrate::ObjectProperty {
                property: "total".into(),
                value: tv(Value::Number(42.5)),
                at: Some(t),
                source: "erp".into(),
                evidence_id: "ev-2".into(),
                conflict: true,
                alternatives: vec![pb::substrate::ObjectAlternative {
                    value: tv(Value::Number(40.0)),
                    at: Some(t),
                    source: "crm".into(),
                    evidence_id: "ev-3".into(),
                }],
            }],
            lifecycle: Some(pb::substrate::ObjectLifecycle {
                state_predicate: "status".into(),
                state: "open".into(),
                allowed: vec!["shipped".into()],
            }),
            aliases: vec![],
            links: vec![pb::substrate::ObjectLink {
                link_id: "lnk".into(),
                relation: "placed_by".into(),
                label: "has_order".into(),
                family: "relation".into(),
                direction: "in".into(),
                other_ref: "entity:customer/C-1".into(),
                other_kind: "customer".into(),
                evidence_id: "ev-4".into(),
                asserted_at: Some(t),
                valid_from: None,
                valid_to: None,
            }],
            timeline: vec![pb::substrate::ObjectTimelineEntry {
                kind: "event".into(),
                at: Some(t),
                event_id: "e1".into(),
                event_type: "shipped".into(),
                roles: [("order".to_string(), "order/O-1".to_string())].into_iter().collect(),
                property: String::new(),
                value: None,
                evidence_id: "ev-5".into(),
            }],
            evidence: vec!["ev-1".into(), "ev-2".into()],
            extra_properties: vec![pb::substrate::ObjectProperty {
                property: "carrier".into(),
                value: tv(Value::Text("dhl".into())),
                at: Some(t),
                source: "erp".into(),
                evidence_id: "ev-6".into(),
                conflict: false,
                alternatives: vec![],
            }],
        });
        assert_eq!(page.extra_properties.len(), 1);
        assert_eq!(page.extra_properties[0].property, "carrier");
        assert_eq!(page.extra_properties[0].value, ObjectValue { r#type: "text".into(), display: "dhl".into() });
        assert_eq!(page.extra_properties[0].evidence_id, "ev-6");
        assert_eq!(page.properties[0].value, ObjectValue { r#type: "number".into(), display: "42.5".into() });
        assert!(page.properties[0].conflict);
        assert_eq!(page.properties[0].alternatives[0].source, "crm");
        assert_eq!(page.lifecycle.as_ref().unwrap().allowed, vec!["shipped".to_string()]);
        assert_eq!(page.links[0].label, "has_order");
        assert_eq!(page.links[0].direction, "in");
        assert_eq!(page.links[0].valid_from, "");
        assert_eq!(page.timeline[0].value, ObjectValue::default());
        assert_eq!(page.timeline[0].roles.get("order").map(String::as_str), Some("order/O-1"));
        assert!(!page.created_at.is_empty());
        let json = serde_json::to_value(&page).unwrap();
        assert_eq!(json["properties"][0]["value"]["type"], "number");
    }

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

    #[test]
    fn objects_list_input_maps_typed_literals_and_refuses_bad_ones() {
        let input = ObjectsListInput {
            kind: "order".into(),
            conditions: vec![
                ObjectConditionInput {
                    property: "total".into(),
                    op: "gt".into(),
                    values: vec![ObjectValueInput { r#type: "number".into(), value: " 50000 ".into() }],
                },
                ObjectConditionInput {
                    property: "due".into(),
                    op: "lt".into(),
                    values: vec![ObjectValueInput { r#type: "date".into(), value: "2026-12-01T00:00:00Z".into() }],
                },
            ],
            order_by: vec![ObjectOrderInput { property: "total".into(), desc: true }],
            page_size: 25,
            page_token: "tok".into(),
            ..Default::default()
        };
        let req = list_request(&input).expect("valid input");
        assert_eq!(req.kind, "order");
        assert_eq!(req.r#where.len(), 2);
        use pb::substrate::typed_value::Value;
        assert_eq!(req.r#where[0].values[0].value, Some(Value::Number(50000.0)));
        assert!(matches!(req.r#where[1].values[0].value, Some(Value::Date(_))));
        assert!(req.order_by[0].desc);
        assert_eq!((req.page_size, req.page_token.as_str()), (25, "tok"));

        let mut bad = input.clone();
        bad.conditions[0].values[0].value = "lots".into();
        let err = list_request(&bad).unwrap_err();
        assert!(err.contains("total gt") && err.contains("not a number"), "{err}");
    }

    #[test]
    fn objects_list_maps_rows_and_paging() {
        use pb::substrate::{typed_value::Value, ObjectRow, PropertyValue, TypedValue};
        let out = objects_list_from_wire(pb::substrate::ListObjectsResponse {
            kind: "order".into(),
            decl_version: 4,
            rows: vec![ObjectRow {
                entity_id: "order/O-1".into(),
                values: vec![PropertyValue {
                    property: "total".into(),
                    value: Some(TypedValue { value: Some(Value::Number(72000.0)) }),
                }],
            }],
            next_page_token: "next".into(),
            ..Default::default()
        });
        assert_eq!(out.rows[0].entity_id, "order/O-1");
        assert_eq!(out.rows[0].values[0].value.display, "72000");
        assert_eq!((out.decl_version, out.next_page_token.as_str()), (4, "next"));
    }

    #[test]
    fn compiled_objects_render_every_part() {
        use pb::substrate::{typed_value::Value, ObjectCondition, ObjectMetric, ObjectOrder, TypedValue};
        let c = compiled_objects_from_wire(pb::substrate::ListObjectsRequest {
            kind: "order".into(),
            r#where: vec![ObjectCondition {
                property: "total".into(),
                op: "gt".into(),
                values: vec![TypedValue { value: Some(Value::Number(50000.0)) }],
            }],
            order_by: vec![ObjectOrder { property: "total".into(), desc: true }],
            group_by: vec!["status".into()],
            metrics: vec![ObjectMetric { r#fn: "count".into(), property: String::new() }],
            page_size: 20,
            ..Default::default()
        });
        assert_eq!(c.kind, "order");
        assert_eq!(c.conditions, vec!["total gt 50000".to_string()]);
        assert_eq!(c.order_by, vec!["total desc".to_string()]);
        assert_eq!(c.group_by, vec!["status".to_string()]);
        assert_eq!(c.metrics, vec!["count".to_string()]);
        assert_eq!(c.page_size, 20);
    }

    #[test]
    fn include_retired_round_trips_the_wire_and_defaults_off() {
        let q = CompiledQuery {
            kind: "history".into(),
            entity_id: "order/SO-1".into(),
            predicate: "qty".into(),
            include_retired: true,
            ..Default::default()
        };
        let wire = to_wire(&q);
        assert!(wire.include_retired);
        assert!(from_wire(wire).include_retired);
        // A plain query never asks for retired rows.
        assert!(!to_wire(&CompiledQuery::default()).include_retired);
    }
}
