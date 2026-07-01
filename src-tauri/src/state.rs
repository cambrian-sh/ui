//! The client-side **state of record** (ADR-0047: the Rust core owns it; the
//! webview is a projection). Events are folded idempotently (absolute-state,
//! last-writer-wins by id) so re-delivery after a Snapshot is harmless.

use std::collections::HashMap;

use serde::Serialize;

use crate::pb;

/// Connection lifecycle, surfaced to the webview as a first-class state.
#[derive(Clone, Copy, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
    Connecting,
    Live,
    Reconnecting,
    Unreachable,
}

#[derive(Clone, Serialize, Default)]
pub struct PlanInFlight {
    pub session_id: String,
    pub plan_id: String,
    pub active_step: i32,
    pub status: String,
    pub active_agent: String,
    pub cost_so_far: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct SessionSummary {
    pub id: String,
    pub goal: String,
    pub status: String,
}

#[derive(Clone, Serialize, Default)]
pub struct AuditEntry {
    pub id: String,
    pub command_id: String,
    pub actor: String,
    pub action_type: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: String,
    pub result: String,
}

#[derive(Clone, Serialize, Default)]
pub struct HitlRaised {
    pub intervention_id: String,
    pub session_id: String,
    pub agent_id: String,
    pub description: String,
    pub is_destructive: bool,
}

/// The full projection pushed to the webview. Kept small and serde-friendly.
#[derive(Clone, Serialize, Default)]
pub struct StateOfRecord {
    pub connection: ConnectionStatus,
    pub role: Option<String>,
    pub kernel_version: String,
    pub contract_version: String,
    pub capabilities: Vec<String>,
    pub contract_skew: bool,
    /// Highest seq folded — the resume cursor.
    pub cursor: u64,
    pub plans: HashMap<String, PlanInFlight>,
    pub sessions: HashMap<String, SessionSummary>,
    /// Most-recent audit entries (bounded).
    pub audit_tail: Vec<AuditEntry>,
    /// The latest unresolved HITL intervention, if any.
    pub pending_hitl: Vec<HitlRaised>,
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
    }

    /// Apply a Snapshot's bounded live state and the capability/version handshake.
    pub fn apply_snapshot(&mut self, snap: &pb::SnapshotResponse) {
        self.reset_live();
        self.cursor = snap.as_of_seq;
        self.kernel_version = snap.kernel_version.clone();
        self.contract_version = snap.contract_version.clone();
        self.capabilities = snap.capabilities.clone();
        self.contract_skew = !snap.contract_version.is_empty()
            && snap.contract_version != pb::PINNED_CONTRACT_VERSION;
        for p in &snap.plans {
            self.plans.insert(p.plan_id.clone(), PlanInFlight {
                session_id: p.session_id.clone(),
                plan_id: p.plan_id.clone(),
                active_step: p.active_step,
                status: p.status.clone(),
                active_agent: p.active_agent.clone(),
                cost_so_far: p.cost_so_far,
            });
        }
        for s in &snap.sessions {
            self.sessions.insert(s.id.clone(), SessionSummary {
                id: s.id.clone(),
                goal: s.goal.clone(),
                status: s.status.clone(),
            });
        }
    }

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
                    self.plans.remove(&p.plan_id);
                } else {
                    self.plans.insert(p.plan_id.clone(), PlanInFlight {
                        session_id: p.session_id.clone(),
                        plan_id: p.plan_id.clone(),
                        active_step: p.active_step,
                        status: p.status.clone(),
                        active_agent: p.active_agent.clone(),
                        cost_so_far: p.cost_so_far,
                    });
                }
            }
            Payload::SessionDormant(s) => {
                self.set_session_status(&s.session_id, "dormant");
            }
            Payload::SessionCompleted(s) => {
                self.set_session_status(&s.session_id, "completed");
            }
            Payload::HitlRaised(h) => {
                // de-dup by intervention id (idempotent).
                if !self.pending_hitl.iter().any(|x| x.intervention_id == h.intervention_id) {
                    self.pending_hitl.push(HitlRaised {
                        intervention_id: h.intervention_id.clone(),
                        session_id: h.session_id.clone(),
                        agent_id: h.agent_id.clone(),
                        description: h.description.clone(),
                        is_destructive: h.is_destructive,
                    });
                }
            }
            Payload::Audit(a) => {
                if !self.audit_tail.iter().any(|x| x.command_id == a.command_id) {
                    self.audit_tail.push(AuditEntry {
                        id: a.id.clone(),
                        command_id: a.command_id.clone(),
                        actor: a.actor.clone(),
                        action_type: a.action_type.clone(),
                        target_type: a.target_type.clone(),
                        target_id: a.target_id.clone(),
                        reason: a.reason.clone(),
                        result: a.result.clone(),
                    });
                    if self.audit_tail.len() > AUDIT_TAIL_MAX {
                        let drop = self.audit_tail.len() - AUDIT_TAIL_MAX;
                        self.audit_tail.drain(0..drop);
                    }
                }
            }
            // auction / agent_ready / verifier / llm_health / memory_* / watch /
            // daemon: surfaced to the webview as raw feed events for now; richer
            // projections land with their console screens.
            _ => {}
        }
        true
    }

    fn set_session_status(&mut self, id: &str, status: &str) {
        self.sessions
            .entry(id.to_string())
            .or_insert_with(|| SessionSummary { id: id.to_string(), ..Default::default() })
            .status = status.to_string();
    }
}
