import { describe, expect, it } from 'vitest';
import { planProgress, rankSessions, sessionStateCounts } from './sessions';
import type { HITLIntervention, PlanInFlight, SessionSummary } from '@/ipc/types';

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 's1',
    title: 'A goal',
    state: 'active',
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    plan_count: 0,
    agent_mix: [],
    cost: 0,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanInFlight> = {}): PlanInFlight {
  return {
    plan_id: 'p1',
    session_id: 's1',
    subject: 'subject',
    step_count: 2,
    active_agent: null,
    status: 'running',
    elapsed_ms: 0,
    cost: 0,
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

function hitl(overrides: Partial<HITLIntervention> = {}): HITLIntervention {
  return {
    intervention_id: 'h1',
    plan_id: 'p1',
    step_id: '04',
    agent_id: 'a1',
    nature: 'approval_request',
    proposed_action: {},
    intended_action: null,
    reason: 'needs approval',
    raised_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('rankSessions', () => {
  it('puts a session waiting on a human above one that is merely running', () => {
    // This is the whole point of the ordering. A blocked session goes QUIET,
    // so reverse-chronological — what this replaced — buries the only row that
    // needs a person underneath the ones that are fine unattended.
    const waiting = session({ session_id: 'waiting', last_activity_at: new Date(Date.now() - 60_000).toISOString() });
    const running = session({ session_id: 'running', last_activity_at: new Date().toISOString() });

    const ranked = rankSessions(
      [running, waiting],
      [hitl({ plan_id: 'p-waiting' })],
      [plan({ plan_id: 'p-waiting', session_id: 'waiting' }), plan({ plan_id: 'p-running', session_id: 'running' })],
    );

    expect(ranked.map((r) => r.session.session_id)).toEqual(['waiting', 'running']);
    expect(ranked[0].attention).toBe('waiting');
    expect(ranked[0].blocking?.intervention_id).toBe('h1');
  });

  it('orders running above paused above a task with no work', () => {
    const ranked = rankSessions(
      [
        // No plans at all: NOT "idle" — nothing was ever created for it.
        session({ session_id: 'never-started' }),
        session({ session_id: 'paused', state: 'paused' }),
        session({ session_id: 'running' }),
      ],
      [],
      [plan({ plan_id: 'p', session_id: 'running', status: 'running' })],
    );

    expect(ranked.map((r) => r.attention)).toEqual(['running', 'paused', 'pending']);
  });

  // A task is either working or it is not — and when it is not, the row owes an
  // explanation. "Idle" was the bucket that hid the commonest case in the list:
  // work that FINISHED but whose task nothing ever closed.
  it('reads a task whose plans all finished as done, not idle', () => {
    const s = session({ session_id: 'ran' });
    const [r] = rankSessions([s], [], [
      plan({ plan_id: 'p', session_id: 'ran', status: 'completed' }),
    ]);
    expect(r.attention).toBe('done');
  });

  it('sorts by last activity inside a group, newest first', () => {
    const older = session({ session_id: 'older', last_activity_at: new Date(Date.now() - 10_000).toISOString() });
    const newer = session({ session_id: 'newer', last_activity_at: new Date().toISOString() });

    const ranked = rankSessions([older, newer], [], []);
    expect(ranked.map((r) => r.session.session_id)).toEqual(['newer', 'older']);
  });

  it('sorts a session with no timestamp last within its group rather than at random', () => {
    // The kernel's SessionSummaryOp leaves last_activity_at empty, so this is
    // the common case, not an edge case. NaN comparisons are all false, which
    // would otherwise leave placement up to the input order.
    const undated = session({ session_id: 'undated', last_activity_at: '' });
    const dated = session({ session_id: 'dated' });

    expect(rankSessions([undated, dated], [], []).map((r) => r.session.session_id)).toEqual([
      'dated',
      'undated',
    ]);
  });

  it('treats a blocked session as waiting even though the kernel still calls it active', () => {
    // SessionState says nothing about HITL: a session held at an approval is
    // still `active`, so attention has to come from the intervention itself.
    const ranked = rankSessions(
      [session({ session_id: 's1', state: 'active' })],
      [hitl()],
      [plan()],
    );
    expect(ranked[0].session.state).toBe('active');
    expect(ranked[0].attention).toBe('waiting');
  });

  it('ignores an intervention whose plan is not in the projection', () => {
    const ranked = rankSessions([session()], [hitl({ plan_id: 'unknown-plan' })], [plan()]);
    expect(ranked[0].attention).not.toBe('waiting');
  });
});

describe('sessionStateCounts', () => {
  it('counts every state, including the ones at zero', () => {
    const counts = sessionStateCounts([session(), session(), session({ state: 'paused' })]);
    expect(counts).toEqual({ active: 2, paused: 1, dormant: 0, completed: 0 });
  });
});

describe('planProgress', () => {
  it('is null when the plan has no DAG yet, rather than zero', () => {
    // Snapshots do not carry the graph. Zero would draw an empty rail, which
    // reads as "nothing has happened" instead of "not reported".
    expect(planProgress(plan())).toBeNull();
  });

  it('is the share of done steps once the DAG arrives', () => {
    const p = plan({
      steps: [
        { index: 0, label: 'a', depends_on: [], is_thought: false, status: 'done', agent: null },
        { index: 1, label: 'b', depends_on: [0], is_thought: false, status: 'running', agent: null },
      ],
    });
    expect(planProgress(p)).toBe(50);
  });
});

describe('task states the list must not collapse into idle', () => {
  // A completed session is a FACT the kernel asserts. Rendering it as "idle"
  // meant finished work sat in the list looking merely quiet, forever.
  it('marks a completed session as finished', () => {
    const [r] = rankSessions([session({ state: 'completed' })], [], []);
    expect(r.attention).toBe('done');
  });

  // The most misleading row this list could produce: the work died and the row
  // looked like nothing was happening.
  it('marks a session whose plan failed as failed, not idle', () => {
    const s = session();
    const failedPlan = plan({ session_id: s.session_id, status: 'failed' });
    const [r] = rankSessions([s], [], [failedPlan]);
    expect(r.attention).toBe('failed');
  });

  // A failure alongside live work is still running: something is moving, and
  // the row should say so rather than reporting the older failure.
  it('prefers running over a previous failure in the same task', () => {
    const s = session();
    const [r] = rankSessions([s], [], [
      plan({ session_id: s.session_id, status: 'failed', plan_id: 'p-old' }),
      plan({ session_id: s.session_id, status: 'running', plan_id: 'p-new' }),
    ]);
    expect(r.attention).toBe('running');
  });

  // Dormant is asleep on purpose — it wakes on its next bid. Showing it as idle
  // makes a task behaving correctly look neglected.
  it('keeps dormant distinct from idle', () => {
    const [r] = rankSessions([session({ state: 'dormant' })], [], []);
    expect(r.attention).toBe('dormant');
  });

  it('sorts a failure above anything still running, and finished work last', () => {
    const failing = session({ session_id: 'fail' });
    const runningS = session({ session_id: 'run' });
    const doneS = session({ session_id: 'done', state: 'completed' });

    const ranked = rankSessions([doneS, runningS, failing], [], [
      plan({ session_id: 'fail', status: 'failed', plan_id: 'p1' }),
      plan({ session_id: 'run', status: 'running', plan_id: 'p2' }),
    ]);

    expect(ranked.map((r) => r.session.session_id)).toEqual(['fail', 'run', 'done']);
  });
});
