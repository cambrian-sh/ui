//! The client-side **state of record** (ADR-0047: the Rust core owns it; the
//! webview is a projection). Events are folded idempotently (absolute-state,
//! last-writer-wins by id) so re-delivery after a Snapshot is harmless.
//!
//! The struct shapes here MUST match `src/ipc/types.ts` exactly — Tauri
//! serializes this to JSON and sends it as the webview projection.

use std::collections::HashMap;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::pb;

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Render a protobuf Timestamp as RFC-3339, or "" when absent.
///
/// The webview treats "" as "unknown" and renders an em-dash. That matters: five of the
/// eight SessionSummary fields used to be structurally blank because the kernel had no way
/// to send them, and the time-range filter silently discarded every session as a result.
/// Milliseconds since the epoch, for a trace the console orders by time.
pub(crate) fn ts_millis(ts: &Option<::prost_types::Timestamp>) -> i64 {
    match ts {
        Some(t) => t.seconds * 1000 + i64::from(t.nanos) / 1_000_000,
        None => 0,
    }
}

pub(crate) fn ts_iso(ts: &Option<::prost_types::Timestamp>) -> String {
    match ts {
        Some(t) => chrono::DateTime::from_timestamp(t.seconds, t.nanos as u32)
            .map(|d| d.to_rfc3339())
            .unwrap_or_default(),
        None => String::new(),
    }
}

// ============================================================================
// Connection
// ============================================================================

/// Connection lifecycle — matches webview `ConnectionStatus` union.
#[derive(Clone, Copy, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Down,
    Reconnecting,
    Live,
}

/// Projected connection state — matches webview `ConnectionState`.
#[derive(Clone, Serialize)]
pub struct ConnectionState {
    pub status: ConnectionStatus,
    pub endpoint: Option<String>,
    pub last_known_state_at: Option<String>,
    pub reason: Option<String>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            status: ConnectionStatus::Down,
            endpoint: None,
            last_known_state_at: None,
            reason: None,
        }
    }
}

// ============================================================================
// Plans
// ============================================================================

/// One node of a plan's DAG. Matches webview `PlanStep` (index/label/depends_on/status).
#[derive(Clone, Serialize)]
pub struct PlanStep {
    pub index: i32,
    pub label: String,
    pub depends_on: Vec<i32>,
    pub is_thought: bool,
    pub status: String,
    pub agent: Option<String>,
}

/// Map a proto DAG node to its projection form.
fn plan_step_from_op(op: &pb::PlanStepOp) -> PlanStep {
    PlanStep {
        index: op.index,
        label: op.label.clone(),
        depends_on: op.depends_on.clone(),
        is_thought: op.is_thought,
        status: op.status.clone(),
        agent: if op.agent.is_empty() {
            None
        } else {
            Some(op.agent.clone())
        },
    }
}

/// Matches webview `PlanInFlight`.
#[derive(Clone, Serialize)]
pub struct PlanInFlight {
    pub plan_id: String,
    pub session_id: String,
    pub subject: String,
    pub step_count: i32,
    pub active_agent: Option<String>,
    pub status: String,
    pub elapsed_ms: i64,
    pub cost: f64,
    pub started_at: String,
    /// The plan's DAG for live rendering. Absolute-state: replaced wholesale on each
    /// PlanState fold. Empty until the first PlanState event carries it (snapshots don't).
    pub steps: Vec<PlanStep>,
}

impl Default for PlanInFlight {
    fn default() -> Self {
        Self {
            plan_id: String::new(),
            session_id: String::new(),
            subject: String::new(),
            step_count: 0,
            active_agent: None,
            status: "running".into(),
            elapsed_ms: 0,
            cost: 0.0,
            started_at: String::new(),
            steps: Vec::new(),
        }
    }
}

// ============================================================================
// Sessions
// ============================================================================

/// Matches webview `SessionSummary`.
#[derive(Clone, Serialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub title: String,
    pub state: String,
    pub created_at: String,
    pub last_activity_at: String,
    pub plan_count: i32,
    pub agent_mix: Vec<String>,
    pub cost: f64,
}

impl Default for SessionSummary {
    fn default() -> Self {
        Self {
            session_id: String::new(),
            title: String::new(),
            state: "active".into(),
            created_at: String::new(),
            last_activity_at: String::new(),
            plan_count: 0,
            agent_mix: vec![],
            cost: 0.0,
        }
    }
}

// ============================================================================
// Audit
// ============================================================================

/// Matches webview `AuditEntry`.
#[derive(Clone, Serialize)]
pub struct AuditEntry {
    pub entry_id: String,
    pub timestamp: String,
    pub actor_id: String,
    pub actor_role: String,
    pub target_kind: String,
    pub target_id: String,
    pub action_type: String,
    pub status: String,
    pub reason: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<HashMap<String, serde_json::Value>>,
}

impl Default for AuditEntry {
    fn default() -> Self {
        Self {
            entry_id: String::new(),
            timestamp: String::new(),
            actor_id: String::new(),
            actor_role: "operator".into(),
            target_kind: String::new(),
            target_id: String::new(),
            action_type: String::new(),
            status: "applied".into(),
            reason: String::new(),
            kind: "runtime".into(),
            before: None,
            after: None,
        }
    }
}

// ============================================================================
// HITL
// ============================================================================

/// Matches webview `HITLIntervention`.
#[derive(Clone, Serialize)]
pub struct HITLIntervention {
    pub intervention_id: String,
    pub plan_id: String,
    pub step_id: String,
    pub agent_id: String,
    pub nature: String,
    pub proposed_action: HashMap<String, serde_json::Value>,
    pub intended_action: Option<HashMap<String, serde_json::Value>>,
    pub reason: String,
    pub raised_at: String,
}

impl Default for HITLIntervention {
    fn default() -> Self {
        Self {
            intervention_id: String::new(),
            plan_id: String::new(),
            step_id: String::new(),
            agent_id: String::new(),
            nature: "approval_request".into(),
            proposed_action: HashMap::new(),
            intended_action: None,
            reason: String::new(),
            raised_at: String::new(),
        }
    }
}

// ============================================================================
// UI-IMPL-21a subsystem entity types (empty until kernel contract bump)
// ============================================================================

#[derive(Clone, Serialize, Default)]
pub struct AgentSummary {
    pub id: String,
    #[serde(rename = "trait")]
    pub trait_: String,
    pub scope_summary: String,
    pub trust_score: f64,
    pub last_activity_at: String,
    pub last_state: String,
    /// The agent's DECLARED capabilities (contract 0072/0074).
    ///
    /// This is what makes route preview answerable in the UI at zero cost: the
    /// L1 eligibility gate is set containment over declared capabilities, so the
    /// console can compute the eligible set exactly rather than approximating
    /// it. Merit RANKING is not reproducible here and is not attempted.
    pub capabilities: Vec<String>,
    /// Detail fields contract 0057 removed and 0074 restored.
    pub description: String,
    pub runtime: String,
    pub exec_path: String,
    pub manifest_version: String,
    /// An agent whose capability claims have not been verified by an interview.
    /// Routing treats it differently, so a console must be able to show it.
    pub provisional: bool,
    pub system: bool,
    pub classification_tags: Vec<String>,
    /// Most recent reported failure. A failing agent is otherwise
    /// indistinguishable from an idle one.
    pub last_error: String,
}

#[derive(Clone, Serialize, Default)]
pub struct ToolSummary {
    pub id: String,
    pub description: String,
    pub danger: bool,
    pub granted_agent_count: i32,
    pub recent_invocation_count: i32,
    pub last_cost: f64,
    /// What domain the tool touches — `crm`, `filesystem`, `payments` (ADR-0085 D2).
    pub classification_tags: Vec<String>,
    /// The closed-set verb classes it exercises: read | write | egress | spend |
    /// admin (ADR-0086). A tag says what a tool is ABOUT; an effect says what the
    /// invocation DOES to it, and policy checks both.
    pub effects: Vec<String>,
    /// True when the effects were DERIVED from the manifest's other fields rather
    /// than declared. This is the strict-mode migration checklist: an operator
    /// flips `execution.tool_effects_strict` once nothing is inferred, after which
    /// an unclassified tool cannot register at all.
    pub effects_inferred: bool,
}

#[derive(Clone, Serialize, Default)]
pub struct SkillSummary {
    pub id: String,
    pub description: String,
    pub scope_tags: Vec<String>,
    pub loaded_in_count: i32,
    pub last_loaded_at: String,
}

