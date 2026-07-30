import type {
  HITLIntervention,
  PlanInFlight,
  SessionState,
  SessionSummary,
} from '@/ipc/types';

/**
 * Why a session is at the top of the list.
 *
 * Ordered by urgency, and the numeric values are the sort key — `waiting`
 * sorts above `running` because a plan that has stopped to ask you something
 * is costing wall-clock time, whereas a running plan is fine unattended.
 */
export const ATTENTION_RANK = {
  waiting: 0,
  // A failure ranks second, above anything still moving. Nobody is watching a
  // task when its plan dies, so a failed task is a thing that has already gone
  // wrong and is waiting to be noticed — which is more urgent than a task that
  // is merely running. It sits below `waiting` only because `waiting` is an
  // explicit request with a human already blocked on it.
  failed: 1,
  running: 2,
  paused: 3,
  // Dormant is not idle: the kernel put it to sleep and it wakes on its next
  // bid, not on a timer. Collapsing the two makes a task look neglected when it
  // is behaving exactly as designed.
  dormant: 4,
  // A task with no work at all. It ranks above `done` because it is unresolved:
  // somebody asked for something and nothing was ever created for it.
  pending: 5,
  // Finished work sinks. It is the only state that needs nothing from anybody,
  // and it is what the list fills up with over time.
  done: 6,
} as const;

/**
 * There is no `idle`.
 *
 * A task is either working or it is not, and when it is not, the row owes an
 * explanation. "Idle" was neither — it was the bucket everything fell into once
 * its plans stopped, and it hid the single most common case in the list: work
 * that has FINISHED but whose task is still open.
 *
 * That case exists because nothing closes a task on its own. `SessionCompleted`
 * is set in one place in the kernel — the operator's explicit Complete command —
 * so a task whose plan ran to the end stays `active` indefinitely. The console
 * cannot fix that, but it can stop calling it idle: if every plan is done, the
 * WORK is finished, and the row says so while noting the task is still open.
 */

export type Attention = keyof typeof ATTENTION_RANK;

export interface SessionAttention {
  attention: Attention;
  /** The intervention blocking this session, if one is. */
  blocking: HITLIntervention | null;
  /** The session's plans, for the progress rail and the "why" line. */
  plans: PlanInFlight[];
}

/**
 * Which session each pending intervention belongs to.
 *
 * A HITLIntervention names a `plan_id`, not a session, so the join goes through
 * the plans the console already holds. An intervention whose plan is not in the
 * projection is skipped rather than guessed at — it will arrive on the feed.
 */
export function interventionsBySession(
  pendingHitl: readonly HITLIntervention[],
  plans: readonly PlanInFlight[],
): Map<string, HITLIntervention[]> {
  const sessionOfPlan = new Map(plans.map((p) => [p.plan_id, p.session_id]));
  const out = new Map<string, HITLIntervention[]>();
  for (const h of pendingHitl) {
    const sessionId = sessionOfPlan.get(h.plan_id);
    if (!sessionId) continue;
    const list = out.get(sessionId);
    if (list) list.push(h);
    else out.set(sessionId, [h]);
  }
  return out;
}

/** Group a projection's plans by the session that owns them. */
export function plansBySession(
  plans: readonly PlanInFlight[],
): Map<string, PlanInFlight[]> {
  const out = new Map<string, PlanInFlight[]>();
  for (const p of plans) {
    const list = out.get(p.session_id);
    if (list) list.push(p);
    else out.set(p.session_id, [p]);
  }
  return out;
}

/**
 * What a session needs from the operator right now.
 *
 * `waiting` is decided by an actual pending intervention rather than by session
 * state, because the kernel's SessionState says nothing about HITL: a session
 * blocked on an approval is still `active`.
 */
