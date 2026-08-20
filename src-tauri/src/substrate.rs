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
    /// growing without draining is the ingest-health warning.
    pub outbox_pending: i64,
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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