#[derive(Clone, Serialize, Default)]
pub struct MCPServerSummary {
    pub id: String,
    pub connection_state: String,
    pub tool_count: i32,
    pub last_health_check_at: String,
    pub default_price: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct ScopeSummary {
    pub agent_id: String,
    pub effective_scope_summary: String,
    pub default_write_tags: Vec<String>,
    pub last_scope_change_at: String,
}

// ============================================================================
// P2: Watch & Reactive
// ============================================================================

#[derive(Clone, Serialize, Default)]
pub struct WatchConfigSummary {
    pub id: String,
    pub target_streams: Vec<String>,
    pub last_fire_at: Option<String>,
    pub last_fire_status: String,
    pub error_count: i32,
}

/// One authored reactive-pipeline revision (contract 0087, ADR-0114 D33/D34).
///
/// Distinct from `WatchConfigSummary` because a pipeline is a different thing: a
/// watch is one condition plus a list of arms; a pipeline is a versioned GRAPH
/// with typed ports and a durable execution store. Widening the watch DTO until
/// it fitted both would make one of them lie.
///
/// Every ingress created through the Ingress Studio owns one, generated from its
/// mapping and armed with the ingress. An ingress that has not been armed has no
/// ARMED pipeline, and that is a normal state.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineSummary {
    pub pipeline_id: String,
    pub revision: i32,
    pub name: String,
    /// draft | validated | published | armed | retired
    pub state: String,
    pub trigger_type: String,
    pub trigger_ref: String,
    pub node_count: i32,
    pub edge_count: i32,
    /// Nodes that can change something outside the process — the number worth
    /// checking before arming.
    pub effect_node_count: i32,
    pub mapping_revision: i32,
    pub plan_checksum: String,
    pub semantics_checksum: String,
    pub generated: bool,
    /// Evaluates everything and performs no effect (REACT-05).
    pub dry_run: bool,
    pub approved: bool,
    /// Whether the daemon feeding this pipeline is running. `None` means nobody
    /// can tell — a different claim from "not running", and only one of the two
    /// is a problem.
    pub entry_live: Option<bool>,
}

/// One `WatchActionOp` — what an arm of a pipeline does.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct WatchAction {
    pub r#type: String,
    pub target_type: String,
    pub target: String,
    pub payload: String,
}

/// The WHOLE `WatchConfigOp`.
///
/// `WatchConfigSummary` above deliberately keeps only what the old list screen
/// rendered, which meant the condition, the action, the debounce window, dry-run
/// and the cron fields were all discarded at the transport boundary. The
/// pipeline builder needs every one of them, so this carries the config
/// unabridged rather than widening the summary and changing what existing
/// screens receive.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct WatchConfigFull {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_type: String,
    pub source_stream_id: String,
    pub condition: String,
    pub condition_type: String,
    /// Source-specific parameters the daemon reads (e.g. a filesystem path).
    pub daemon_params: std::collections::HashMap<String, String>,
    pub action: WatchAction,
    pub active: bool,
    pub response_mode: String,
    pub max_concurrent_plans: i32,
    pub debounce_seconds: i32,
    pub condition_payload_keys: Vec<String>,
    /// REACT-03: the operator ack for a high-risk llm-condition watch.
    pub approved: bool,
    /// REACT-05: evaluate and record, never act.
    pub dry_run: bool,
    pub source_cron: String,
    pub source_timezone: String,
    pub missed_fire_policy: String,
}

