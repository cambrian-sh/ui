//! Coalescing of `kernel://state` emits at the core→webview seam (ui/AGENTS.md
//! "Batch high-frequency event classes … deliver control classes immediately";
//! owner decision 2026-11-15 on T-20261113-studio-rust-core-emits-full-state-per-feed).
//!
//! Every structural feed event used to clone the WHOLE `StateOfRecord` and emit it.
//! Under a busy feed (agent steps, audit rows, plan ticks) that is one full-state
//! serialisation per event. The feed loop now asks this coalescer instead: a
//! control-class event (approvals, session lifecycle, terminal plans, health) is
//! emitted at once; a high-frequency one is emitted at most once per `window`, the
//! trailing change always delivered when the window closes, so the webview never
//! ends on a stale state.
//!
//! Token chunks are NOT handled here: they ride `kernel://token` one by one and the
//! webview batches them (`createChunkBatcher`, Shell.tsx). Owner decision (c) keeps
//! both halves.
//!
//! The coalescer is pure (time is passed in) so its rules are unit-tested without a
//! runtime.

use std::time::{Duration, Instant};

use crate::pb;

/// The emit window for high-frequency classes (~10 Hz; the rule says ~60fps/100ms).
pub const STATE_EMIT_WINDOW: Duration = Duration::from_millis(100);

/// True when a folded event must reach the webview immediately. Control classes are
/// the ones ui/AGENTS.md names (HITL, audit, errors, health) plus session lifecycle
/// and terminal plans; everything else (plan ticks, agent steps, memory writes,
/// watch fires, pipeline meters, progress) is high-frequency and may be coalesced.
pub fn is_control(ev: &pb::OperatorEvent) -> bool {
    use pb::operator_event::Payload;
    match &ev.payload {
        None => true,
        Some(Payload::PlanState(p)) => p.terminal,
        Some(
            Payload::HitlRaised(_)
            | Payload::HitlResolved(_)
            | Payload::SessionState(_)
            | Payload::SessionDormant(_)
            | Payload::DaemonCrashed(_)
            | Payload::MemoryPressure(_)
            | Payload::LlmHealth(_)
            | Payload::IntegrationHealth(_)
            | Payload::Audit(_)
            | Payload::Resync(_),
        ) => true,
        Some(_) => false,
    }
}

/// Decides when a state change is emitted. Call `on_change` for each structural
/// change, `flush_due` when the deadline fires, and emit whenever either says so.
#[derive(Debug)]
pub struct StateEmitCoalescer {
    window: Duration,
    last_emit: Option<Instant>,
    pending: bool,
}

impl StateEmitCoalescer {
    pub fn new(window: Duration) -> Self {
        Self { window, last_emit: None, pending: false }
    }

    /// A structural change happened at `now`. Returns true when the caller must emit
    /// now (control class, or the window since the last emit has passed); false when
    /// the change is held for `deadline`.
    pub fn on_change(&mut self, now: Instant, control: bool) -> bool {
        let window_open = self
            .last_emit
            .map_or(true, |t| now.saturating_duration_since(t) >= self.window);
        if control || window_open {
            self.emitted(now);
            true
        } else {
            self.pending = true;
            false
        }
    }

    /// When a held change must be emitted; None when nothing is held.
    pub fn deadline(&self) -> Option<Instant> {
        if !self.pending {
            return None;
        }
        Some(self.last_emit.map_or_else(Instant::now, |t| t + self.window))
    }

    /// The deadline fired (or the feed is ending): true when a held change must be
    /// emitted now.
    pub fn flush_due(&mut self, now: Instant) -> bool {
        if !self.pending {
            return false;
        }
        self.emitted(now);
        true
    }

    /// Record an emit made outside the coalescer (connection status, resync), which
    /// already carried every held change.
    pub fn emitted(&mut self, now: Instant) {
        self.last_emit = Some(now);
        self.pending = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pb::operator_event::Payload;

    fn ev(p: Payload) -> pb::OperatorEvent {
        pb::OperatorEvent { payload: Some(p), ..Default::default() }
    }

    #[test]
    fn first_change_emits_then_burst_is_held_until_the_window_closes() {
        let t0 = Instant::now();
        let mut c = StateEmitCoalescer::new(STATE_EMIT_WINDOW);
        assert!(c.on_change(t0, false), "first change emits at once");
        assert_eq!(c.deadline(), None);
        // 50 high-frequency changes inside the window → no emit, one pending.
        for i in 1..=50 {
            assert!(!c.on_change(t0 + Duration::from_millis(i), false));
        }
        assert_eq!(c.deadline(), Some(t0 + STATE_EMIT_WINDOW));
        // The trailing change is delivered exactly once when the deadline fires.
        assert!(c.flush_due(t0 + STATE_EMIT_WINDOW));
        assert!(!c.flush_due(t0 + STATE_EMIT_WINDOW));
        assert_eq!(c.deadline(), None);
    }

    #[test]
    fn control_change_emits_immediately_and_carries_held_changes() {
        let t0 = Instant::now();
        let mut c = StateEmitCoalescer::new(STATE_EMIT_WINDOW);
        assert!(c.on_change(t0, false));
        assert!(!c.on_change(t0 + Duration::from_millis(10), false));
        assert!(c.on_change(t0 + Duration::from_millis(20), true), "control is never held");
        assert_eq!(c.deadline(), None, "the control emit carried the held change");
    }

    #[test]
    fn change_after_the_window_emits_at_once() {
        let t0 = Instant::now();
        let mut c = StateEmitCoalescer::new(STATE_EMIT_WINDOW);
        assert!(c.on_change(t0, false));
        assert!(c.on_change(t0 + STATE_EMIT_WINDOW, false));
    }

    #[test]
    fn external_emit_clears_the_pending_change() {
        let t0 = Instant::now();
        let mut c = StateEmitCoalescer::new(STATE_EMIT_WINDOW);
        assert!(c.on_change(t0, false));
        assert!(!c.on_change(t0 + Duration::from_millis(5), false));
        c.emitted(t0 + Duration::from_millis(6));
        assert!(!c.flush_due(t0 + STATE_EMIT_WINDOW));
    }

    #[test]
    fn control_classes() {
        assert!(is_control(&ev(Payload::HitlRaised(Default::default()))));
        assert!(is_control(&ev(Payload::SessionState(Default::default()))));
        assert!(is_control(&ev(Payload::PlanState(pb::PlanStateOp {
            terminal: true,
            ..Default::default()
        }))));
        assert!(!is_control(&ev(Payload::PlanState(Default::default()))));
        assert!(!is_control(&ev(Payload::AgentStep(Default::default()))));
        assert!(is_control(&ev(Payload::Audit(Default::default()))));
        assert!(!is_control(&ev(Payload::MemoryWritten(Default::default()))));
    }
}
