//! The client-side **state of record** (ADR-0047: the Rust core owns it; the
//! webview is a projection). Events are folded idempotently (absolute-state,
//! last-writer-wins by id) so re-delivery after a Snapshot is harmless.
//!
//! The struct shapes here MUST match `src/ipc/types.ts` exactly — Tauri
//! serializes this to JSON and sends it as the webview projection.

use std::collections::HashMap;

use chrono::Utc;
use serde::Serialize;

use crate::pb;

fn now_iso() -> String {
    Utc::now().to_rfc3339()
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
}

#[derive(Clone, Serialize, Default)]
pub struct ToolSummary {
    pub id: String,
    pub description: String,
    pub danger: bool,
    pub granted_agent_count: i32,
    pub recent_invocation_count: i32,
    pub last_cost: f64,
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
}

const AUDIT_TAIL_MAX: usize = 200;

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
        self.watch_configs.clear();
        self.lifecycle = LifecycleState::default();
        self.verifier_pool = VerifierPoolState::default();
        self.cost_dashboard = CostDashboard::default();
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
        { 1 } else { 0 };

        for p in &snap.plans {
            self.plans.push(PlanInFlight {
                session_id: p.session_id.clone(),
                plan_id: p.plan_id.clone(),
                active_agent: if p.active_agent.is_empty() { None } else { Some(p.active_agent.clone()) },
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
                    self.plans.retain(|x| x.plan_id != p.plan_id);
                } else if let Some(existing) = self.plans.iter_mut().find(|x| x.plan_id == p.plan_id) {
                    existing.session_id = p.session_id.clone();
                    existing.active_agent = if p.active_agent.is_empty() { None } else { Some(p.active_agent.clone()) };
                    existing.status = p.status.clone();
                    existing.cost = p.cost_so_far;
                    existing.step_count = p.active_step;
                } else {
                    self.plans.push(PlanInFlight {
                        session_id: p.session_id.clone(),
                        plan_id: p.plan_id.clone(),
                        active_agent: if p.active_agent.is_empty() { None } else { Some(p.active_agent.clone()) },
                        status: p.status.clone(),
                        cost: p.cost_so_far,
                        step_count: p.active_step,
                        ..Default::default()
                    });
                }
            }
            Payload::SessionDormant(s) => {
                self.set_session_state(&s.session_id, "dormant");
            }
            Payload::SessionCompleted(s) => {
                self.set_session_state(&s.session_id, "completed");
            }
            Payload::HitlRaised(h) => {
                // de-dup by intervention id (idempotent).
                if !self.pending_hitl.iter().any(|x| x.intervention_id == h.intervention_id) {
                    self.pending_hitl.push(HITLIntervention {
                        intervention_id: h.intervention_id.clone(),
                        agent_id: h.agent_id.clone(),
                        reason: h.description.clone(),
                        nature: if h.is_destructive { "destructive_command".into() } else { "approval_request".into() },
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
                if let Some(existing) = self.agents.iter_mut().find(|x| x.id == a.agent_id) {
                    existing.trust_score = a.trust_score;
                    existing.last_activity_at = now_iso();
                } else {
                    self.agents.push(AgentSummary {
                        id: a.agent_id.clone(),
                        trust_score: a.trust_score,
                        last_activity_at: now_iso(),
                        ..Default::default()
                    });
                }
            }
            Payload::WatchTriggered(w) => {
                if let Some(existing) = self.watch_configs.iter_mut().find(|x| x.id == w.watch_config_id) {
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
        assert_eq!(s.watch_configs[0].target_streams, vec!["stream-1".to_string()]);
        assert_eq!(s.watch_configs[0].last_fire_status, "ok");
        assert!(s.watch_configs[0].last_fire_at.is_some());

        assert!(s.fold(&watch_triggered(4, "w1", "stream-2")));
        assert_eq!(s.watch_configs.len(), 1);
        assert_eq!(s.watch_configs[0].target_streams, vec!["stream-2".to_string()]);
    }

    #[test]
    fn fold_token_is_live_only_and_does_not_advance_cursor() {
        let mut s = StateOfRecord::default();
        s.cursor = 7;
        let ev = pb::OperatorEvent {
            seq: 0,
            payload: Some(Payload::Token(pb::TokenChunkOp { ..Default::default() })),
            ..Default::default()
        };
        assert!(!s.fold(&ev));
        assert_eq!(s.cursor, 7);
    }
}