#[derive(Clone, Serialize, Default)]
pub struct WatchMetrics {
    pub watch_id: String,
    pub signals_seen: i64,
    pub condition_fired: i64,
    pub condition_suppressed: i64,
    pub dry_run_would_fire: i64,
    pub action_failed: i64,
    pub dead_lettered: i64,
    pub mean_condition_latency_ms: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct WatchDeadLetter {
    pub id: String,
    pub watch_id: String,
    pub action_type: String,
    pub key: String,
    pub reason: String,
    pub signal_stream_id: String,
    pub signal_raw_text: String,
    pub failed_at_unix_ms: i64,
}

/// One replayed signal from `BacktestWatch`. Never executes an arm.
#[derive(Clone, Serialize, Default)]
pub struct WatchBacktestVerdict {
    pub seq: u64,
    pub stream_id: String,
    pub raw_text: String,
    pub would_fire: bool,
    pub eval_error: String,
}

// ============================================================================
// ROUTE-07 / ADR-0077: route preview
// ============================================================================

/// A candidate profile supplied to `PreviewRoute`.
///
/// The RPC scores caller-supplied profiles so the preview is deterministic and
/// needs no live fleet. That is why the console cannot answer "who would take
/// this step" against the real registry without either a live-fleet mode on the
/// RPC or the merit inputs on `AgentSummary` — see report.md §4.12.
#[derive(Clone, Deserialize, Default)]
pub struct PreviewCandidate {
    pub agent_id: String,
    pub trait_name: String,
    pub success_rate: f64,
    pub trust_score: f64,
    pub network_latency_ms: i32,
    pub computation_latency_ms: i32,
    pub context_growth_bytes: i32,
    pub provisional: bool,
    pub avg_cost_per_task: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct PreviewRanked {
    pub agent_id: String,
    pub score: f64,
    pub success_rate: f64,
    pub trust_score: f64,
    /// w3 * (1/normLatency) contribution.
    pub latency_term: f64,
    /// w4 * normalizedCost contribution — subtracted.
    pub cost_term: f64,
    /// Cold-start penalty applied.
    pub provisional: bool,
}

#[derive(Clone, Serialize, Default)]
pub struct PreviewRouteResult {
    pub ranked: Vec<PreviewRanked>,
    /// "hand_weights" | "learned_scorer" — which scorer produced this.
    pub arm: String,
}

// ============================================================================
// Conversations (ADR-0084 D9 OSS chat lane)
// ============================================================================

/// One persisted conversation turn, projected for the webview (no gRPC types cross
/// the IPC seam).
#[derive(Clone, Serialize, Default)]
pub struct ConversationMessage {
    pub id: String,
    pub conversation_id: String,
    pub seq: i64,
    /// "user" | "agent" | "system".
    pub role: String,
    pub content: String,
    pub created_at: String,
}

impl From<pb::MessageOp> for ConversationMessage {
    fn from(m: pb::MessageOp) -> Self {
        Self {
            id: m.id,
            conversation_id: m.conversation_id,
            seq: m.seq,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
        }
    }
}

/// A conversation summary for the ChatGPT-style sidebar (no messages).
#[derive(Clone, Serialize, Default)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub profile: String,
    pub updated_at: String,
}

impl From<pb::ConversationOp> for ConversationSummary {
    fn from(c: pb::ConversationOp) -> Self {
        Self {
            id: c.id,
            title: c.title,
            status: c.status,
            profile: c.profile,
            updated_at: c.updated_at,
        }
    }
}

// ============================================================================
// P2: Lifecycle
// ============================================================================

#[derive(Clone, Serialize, Default)]
pub struct ConsolidationJob {
    pub timestamp: String,
    pub duration_ms: i64,
    pub status: String,
}

#[derive(Clone, Serialize, Default)]
pub struct DormancyEvent {
    pub agent_id: String,
    pub event_type: String,
    pub timestamp: String,
}

#[derive(Clone, Serialize, Default)]
pub struct LifecycleState {
    pub scheduler_state: String,
    pub pending_jobs: i32,
    pub last_consolidation: Option<ConsolidationJob>,
    pub dormancy_events: Vec<DormancyEvent>,
}

// ============================================================================
// P2: Verifier Pool
// ============================================================================

#[derive(Clone, Serialize, Default)]
pub struct VerifierPoolAgent {
    pub agent_id: String,
    pub merit_score: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct VerifierRound {
    pub task_id: String,
    pub verifier_id: String,
    pub target_agent: String,
    pub quality_score: f64,
    pub cross_verification_status: String,
}

#[derive(Clone, Serialize, Default)]
pub struct SurveillanceTrigger {
    pub agent_id: String,
    pub reason: String,
    pub fired_at: String,
}

#[derive(Clone, Serialize, Default)]
pub struct VerifierPoolState {
    pub pool_agents: Vec<VerifierPoolAgent>,
    pub recent_rounds: Vec<VerifierRound>,
    pub surveillance_triggers: Vec<SurveillanceTrigger>,
}

// ============================================================================
// P2: Cost & Energy
// ============================================================================

#[derive(Clone, Serialize, Default)]
pub struct CircuitBreaker {
    pub model_id: String,
    pub state: String,
    pub reason: String,
}

#[derive(Clone, Serialize, Default)]
pub struct PriceLedgerEntry {
    pub model_id: String,
    pub cost_per_token: f64,
    pub currency: String,
}

#[derive(Clone, Serialize, Default)]
pub struct AcquireOutcome {
    pub model_id: String,
    pub acquired: bool,
    pub latency_ms: i64,
    pub timestamp: String,
}

#[derive(Clone, Serialize, Default)]
pub struct CostDashboard {
    pub spend_rate_usd: f64,
    pub circuit_breakers: Vec<CircuitBreaker>,
    pub max_energy_per_step: f64,
    pub price_ledger: Vec<PriceLedgerEntry>,
    pub recent_acquires: Vec<AcquireOutcome>,
}

// ============================================================================
// Memory ingest observability (contract 0057 MemoryWrittenOp)
// ============================================================================

/// One `MemoryWrittenOp` off the feed. The ingest queue matches these to the
/// `doc_id` returned by `IngestMemory` to move a row parsing → chunked without
/// polling; the count of events for a `doc_id` IS the chunk count.
#[derive(Clone, Serialize, Default)]
pub struct MemoryWrittenEvent {
    /// The feed seq this came from. `MemoryWrittenOp` carries no id of its own and
    /// one document emits one event per chunk, so seq is the only dedup key that
    /// survives a resync replay without collapsing distinct chunks.
    pub seq: u64,
    pub doc_id: String,
    pub doc_type: String,
    pub session_id: String,
    pub source: String,
    pub summary: String,
    pub written_at: String,
}

/// One kernel plugin as the console sees it (ADR-0089): what the kernel reported,
/// plus the skew verdict computed against this build's pinned expectation.
///
/// The verdict is computed HERE, in the state of record, rather than in the
/// webview — the pinned table is a property of the compiled client, and a
/// projection that re-derived it could disagree with the client it belongs to.
#[derive(Clone, Serialize, Default)]
pub struct PluginState {
    pub id: String,
    pub display_name: String,
    pub version: String,
    /// active | deps_unmet | not_entitled | expired (ADR-0082 D9)
    pub state: String,
    pub capabilities: Vec<String>,
    pub panels: Vec<PluginPanel>,
    pub reason: String,
    pub missing: Vec<String>,
    pub expires_at: String,
    /// aligned | minor | major | unknown
    pub skew: String,
    /// The version this console was built against; empty when nothing is pinned.
    pub pinned_version: String,
}

#[derive(Clone, Serialize, Default)]
pub struct PluginPanel {
    pub id: String,
    pub title: String,
    pub capability: String,
}

// ============================================================================
// The full projection pushed to the webview — MUST match `StateOfRecord`
// in src/ipc/types.ts exactly.
// ============================================================================

/// The full projection pushed to the webview. Struct fields MUST match
/// `src/ipc/types.ts` `StateOfRecord` exactly.
#[derive(Clone, Serialize, Default)]
pub struct StateOfRecord {
    pub connection: ConnectionState,
    pub role: Option<String>,
    pub kernel_version: String,
    pub contract_version: String,
    pub capabilities: Vec<String>,
    /// 0 = aligned; matches webview `number` (Rust `bool` would serialize to `true`/`false`).
    pub contract_skew: i32,
    /// Every plugin the kernel DECLARED, with this console's skew verdict for each
    /// (ADR-0089). Empty on an OSS kernel, which has no plugins — not a warning.
    pub plugins: Vec<PluginState>,
    /// The last folded seq — the resume cursor.
    pub cursor: u64,
    pub plans: Vec<PlanInFlight>,
    pub sessions: Vec<SessionSummary>,
    pub audit_tail: Vec<AuditEntry>,
    pub pending_hitl: Vec<HITLIntervention>,
    // UI-IMPL-21a: subsystem caches (projected from snapshots/events)
    pub agents: Vec<AgentSummary>,
    pub tools: Vec<ToolSummary>,
    pub skills: Vec<SkillSummary>,
    pub mcp_servers: Vec<MCPServerSummary>,
    pub scope: HashMap<String, ScopeSummary>,
    pub watch_configs: Vec<WatchConfigSummary>,
    pub lifecycle: LifecycleState,
    pub verifier_pool: VerifierPoolState,
    pub cost_dashboard: CostDashboard,
    /// Bounded tail of `MemoryWrittenOp`s — the ingest queue's status lane.
    pub memory_written: Vec<MemoryWrittenEvent>,
    /// Plans that have gone terminal, newest first, bounded.
    ///
    /// `plans` is *Plans in Flight* and must drop a plan the moment it finishes,
    /// or the list stops meaning what it says. But dropping it was also throwing
    /// away the only record of HOW it ended: a finished plan and a plan that
    /// never reported became the same observation — absent — so any surface
    /// asking "how did my run go?" could only answer "still waiting".
    pub completed_plans: Vec<PlanInFlight>,
    /// Latest ADR-0098 progress snapshot per conversation (contract 0079).
    ///
    /// A map rather than a list because these SUPERSEDE: the console shows one
    /// status line per conversation, and the newest snapshot is the only one
    /// worth showing. It lives in the projection rather than on a side event
    /// lane so navigating away from chat and back mid-turn does not lose the
    /// indicator for a turn that is still running.
    pub conversation_progress: HashMap<String, ConversationProgress>,
    /// Retention/compaction passes seen on the feed (`RetentionRunOp`, contract
    /// 0084, ADR-0102 A1), newest last.
    ///
    /// SOURCE-AGNOSTIC by design: the record compactor and the reactive-journal GC
    /// publish the same shape, so one list serves both and the retention panel
    /// reads `source` rather than assuming one. An operator asking "what was
    /// deleted and when" gets one answer instead of two half-answers.
    ///
    /// Folded rather than polled because a FAILED pass means erasure has stopped
    /// happening, and that is not something to discover on the next refresh.
    pub retention_runs: Vec<RetentionRunEvent>,
    /// Live per-node readings, keyed by pipeline (ADR-0114 D37).
    ///
    /// A MAP rather than a list: each reading is absolute state for one
    /// pipeline, so a new one replaces the last. Appending would grow without
    /// bound and would let a console add two readings of the same number.
    ///
    /// Process-local in the kernel and cleared on resync here, for the same
    /// reason: these describe what the kernel is doing NOW, and a reading that
    /// survived a reconnect would claim continuity across a boundary the
    /// runtime does not have.
    pub pipeline_meters: std::collections::HashMap<String, PipelineMeters>,
    /// The most recent steps, newest last, bounded (ADR-0114 D38).
    ///
    /// A ring rather than a map: this is a TRACE, and its value is the order.
    /// Cleared on resync for the same reason as the meters — it describes motion
    /// happening now.
    pub pipeline_steps: Vec<PipelineStep>,
}

/// One item passing through one node.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineStep {
    pub pipeline_id: String,
    pub revision: i32,
    pub run_id: String,
    /// Identifies the item ACROSS steps, which is what makes a sequence of these
    /// a trace rather than a list.
    pub item_key: String,
    pub node: String,
    pub kind: String,
    pub port: String,
    /// "routed", "terminated" or "failed".
    pub outcome: String,
    pub reason: String,
    pub duration_ms: i64,
    /// A bounded preview of what the item carried; empty unless tracing is on.
    pub payload: String,
    /// The UNTRUNCATED size, so a clipped payload is never mistakable for whole.
    pub payload_bytes: i32,
    /// Steps skipped by the rate cap since the last one sent.
    pub dropped: i64,
    pub at_unix_ms: i64,
}

/// How many steps the console keeps.
///
/// Bounded because a trace is a window, not a log: the kernel already caps the
/// rate, and an unbounded list would grow for as long as the tab is open.
const PIPELINE_STEPS_MAX: usize = 500;

/// One pipeline's live per-node reading.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineMeters {
    pub pipeline_id: String,
    pub revision: i32,
    pub nodes: Vec<PipelineNodeMeter>,
}

/// One node's live reading.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineNodeMeter {
    pub node: String,
    pub entered: i64,
    /// How many items are inside this node right now — the bottleneck signal,
    /// and the one figure that cannot be reconstructed afterwards.
    pub in_flight: i64,
    /// Items the node could not process. Kept apart from an `error` port.
    pub failed: i64,
    /// Items that completed and were routed onward — the ordinary path.
    pub passed_on: i64,
    pub ports: std::collections::HashMap<String, i64>,
    pub mean_latency_ms: i64,
}

const AUDIT_TAIL_MAX: usize = 200;
const MEMORY_WRITTEN_MAX: usize = 500;
/// Enough to show a run of bounded passes as a shape rather than a number — one
/// bounded pass is normal, twelve in a row is a capacity warning, and that
/// distinction needs a window wider than the twelve it is trying to show.
const RETENTION_RUNS_MAX: usize = 100;
/// Enough to answer "how did the thing I just ran go?" for the runs still on
/// screen. This is a courtesy tail, not history — Sessions holds the record.
const COMPLETED_PLANS_MAX: usize = 50;