export function sessionAttention(
  session: SessionSummary,
  interventions: Map<string, HITLIntervention[]>,
  plans: Map<string, PlanInFlight[]>,
): SessionAttention {
  const blocking = interventions.get(session.session_id) ?? [];
  const sessionPlans = plans.get(session.session_id) ?? [];

  if (blocking.length > 0) {
    return { attention: 'waiting', blocking: blocking[0], plans: sessionPlans };
  }

  // The session's own state comes first where it is decisive. `completed` and
  // `dormant` are facts the kernel asserts about the session; a plan status
  // cannot override them.
  if (session.state === 'completed') {
    return { attention: 'done', blocking: null, plans: sessionPlans };
  }
  if (session.state === 'paused') {
    return { attention: 'paused', blocking: null, plans: sessionPlans };
  }

  const running = sessionPlans.some((p) => p.status === 'running' || p.status === 'forming');

  // A failed plan with nothing else running means the task stopped on an error.
  // This used to fall through to `idle`, so a task whose work had died looked
  // merely quiet — the single most misleading row this list could produce.
  if (!running && sessionPlans.some((p) => p.status === 'failed')) {
    return { attention: 'failed', blocking: null, plans: sessionPlans };
  }

  if (running) {
    return { attention: 'running', blocking: null, plans: sessionPlans };
  }
  if (session.state === 'dormant') {
    return { attention: 'dormant', blocking: null, plans: sessionPlans };
  }

  // Nothing is running and nothing failed. Either work was done and is over, or
  // no work was ever created — and those are different situations that used to
  // render identically.
  const attention: Attention = sessionPlans.length > 0 ? 'done' : 'pending';
  return { attention, blocking: null, plans: sessionPlans };
}

export interface RankedSession extends SessionAttention {
  session: SessionSummary;
}

/**
 * The session list order: what needs you, then what is moving, then the rest —
 * and only inside a group, by last activity.
 *
 * Plain reverse-chronological is what this replaces. It sorts by when a session
 * last *emitted* something, which is close to the opposite of what an operator
 * scanning the list wants: a session blocked on an approval goes quiet, so the
 * one thing that needs a human sinks to the bottom.
 */
export function rankSessions(
  sessions: readonly SessionSummary[],
  pendingHitl: readonly HITLIntervention[],
  allPlans: readonly PlanInFlight[],
): RankedSession[] {
  const interventions = interventionsBySession(pendingHitl, allPlans);
  const plans = plansBySession(allPlans);

  return sessions
    .map((session) => ({ session, ...sessionAttention(session, interventions, plans) }))
    .sort((a, b) => {
      const rank = ATTENTION_RANK[a.attention] - ATTENTION_RANK[b.attention];
      if (rank !== 0) return rank;
      const at = new Date(a.session.last_activity_at).getTime();
      const bt = new Date(b.session.last_activity_at).getTime();
      // A session with no timestamp sorts last within its group rather than
      // first: NaN comparisons are false, which would otherwise leave it
      // wherever the input happened to put it.
      if (!Number.isFinite(at)) return Number.isFinite(bt) ? 1 : 0;
      if (!Number.isFinite(bt)) return -1;
      return bt - at;
    });
}

/** Counts for the state filter labels — the filter says how much it will show. */
export function sessionStateCounts(
  sessions: readonly SessionSummary[],
): Record<SessionState, number> {
  const counts: Record<SessionState, number> = {
    active: 0,
    paused: 0,
    dormant: 0,
    completed: 0,
  };
  for (const s of sessions) counts[s.state] = (counts[s.state] ?? 0) + 1;
  return counts;
}

/**
 * How far a plan has got, 0–100.
 *
 * Derived from the step DAG when the projection has it. `steps` is absent on
 * snapshot-only plans (the kernel does not put the graph in a snapshot), and
 * there the honest answer is `null` — not zero, which draws an empty rail and
 * reads as "nothing has happened yet".
 */
export function planProgress(plan: PlanInFlight): number | null {
  if (!plan.steps || plan.steps.length === 0) return null;
  const done = plan.steps.filter((s) => s.status === 'done').length;
  return Math.round((done / plan.steps.length) * 100);
}