impl StateOfRecord {
    /// Reset the live, feed-derived state (kept across a resync: connection/role
    /// are managed separately). Called when replacing state from a Snapshot.
    pub fn reset_live(&mut self) {
        self.plans.clear();
        self.sessions.clear();
        self.pending_hitl.clear();
        self.audit_tail.clear();
        self.cursor = 0;
        // Subsystem caches are cleared on snapshot too (the snapshot is
        // authoritative).
        self.agents.clear();
        self.tools.clear();
        self.skills.clear();
        self.mcp_servers.clear();
        self.scope.clear();
        // Live readings do not survive a resync: they describe what is
        // happening now, and the kernel republishes a full snapshot on connect.
        self.pipeline_meters.clear();
        self.pipeline_steps.clear();
        self.watch_configs.clear();
        self.lifecycle = LifecycleState::default();
        self.verifier_pool = VerifierPoolState::default();
        self.cost_dashboard = CostDashboard::default();
        self.memory_written.clear();
        self.completed_plans.clear();
        // Progress is live-only: a snapshot never carries it, and a resync means
        // we cannot know whether the turn it described is still running.
        self.conversation_progress.clear();
        // retention_runs is deliberately NOT cleared. A snapshot does not carry
        // retention history, so clearing it here would make a resync — an ordinary
        // cursor event — erase the evidence that a pass failed. The fold dedupes on
        // (source, run_id), so replayed events after a snapshot are harmless.
    }

    /// Apply a Snapshot's bounded live state and the capability/version handshake.
    pub fn apply_snapshot(&mut self, snap: &pb::SnapshotResponse) {
        self.reset_live();
        self.cursor = snap.as_of_seq;
        self.kernel_version = snap.kernel_version.clone();
        self.contract_version = snap.contract_version.clone();
        self.capabilities = snap.capabilities.clone();
        self.contract_skew = if !snap.contract_version.is_empty()
            && snap.contract_version != pb::PINNED_CONTRACT_VERSION
        {
            1
        } else {
            0
        };

        self.plugins = snap
            .plugins
            .iter()
            .map(|p| {
                let skew = pb::plugin_skew(&p.id, &p.version);
                PluginState {
                    id: p.id.clone(),
                    display_name: p.display_name.clone(),
                    version: p.version.clone(),
                    state: p.state.clone(),
                    capabilities: p.capabilities.clone(),
                    panels: p
                        .panels
                        .iter()
                        .map(|pan| PluginPanel {
                            id: pan.id.clone(),
                            title: pan.title.clone(),
                            capability: pan.capability.clone(),
                        })
                        .collect(),
                    reason: p.reason.clone(),
                    missing: p.missing.clone(),
                    expires_at: p.expires_at.clone(),
                    skew: match skew {
                        pb::PluginSkew::Aligned => "aligned",
                        pb::PluginSkew::Minor => "minor",
                        pb::PluginSkew::Major => "major",
                        pb::PluginSkew::Unknown => "unknown",
                    }
                    .to_string(),
                    pinned_version: pb::PINNED_PLUGIN_VERSIONS
                        .iter()
                        .find(|(id, _)| *id == p.id)
                        .map(|(_, v)| (*v).to_string())
                        .unwrap_or_default(),
                }
            })
            .collect();

        for p in &snap.plans {
            self.plans.push(PlanInFlight {
                session_id: p.session_id.clone(),
                plan_id: p.plan_id.clone(),
                active_agent: if p.active_agent.is_empty() {
                    None
                } else {
                    Some(p.active_agent.clone())
                },
                status: p.status.clone(),
                cost: p.cost_so_far,
                step_count: p.active_step,
                ..Default::default()
            });
        }

        for s in &snap.sessions {
            self.sessions.push(SessionSummary {
                session_id: s.id.clone(),
                title: s.goal.clone(),
                state: s.status.clone(),
                ..Default::default()
            });
        }
    }

    // ------------------------------------------------------------------
    // Fold — process one feed event after the other
    // ------------------------------------------------------------------

    /// Fold one feed event. Returns false for `token` events (live-only — the
    /// caller streams them separately and they are NOT part of the cursor/state).
    pub fn fold(&mut self, ev: &pb::OperatorEvent) -> bool {
        use pb::operator_event::Payload;
        let payload = match &ev.payload {
            Some(p) => p,
            None => return true,
        };

        // token chunks: live-only, never stored, never advance the cursor.
        if let Payload::Token(_) = payload {
            return false;
        }

        // Absolute-state events advance the cursor monotonically.
        if ev.seq > self.cursor {
            self.cursor = ev.seq;
        }

        match payload {
            Payload::PlanState(p) => {
                if p.terminal {
                    // Carry the last known DAG forward. The terminal update is
                    // allowed to arrive with no steps, and taking it literally
                    // would blank a ladder we had been drawing for the whole run.
                    let mut done = self
                        .plans
                        .iter()
                        .find(|x| x.plan_id == p.plan_id)
                        .cloned()
                        .unwrap_or_else(|| PlanInFlight {
                            session_id: p.session_id.clone(),
                            plan_id: p.plan_id.clone(),
                            ..Default::default()
                        });
                    done.status = p.status.clone();
                    done.cost = p.cost_so_far;
                    done.step_count = p.active_step;
                    if !p.active_agent.is_empty() {
                        done.active_agent = Some(p.active_agent.clone());
                    }
                    if !p.steps.is_empty() {
                        done.steps = p.steps.iter().map(plan_step_from_op).collect();
                    }
                    if done.session_id.is_empty() {
                        done.session_id = p.session_id.clone();
                    }

                    self.plans.retain(|x| x.plan_id != p.plan_id);
                    // Newest first, and idempotent: a re-delivered terminal event
                    // must update the entry rather than stack a duplicate.
                    self.completed_plans.retain(|x| x.plan_id != done.plan_id);
                    self.completed_plans.insert(0, done);
                    self.completed_plans.truncate(COMPLETED_PLANS_MAX);
                } else if let Some(existing) =
                    self.plans.iter_mut().find(|x| x.plan_id == p.plan_id)
                {
                    existing.session_id = p.session_id.clone();
                    existing.active_agent = if p.active_agent.is_empty() {
                        None
                    } else {
                        Some(p.active_agent.clone())
                    };
                    existing.status = p.status.clone();
                    existing.cost = p.cost_so_far;
                    existing.step_count = p.active_step;
                    // Absolute-state: replace the DAG wholesale. A late (empty) emitter must
                    // not wipe a graph we already have, so only overwrite when steps arrive.
                    if !p.steps.is_empty() {
                        existing.steps = p.steps.iter().map(plan_step_from_op).collect();
                    }
                } else {
                    self.plans.push(PlanInFlight {
                        session_id: p.session_id.clone(),
                        plan_id: p.plan_id.clone(),
                        active_agent: if p.active_agent.is_empty() {
                            None
                        } else {
                            Some(p.active_agent.clone())
                        },
                        status: p.status.clone(),
                        cost: p.cost_so_far,
                        step_count: p.active_step,
                        steps: p.steps.iter().map(plan_step_from_op).collect(),
                        ..Default::default()
                    });
                }
            }
            // Phase 2 (contract 0064): the ABSOLUTE lifecycle state, emitted on every
            // transition — open, pause, resume, dormant, complete. This is an UPSERT, so a
            // session created after the console connected appears immediately instead of
            // staying invisible until the next snapshot, and "paused" becomes a state the
            // UI can actually observe rather than unreachable paint.
            Payload::SessionState(st) => {
                let created = ts_iso(&st.created_at);
                let updated = ts_iso(&st.updated_at);
                if let Some(existing) = self
                    .sessions
                    .iter_mut()
                    .find(|x| x.session_id == st.session_id)
                {
                    existing.state = st.status.clone();
                    if !st.goal.is_empty() {
                        existing.title = st.goal.clone();
                    }
                    if !created.is_empty() {
                        existing.created_at = created;
                    }
                    if !updated.is_empty() {
                        existing.last_activity_at = updated;
                    }
                } else {
                    self.sessions.push(SessionSummary {
                        session_id: st.session_id.clone(),
                        title: st.goal.clone(),
                        state: st.status.clone(),
                        created_at: created,
                        last_activity_at: updated,
                        ..Default::default()
                    });
                }
            }
            Payload::SessionDormant(s) => {
                self.set_session_state(&s.session_id, "dormant");
            }
            Payload::HitlRaised(h) => {
                // de-dup by intervention id (idempotent).
                if !self
                    .pending_hitl
                    .iter()
                    .any(|x| x.intervention_id == h.intervention_id)
                {
                    self.pending_hitl.push(HITLIntervention {
                        intervention_id: h.intervention_id.clone(),
                        agent_id: h.agent_id.clone(),
                        reason: h.description.clone(),
                        nature: if h.is_destructive {
                            "destructive_command".into()
                        } else {
                            "approval_request".into()
                        },
                        ..Default::default()
                    });
                }
            }
            Payload::Audit(a) if !self.audit_tail.iter().any(|x| x.entry_id == a.id) => {
                self.audit_tail.push(AuditEntry {
                    entry_id: a.id.clone(),
                    actor_id: a.actor.clone(),
                    actor_role: a.role.clone(),
                    action_type: a.action_type.clone(),
                    target_kind: a.target_type.clone(),
                    target_id: a.target_id.clone(),
                    reason: a.reason.clone(),
                    status: a.result.clone(),
                    ..Default::default()
                });
                if self.audit_tail.len() > AUDIT_TAIL_MAX {
                    let drop = self.audit_tail.len() - AUDIT_TAIL_MAX;
                    self.audit_tail.drain(0..drop);
                }
            }
            Payload::AgentReady(a) => {
                // Absolute state, folded by agent id (ADR-0047 D6). An absent
                // field is NOT a cleared one: a producer that does not populate
                // the 0074 detail fields must not blank what an earlier event
                // already established, so each is only overwritten when present.
                if let Some(existing) = self.agents.iter_mut().find(|x| x.id == a.agent_id) {
                    existing.trust_score = a.trust_score;
                    existing.last_activity_at = now_iso();
                    if !a.capabilities.is_empty() {
                        existing.capabilities = a.capabilities.clone();
                    }
                    if !a.description.is_empty() {
                        existing.description = a.description.clone();
                    }
                    if !a.r#trait.is_empty() {
                        existing.trait_ = a.r#trait.clone();
                    }
                    if !a.runtime.is_empty() {
                        existing.runtime = a.runtime.clone();
                    }
                    if !a.exec_path.is_empty() {
                        existing.exec_path = a.exec_path.clone();
                    }
                    if !a.manifest_version.is_empty() {
                        existing.manifest_version = a.manifest_version.clone();
                    }
                    if !a.classification_tags.is_empty() {
                        existing.classification_tags = a.classification_tags.clone();
                    }
                    existing.provisional = a.provisional;
                    existing.system = a.system;
                    existing.last_error = a.last_error.clone();
                } else {
                    self.agents.push(AgentSummary {
                        id: a.agent_id.clone(),
                        trait_: a.r#trait.clone(),
                        trust_score: a.trust_score,
                        last_activity_at: now_iso(),
                        capabilities: a.capabilities.clone(),
                        description: a.description.clone(),
                        runtime: a.runtime.clone(),
                        exec_path: a.exec_path.clone(),
                        manifest_version: a.manifest_version.clone(),
                        provisional: a.provisional,
                        system: a.system,
                        classification_tags: a.classification_tags.clone(),
                        last_error: a.last_error.clone(),
                        ..Default::default()
                    });
                }
            }
            Payload::MemoryWritten(m) if !self.memory_written.iter().any(|x| x.seq == ev.seq) => {
                self.memory_written.push(MemoryWrittenEvent {
                    seq: ev.seq,
                    doc_id: m.doc_id.clone(),
                    doc_type: m.doc_type.clone(),
                    session_id: m.session_id.clone(),
                    source: m.source.clone(),
                    summary: m.summary.clone(),
                    written_at: now_iso(),
                });
                if self.memory_written.len() > MEMORY_WRITTEN_MAX {
                    let drop = self.memory_written.len() - MEMORY_WRITTEN_MAX;
                    self.memory_written.drain(0..drop);
                }
            }
            Payload::ConversationProgress(p) => {
                // Ephemeral: seq is 0, so the cursor bump above is a no-op and
                // this can never be replayed on resume. Deliberate — replaying
                // "working on it" for a turn that ended an hour ago is worse
                // than showing nothing.
                if p.text.is_empty() {
                    // Empty text is the CLEAR signal, not an empty status line.
                    self.conversation_progress.remove(&p.conversation_id);
                } else {
                    self.conversation_progress.insert(
                        p.conversation_id.clone(),
                        ConversationProgress {
                            conversation_id: p.conversation_id.clone(),
                            text: p.text.clone(),
                            phase: p.phase.clone(),
                            step: p.step,
                            total_steps: p.total_steps,
                            r#final: p.r#final,
                            updated_at_unix_ms: p.updated_at_unix_ms,
                        },
                    );
                }
            }

            Payload::PipelineStep(st) => {
                self.pipeline_steps.push(PipelineStep {
                    pipeline_id: st.pipeline_id.clone(),
                    revision: st.revision,
                    run_id: st.run_id.clone(),
                    item_key: st.item_key.clone(),
                    node: st.node.clone(),
                    kind: st.kind.clone(),
                    port: st.port.clone(),
                    outcome: st.outcome.clone(),
                    reason: st.reason.clone(),
                    duration_ms: st.duration_ms,
                    payload: st.payload.clone(),
                    payload_bytes: st.payload_bytes,
                    dropped: st.dropped,
                    at_unix_ms: ts_millis(&ev.ts),
                });
                if self.pipeline_steps.len() > PIPELINE_STEPS_MAX {
                    let drop = self.pipeline_steps.len() - PIPELINE_STEPS_MAX;
                    self.pipeline_steps.drain(0..drop);
                }
            }

            Payload::PipelineMeters(m) => {
                // ABSOLUTE state, keyed by pipeline — the reading replaces the
                // previous one rather than accumulating beside it. A live
                // counter that appended would grow without bound and, worse,
                // would let a console add two readings of the same number.
                self.pipeline_meters.insert(
                    m.pipeline_id.clone(),
                    PipelineMeters {
                        pipeline_id: m.pipeline_id.clone(),
                        revision: m.revision,
                        nodes: m
                            .nodes
                            .iter()
                            .map(|n| PipelineNodeMeter {
                                node: n.node.clone(),
                                entered: n.entered,
                                in_flight: n.in_flight,
                                failed: n.failed,
                                passed_on: n.passed_on,
                                ports: n.ports.clone(),
                                mean_latency_ms: n.mean_latency_ms,
                            })
                            .collect(),
                    },
                );
            }

            Payload::RetentionRun(r) => {
                // Dedupe on the source's own run id rather than on `seq`: this
                // list survives a resync (see `reset_live`), so the same pass can
                // legitimately arrive twice — once live, once replayed — and a
                // seq-keyed guard would let the replay through as a second row.
                if !self
                    .retention_runs
                    .iter()
                    .any(|x| x.run_id == r.run_id && x.source == r.source)
                {
                    self.retention_runs.push(RetentionRunEvent {
                        source: r.source.clone(),
                        run_id: r.run_id,
                        started_at: ts_iso(&r.started_at),
                        finished_at: ts_iso(&r.finished_at),
                        deleted: r
                            .deleted
                            .iter()
                            .map(|d| RetentionDeletionEvent {
                                category: d.category.clone(),
                                count: d.count,
                            })
                            .collect(),
                        bounded: r.bounded,
                        error: r.error.clone(),
                    });
                    if self.retention_runs.len() > RETENTION_RUNS_MAX {
                        let drop = self.retention_runs.len() - RETENTION_RUNS_MAX;
                        self.retention_runs.drain(0..drop);
                    }
                }
            }

            Payload::WatchTriggered(w) => {
                if let Some(existing) = self
                    .watch_configs
                    .iter_mut()
                    .find(|x| x.id == w.watch_config_id)
                {
                    existing.last_fire_at = Some(now_iso());
                    existing.target_streams = vec![w.stream_id.clone()];
                    existing.last_fire_status = "ok".to_string();
                } else {
                    self.watch_configs.push(WatchConfigSummary {
                        id: w.watch_config_id.clone(),
                        target_streams: vec![w.stream_id.clone()],
                        last_fire_at: Some(now_iso()),
                        last_fire_status: "ok".to_string(),
                        ..Default::default()
                    });
                }
            }
            _ => {}
        }
        true
    }

    fn set_session_state(&mut self, id: &str, state: &str) {
        if let Some(s) = self.sessions.iter_mut().find(|s| s.session_id == id) {
            s.state = state.to_string();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pb::operator_event::Payload;

    // ADR-0089: plugin skew. The pinned table is a property of THIS build, so the
    // verdict is computed in the state of record and shipped to the webview.
    fn snapshot_with_plugins(plugins: Vec<pb::PluginInfoOp>) -> pb::SnapshotResponse {
        pb::SnapshotResponse {
            contract_version: pb::PINNED_CONTRACT_VERSION.to_string(),
            plugins,
            ..Default::default()
        }
    }

    fn plugin(id: &str, version: &str) -> pb::PluginInfoOp {
        pb::PluginInfoOp {
            id: id.to_string(),
            version: version.to_string(),
            state: "active".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn plugin_skew_distinguishes_major_from_minor() {
        // Same version: nothing to say.
        assert_eq!(pb::plugin_skew("authz", "1.0.0"), pb::PluginSkew::Aligned);
        // Below the major line: surfaces should still work.
        assert_eq!(pb::plugin_skew("authz", "1.4.2"), pb::PluginSkew::Minor);
        // Across the major line: the panels compiled here may be wrong.
        assert_eq!(pb::plugin_skew("authz", "2.0.0"), pb::PluginSkew::Major);
        // A plugin this console never pinned — unknown, not assumed compatible.
        assert_eq!(
            pb::plugin_skew("telegram", "1.0.0"),
            pb::PluginSkew::Unknown
        );
        // An unreadable version is exactly when NOT to claim compatibility.
        assert_eq!(pb::plugin_skew("authz", "nightly"), pb::PluginSkew::Unknown);
        assert_eq!(pb::plugin_skew("authz", ""), pb::PluginSkew::Unknown);
    }

    #[test]
    fn snapshot_projects_plugins_with_their_verdict() {
        let mut st = StateOfRecord::default();
        st.apply_snapshot(&snapshot_with_plugins(vec![
            plugin("authz", "2.0.0"),
            pb::PluginInfoOp {
                id: "reactive".to_string(),
                version: "1.0.0".to_string(),
                state: "not_entitled".to_string(),
                reason: "licence expired".to_string(),
                ..Default::default()
            },
        ]));

        assert_eq!(st.plugins.len(), 2);
        assert_eq!(st.plugins[0].skew, "major");
        assert_eq!(st.plugins[0].pinned_version, "1.0.0");
        // A plugin that did not register is still projected, with its reason —
        // silence about a plugin the operator paid for is the failure this closes.
        assert_eq!(st.plugins[1].state, "not_entitled");
        assert_eq!(st.plugins[1].reason, "licence expired");
        assert_eq!(st.plugins[1].skew, "aligned");
    }

    #[test]
    fn an_oss_kernel_reports_no_plugins() {
        let mut st = StateOfRecord::default();
        st.apply_snapshot(&snapshot_with_plugins(vec![]));
        assert!(
            st.plugins.is_empty(),
            "no plugins is a correct deployment, not a warning"
        );
        assert_eq!(st.contract_skew, 0);
    }

    // A resync must not leave a plugin behind from the previous kernel.
    #[test]
    fn plugins_are_replaced_wholesale_on_resnapshot() {
        let mut st = StateOfRecord::default();
        st.apply_snapshot(&snapshot_with_plugins(vec![plugin("authz", "1.0.0")]));
        st.apply_snapshot(&snapshot_with_plugins(vec![plugin("reactive", "1.0.0")]));
        assert_eq!(st.plugins.len(), 1);
        assert_eq!(st.plugins[0].id, "reactive");
    }

    fn agent_ready(seq: u64, agent_id: &str, trust_score: f64) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq,
            payload: Some(Payload::AgentReady(pb::AgentReadyOp {
                agent_id: agent_id.to_string(),
                trust_score,
                ..Default::default()
            })),
            ..Default::default()
        }
    }

    fn session_state(seq: u64, id: &str, status: &str, goal: &str) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq,
            payload: Some(Payload::SessionState(pb::SessionStateOp {
                session_id: id.to_string(),
                status: status.to_string(),
                goal: goal.to_string(),
                created_at: Some(::prost_types::Timestamp {
                    seconds: 1_700_000_000,
                    nanos: 0,
                }),
                updated_at: Some(::prost_types::Timestamp {
                    seconds: 1_700_000_500,
                    nanos: 0,
                }),
                ..Default::default()
            })),
            ..Default::default()
        }
    }

    // A session created after the console connected must appear immediately. Before contract
    // 0064 the feed had no "created" signal at all, so new sessions stayed invisible until
    // the next snapshot.
    #[test]
    fn session_state_inserts_unknown_session() {
        let mut st = StateOfRecord::default();
        st.fold(&session_state(1, "s1", "active", "ship it"));

        assert_eq!(st.sessions.len(), 1);
        assert_eq!(st.sessions[0].session_id, "s1");
        assert_eq!(st.sessions[0].state, "active");
        assert_eq!(st.sessions[0].title, "ship it");
        assert!(
            !st.sessions[0].created_at.is_empty(),
            "created_at must be populated"
        );
        assert!(!st.sessions[0].last_activity_at.is_empty());
    }

    // Absolute state: a later event upserts rather than duplicating.
    #[test]
    fn session_state_upserts_existing_session() {
        let mut st = StateOfRecord::default();
        st.fold(&session_state(1, "s1", "active", "ship it"));
        st.fold(&session_state(2, "s1", "paused", "ship it"));

        assert_eq!(st.sessions.len(), 1, "must upsert, not duplicate");
        assert_eq!(st.sessions[0].state, "paused");
    }

    // "paused" was previously unreachable paint: nothing could ever set it.
    #[test]
    fn session_state_reaches_every_status() {
        let mut st = StateOfRecord::default();
        for status in ["active", "paused", "dormant", "completed"] {
            st.fold(&session_state(1, "s1", status, "g"));
            assert_eq!(st.sessions[0].state, status);
        }
    }

    fn retention_run(seq: u64, source: &str, run_id: i64, error: &str) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq,
            payload: Some(Payload::RetentionRun(pb::RetentionRunOp {
                source: source.to_string(),
                run_id,
                error: error.to_string(),
                deleted: vec![pb::RetentionDeletionOp {
                    category: "record_versions".to_string(),
                    count: 5000,
                }],
                ..Default::default()
            })),
            ..Default::default()
        }
    }

    #[test]
    fn retention_runs_dedupe_on_source_and_run_id() {
        // The same pass legitimately arrives twice — live, then replayed after a
        // snapshot — and a second row would misreport how many passes ran.
        let mut st = StateOfRecord::default();
        st.fold(&retention_run(1, "records", 7, ""));
        st.fold(&retention_run(2, "records", 7, ""));
        assert_eq!(st.retention_runs.len(), 1);
    }

    #[test]
    fn two_sources_may_share_a_run_id() {
        // run_id is the SOURCE's own id, so it is only unique within a source.
        let mut st = StateOfRecord::default();
        st.fold(&retention_run(1, "records", 1, ""));
        st.fold(&retention_run(2, "reactive_journal", 1, ""));
        assert_eq!(st.retention_runs.len(), 2);
    }

    #[test]
    fn a_resync_does_not_erase_evidence_that_retention_failed() {
        // A snapshot carries no retention history, so clearing this on resync
        // would let an ordinary cursor event delete the record of a failed pass —
        // in a product whose argument is auditability.
        let mut st = StateOfRecord::default();
        st.fold(&retention_run(1, "records", 7, "delete: context deadline exceeded"));
        st.reset_live();
        assert_eq!(st.retention_runs.len(), 1);
        assert!(!st.retention_runs[0].error.is_empty());
    }

    fn watch_triggered(seq: u64, watch_config_id: &str, stream_id: &str) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq,
            payload: Some(Payload::WatchTriggered(pb::WatchTriggeredOp {
                watch_config_id: watch_config_id.to_string(),
                stream_id: stream_id.to_string(),
                ..Default::default()
            })),
            ..Default::default()
        }
    }

    fn progress(conv: &str, text: &str, fin: bool) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq: 0,
            payload: Some(Payload::ConversationProgress(pb::ConversationProgressOp {
                conversation_id: conv.into(),
                text: text.into(),
                phase: "retrieval".into(),
                step: 1,
                total_steps: 3,
                r#final: fin,
                updated_at_unix_ms: 1,
            })),
            ..Default::default()
        }
    }

    #[test]
    fn progress_supersedes_and_never_moves_the_cursor() {
        let mut s = StateOfRecord::default();
        s.fold(&session_state(7, "s1", "active", "g"));
        assert_eq!(s.cursor, 7);

        s.fold(&progress("c1", "Searching memory", false));
        s.fold(&progress("c1", "Reading 4 documents", false));

        // One line per conversation — the newest wins.
        assert_eq!(s.conversation_progress.len(), 1);
        assert_eq!(s.conversation_progress["c1"].text, "Reading 4 documents");
        // seq 0 must not rewind or advance the resume cursor.
        assert_eq!(s.cursor, 7);
    }

    #[test]
    fn empty_progress_text_clears_the_line() {
        let mut s = StateOfRecord::default();
        s.fold(&progress("c1", "Searching memory", false));
        s.fold(&progress("c1", "", true));
        // The final update carries nothing to say, so the line comes DOWN rather
        // than sticking as a blank row.
        assert!(s.conversation_progress.is_empty());
    }

    fn plan_state(
        seq: u64,
        plan: &str,
        status: &str,
        terminal: bool,
        steps: Vec<(&str, &str)>,
    ) -> pb::OperatorEvent {
        pb::OperatorEvent {
            seq,
            payload: Some(Payload::PlanState(pb::PlanStateOp {
                session_id: "sess-1".into(),
                plan_id: plan.into(),
                status: status.into(),
                terminal,
                steps: steps
                    .into_iter()
                    .enumerate()
                    .map(|(i, (label, st))| pb::PlanStepOp {
                        index: i as i32,
                        label: label.into(),
                        status: st.into(),
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            })),
            ..Default::default()
        }
    }

    #[test]
    fn a_finished_plan_leaves_in_flight_but_keeps_its_outcome() {
        let mut s = StateOfRecord::default();
        s.fold(&plan_state(1, "p1", "running", false, vec![
            ("write the file", "running"),
            ("summarise it", "pending"),
        ]));
        assert_eq!(s.plans.len(), 1);

        s.fold(&plan_state(2, "p1", "completed", true, vec![]));

        // Plans in Flight must not keep a finished plan...
        assert!(s.plans.is_empty());
        // ...but "it finished" has to stay distinguishable from "it never
        // reported", which is the whole bug: both used to read as absent.
        assert_eq!(s.completed_plans.len(), 1);
        assert_eq!(s.completed_plans[0].status, "completed");
        // A terminal update carrying no steps must not blank the ladder.
        assert_eq!(s.completed_plans[0].steps.len(), 2);
    }

    #[test]
    fn a_terminal_plan_never_seen_running_is_still_recorded() {
        let mut s = StateOfRecord::default();
        // Fast plans can finish before the console folds any live update.
        s.fold(&plan_state(1, "p2", "completed", true, vec![("do it", "done")]));
        assert!(s.plans.is_empty());
        assert_eq!(s.completed_plans.len(), 1);
        assert_eq!(s.completed_plans[0].plan_id, "p2");
        assert_eq!(s.completed_plans[0].steps.len(), 1);
    }

    #[test]
    fn a_redelivered_terminal_event_updates_rather_than_duplicates() {
        let mut s = StateOfRecord::default();
        s.fold(&plan_state(1, "p3", "completed", true, vec![]));
        s.fold(&plan_state(2, "p3", "completed", true, vec![]));
        assert_eq!(s.completed_plans.len(), 1);
    }

    #[test]
    fn fold_agent_ready_inserts_then_updates_idempotently() {
        let mut s = StateOfRecord::default();
        assert!(s.fold(&agent_ready(1, "a1", 0.5)));
        assert_eq!(s.agents.len(), 1);
        assert_eq!(s.agents[0].id, "a1");
        assert_eq!(s.agents[0].trust_score, 0.5);
        assert!(!s.agents[0].last_activity_at.is_empty());

        assert!(s.fold(&agent_ready(2, "a1", 0.9)));
        assert_eq!(s.agents.len(), 1);
        assert_eq!(s.agents[0].trust_score, 0.9);
        assert_eq!(s.cursor, 2);
    }

    #[test]
    fn fold_watch_triggered_inserts_then_updates_idempotently() {
        let mut s = StateOfRecord::default();
        assert!(s.fold(&watch_triggered(3, "w1", "stream-1")));
        assert_eq!(s.watch_configs.len(), 1);
        assert_eq!(s.watch_configs[0].id, "w1");
        assert_eq!(
            s.watch_configs[0].target_streams,
            vec!["stream-1".to_string()]
        );
        assert_eq!(s.watch_configs[0].last_fire_status, "ok");
        assert!(s.watch_configs[0].last_fire_at.is_some());

        assert!(s.fold(&watch_triggered(4, "w1", "stream-2")));
        assert_eq!(s.watch_configs.len(), 1);
        assert_eq!(
            s.watch_configs[0].target_streams,
            vec!["stream-2".to_string()]
        );
    }

    #[test]
    fn fold_token_is_live_only_and_does_not_advance_cursor() {
        let mut s = StateOfRecord::default();
        s.cursor = 7;
        let ev = pb::OperatorEvent {
            seq: 0,
            payload: Some(Payload::Token(pb::TokenChunkOp {
                ..Default::default()
            })),
            ..Default::default()
        };
        assert!(!s.fold(&ev));
        assert_eq!(s.cursor, 7);
    }
}

// ── Contract 0072–0076 surfaces ──────────────────────────────────────────────
//
// These mirror the TypeScript shapes in `src/ipc/types.ts`. Where the kernel does
// not serve a field the TS type declares, the value chosen here must read as
// "not reported" rather than as a real measurement — a fabricated zero is worse
// than an obvious gap, because a console cannot tell it apart from a true one.

/// One ADR-0098 progress snapshot (contract 0079).
///
/// Snapshots SUPERSEDE rather than accumulate: the projection keeps the latest
/// per conversation and the console renders one line. Appending them would turn
/// a status line into a log of itself.
#[derive(Clone, Serialize, Default)]
pub struct ConversationProgress {
    pub conversation_id: String,
    /// The rendered line. EMPTY means CLEAR — a final update with nothing to say
    /// takes the line down.
    pub text: String,
    pub phase: String,
    pub step: i32,
    pub total_steps: i32,
    pub r#final: bool,
    pub updated_at_unix_ms: i64,
}

/// One retention/compaction pass off the feed (`RetentionRunOp`, contract 0084).
///
/// Shaped identically to `records::RetentionRun` on the plugin plane on purpose:
/// the panel merges the two — the feed is the live lane, the RPC backfills the
/// history the feed cannot replay — and a console whose retention page showed a
/// different history depending on how long it had been connected would be worse
/// than one that showed none.
#[derive(Clone, Serialize, Default)]
pub struct RetentionRunEvent {
    /// The retention domain that ran, e.g. "records" or "reactive_journal". Read
    /// rather than assumed: one panel serves both sources.
    pub source: String,
    pub run_id: i64,
    pub started_at: String,
    pub finished_at: String,
    /// Empty means the pass ran and removed nothing — a normal outcome, not
    /// missing data.
    pub deleted: Vec<RetentionDeletionEvent>,
    /// Hit the per-pass cap; more remains. On every tick, the backlog is not
    /// draining.
    pub bounded: bool,
    /// Non-empty means the pass FAILED and erasure has stopped happening.
    pub error: String,
}

/// One category a pass removed.
#[derive(Clone, Serialize, Default)]
pub struct RetentionDeletionEvent {
    pub category: String,
    pub count: i32,
}

/// What happened to ONE key in a durable config write (contract 0072/0083).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigWriteOutcome {
    pub key: String,
    pub stored: bool,
    /// "live" | "restart_required" | "shadowed" | "rejected". Passed through
    /// verbatim: a console renders its copy from this word, and flattening it to
    /// ok/failed is what makes a stored-but-inert setting look applied.
    pub effect: String,
    /// Names the layer winning over the store ("env:CAMBRIAN_…"), and only when
    /// effect == "shadowed". "Something pins this" leaves an operator hunting.
    pub shadowed_by: String,
    pub error: String,
}

/// A durable config write, per key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigWriteResult {
    pub command_id: String,
    pub deduped: bool,
    /// Empty when the kernel answered with a bare ack — the absence of an error
    /// is the result, and no outcome is invented to fill the gap.
    pub outcomes: Vec<ConfigWriteOutcome>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct GeneratorSpec {
    pub id: String,
    pub protocol: String,
    pub endpoint: String,
    pub model: String,
    pub timeout_ms: i64,
    pub capability_tags: Vec<String>,
    pub native_tools: bool,
    pub disable_thinking: bool,
    pub breaker: String,
    pub recent_failures: i32,
    /// -1 = not measured by this kernel. The kernel tracks breaker state and
    /// failure counts but no latency percentiles, and reporting 0 ms would claim
    /// an instantaneous endpoint.
    pub p50_latency_ms: i64,
    pub p99_latency_ms: i64,
    /// -1 = not tracked (contract 0072). Distinct from 0, which would make a busy
    /// generator look idle.
    pub tokens_today: i64,
    pub calls_today: i64,
    pub latency_samples: Vec<i64>,
    /// The only credential facts on the wire. There is no key field and no RPC
    /// that returns one.
    pub key_configured: bool,
    pub key_last_four: String,
    /// "env:<VAR>" or "store" — where the ACTIVE credential comes from, so an
    /// operator can see why a pasted key had no effect.
    pub key_source: String,
    pub is_default: bool,
}

#[derive(Clone, Serialize, Default)]
pub struct RoleAssignment {
    pub role: String,
    pub generator_id: String,
    /// Set when `generator_id` names a generator that does not exist: the role
    /// silently falls back to the default, and nothing else in the system says so.
    pub falling_back_to: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct GeneratorTestResult {
    pub reachable: bool,
    pub round_trip_ms: i64,
    pub authenticated: bool,
    /// The model string the ENDPOINT echoed back — the field this probe exists
    /// for. An endpoint answering happily with a different build is the most
    /// common misconfiguration here and is invisible in a successful generation.
    pub model_served: String,
    /// What the probe asked the endpoint for.
    pub model_requested: String,
    pub model_matches: bool,
    /// Whether tool-calling was exercised at all. False = NOT TESTED, which is
    /// not the same as failed and must not be drawn as one.
    pub native_tools_checked: bool,
    pub native_tools_ok: bool,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub tokens_cached: i64,
    pub error: String,
}

#[derive(Clone, Serialize, Default)]
pub struct ConfigSchema {
    pub schema_version: String,
    pub schema_json: String,
    pub schema_hash: String,
    pub editable_keys: Vec<String>,
    pub kernel_only_keys: Vec<String>,
    /// The live values, keyed as the write path keys them.
    pub current_values: std::collections::HashMap<String, f64>,
    /// key → "default" | "tuning.json" | "store" | "env:CAMBRIAN_…" | "runtime".
    /// An "env:" source means a write to this key will be SHADOWED.
    pub value_source: std::collections::HashMap<String, String>,
}

#[derive(Clone, Serialize, Default)]
pub struct ClassifiedInput {
    /// One of chat | plan | ingest | watch | clarification. FIVE values, not
    /// three: `ingest` WRITES to memory, so collapsing it into another makes an
    /// operator approve a write believing they approved a question.
    pub classification: String,
    pub why: String,
    pub confidence: f64,
    pub clarification_question: String,
    pub clarification_options: Vec<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct InterviewOption {
    pub label: String,
    pub detail: String,
    /// -1 = not counted. A 0 is a real and alarming answer ("this option would
    /// search nothing"); "we could not count" is not the same statement.
    pub document_count: i32,
}

#[derive(Clone, Serialize, Default)]
pub struct InterviewQuestion {
    pub question: String,
    pub kind: String,
    pub options: Vec<InterviewOption>,
    pub why_it_changes_the_answer: String,
}

// Deserialize as well as Serialize: an authored step travels INBOUND from the
// webview (SubmitPlan) as well as outbound in a proposal, and the round trip
// through both directions is what lets "Run it" on a proposal card hand straight
// to SubmitPlan without reshaping.
#[derive(Clone, Serialize, serde::Deserialize, Default)]
pub struct AuthoredStep {
    pub query: String,
    pub required_capabilities: Vec<String>,
    pub depends_on: Vec<i32>,
    pub max_energy: f64,
    pub recommended_model: String,
    pub checkpoint_after: bool,
    pub checkpoint_query: String,
    pub is_thought: bool,
    /// SOFT pin — goes first, ranking still runs behind it.
    pub preferred_agent: String,
    /// Pin STRENGTH ("soft" | "hard"). A hard pin kills the step rather than
    /// cascading, so the two must stay distinguishable.
    pub agent_pin: String,
    /// -1 = not a fan-out. 0 is a legitimate step index, so absence needs a
    /// sentinel of its own.
    pub fan_out_over: i32,
    pub fan_out_var: String,
}

#[derive(Clone, Serialize, Default)]
pub struct PlanProposal {
    pub steps: Vec<AuthoredStep>,
    pub estimated_tokens: i64,
    pub estimated_wall_ms: i64,
    pub max_parallel: i32,
    pub access_note: String,
}

#[derive(Clone, Serialize, Default)]
pub struct PlanProposalResponse {
    /// Non-empty ⇒ too vague to plan. Render these INSTEAD of a proposal: showing
    /// a runnable plan beside a question invites approving the plan and skipping
    /// the question.
    pub questions: Vec<InterviewQuestion>,
    pub proposal: Option<PlanProposal>,
    pub access_consequence: String,
}

#[derive(Clone, Serialize, Default)]
pub struct PlanValidationIssue {
    pub step_index: i32,
    pub code: String,
    pub message: String,
    /// Fatal blocks submission; advisory does not. Conflating them either blocks
    /// valid plans or runs broken ones.
    pub fatal: bool,
}

#[derive(Clone, Serialize, Default)]
pub struct SubmitPlanResult {
    pub command_id: String,
    pub deduped: bool,
    pub accepted: bool,
    pub session_id: String,
    pub plan_id: String,
    pub issues: Vec<PlanValidationIssue>,
    /// The topological order the executor would really use — the question a DAG
    /// author is asking once the graph passes a handful of nodes.
    pub execution_order: Vec<i32>,
}

// ---- Pipeline dry run (contract 0088) --------------------------------------

/// What a shadow run observed: everything the pipeline would have done, and
/// nothing it did.
///
/// Four lists rather than one outcome per item, on purpose. "47 would be saved"
/// and "3 skipped because under the reporting threshold" answer different
/// questions, and folding them into a single stream leaves an operator counting
/// rows to learn what a heading could have told them.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineDryRun {
    /// The named constraint when the run could not happen at all. Set means
    /// every other field is empty — and a console must render THIS, because an
    /// empty report looks exactly like a clean one and means the opposite.
    pub refused: String,
    pub run_id: String,
    pub samples: i32,
    pub effects: Vec<ShadowEffect>,
    pub duplicates: Vec<DuplicateEffectKey>,
    pub terminations: Vec<PipelineTermination>,
    /// Items a node could not process. Deliberately not "unrouted": the compiler
    /// refuses a graph with an unwired port, so an item reaching no port at all
    /// is structurally impossible.
    pub failures: Vec<PipelineFailure>,
    /// How long the replay took — the figure that says whether running it over
    /// more deliveries is worth doing.
    pub elapsed_ms: i64,
}

/// One effect that would have been carried out.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct ShadowEffect {
    pub node: String,
    pub kind: String,
    /// The real derived key, not a placeholder — which is what makes a collision
    /// detectable here rather than weeks later.
    pub effect_key: String,
    pub item_key: String,
    pub summary: String,
}

/// One key that more than one effect would have used.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct DuplicateEffectKey {
    pub effect_key: String,
    pub count: i32,
    pub nodes: Vec<String>,
}

/// One declared discard and how many items took it.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineTermination {
    pub node: String,
    pub port: String,
    /// The operator's own words from the spec.
    pub reason: String,
    pub count: i32,
}

/// One item a node could not process.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineFailure {
    pub node: String,
    pub item_key: String,
    pub err: String,
}

// ---- Pipeline authoring (contract 0089) ------------------------------------

/// One constraint a graph broke, and where it broke it.
///
/// The target is what makes a refusal actionable rather than merely readable: a
/// console draws it on the port it concerns and offers to jump to it.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Refusal {
    /// The STABLE rule identifier. The console keys behaviour off it — which
    /// refusals offer "wire it", which offer "terminate it with a reason" — so
    /// it must not change when the wording does.
    pub constraint: String,
    /// Empty when the refusal is about the pipeline or a whole scope. The
    /// console offers "take me there" only when `node` is set.
    pub node: String,
    pub port: String,
    /// Names the constraint, then the action. Never a validity verdict.
    pub message: String,
}

/// One authored revision, as authored, plus what the compiler says about it now.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineGraph {
    /// Set when the revision cannot be read at all.
    pub refused: String,
    pub summary: PipelineSummary,
    /// The ADR-0114 pipeline document.
    pub graph_json: String,
    pub refusals: Vec<Refusal>,
    /// Per node, the payload paths its expressions read — from the compiled AST,
    /// so it cannot disagree with what the runtime will read.
    pub reads: Vec<NodeReads>,
}

/// One node and the payload paths it reads.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct NodeReads {
    pub node: String,
    /// Qualified by root: `item.x`, `signal.y`. `item.*` means the whole payload.
    pub paths: Vec<String>,
}

/// The compiler's answer about a graph being edited and not yet stored.
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineValidation {
    /// The DOCUMENT could not be read. Distinct from a refusal list, which means
    /// it was read and broke rules.
    pub refused: String,
    pub refusals: Vec<Refusal>,
    pub node_count: i32,
    pub effect_node_count: i32,
    pub plan_checksum: String,
    pub semantics_checksum: String,
}

/// The outcome of storing an edited graph (contract 0090).
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PipelineSaved {
    /// Set when nothing was stored at all.
    pub refused: String,
    pub pipeline_id: String,
    /// The DRAFT revision created. Editing never overwrites a published, armed
    /// or retired revision — a run pins a revision.
    pub revision: i32,
    /// What the compiler said. Present and non-blocking: refusals hold Publish,
    /// not Save.
    pub refusals: Vec<Refusal>,
}
