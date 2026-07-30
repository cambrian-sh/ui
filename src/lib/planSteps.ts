import type { HITLIntervention, PlanInFlight } from '@/ipc/types';
import type { PlanStep } from '@/screens/plan/PlanStepList';

/**
 * The DAG nodes the PlanState feed projects, in the shape the step views read.
 *
 * The dependency edges are preserved so the graph draws the true DAG rather
 * than a linear chain, and so a pending step can say what it is waiting for.
 */
export function realSteps(plan: PlanInFlight): PlanStep[] {
  return (plan.steps ?? []).map((n) => ({
    step_id: `${plan.plan_id}-step-${n.index}`,
    index: n.index,
    query: n.label,
    status: n.status,
    depends_on: n.depends_on,
    is_thought: n.is_thought,
    agent: n.agent,
    // Both arrive with the ADR-0100 contract bump. Passed through rather than
    // defaulted, so a kernel that does not send them renders as "not reported"
    // instead of as an empty capability contract.
    required_capabilities: n.required_capabilities,
    dispatch: n.dispatch,
  }));
}

/**
 * A plan seen via Snapshot, before its first PlanState event.
 *
 * Snapshots do not carry the graph, so there is genuinely nothing to draw yet.
 * This renders the step *count* the snapshot does give, rather than an empty
 * surface that reads as "this plan has no steps".
 */
export function placeholderSteps(plan: PlanInFlight): PlanStep[] {
  const total = plan.step_count;
  return Array.from({ length: total }, (_, i) => {
    const isActive = plan.active_agent !== null && i === Math.max(0, total - 1);
    return {
      step_id: `${plan.plan_id}-step-${i}`,
      index: i,
      query: `Step ${i + 1} of ${total} — subject: ${plan.subject}`,
      status: isActive ? 'running' : i < total - 1 ? 'done' : 'pending',
      agent: isActive ? plan.active_agent : null,
    } satisfies PlanStep;
  });
}

/** The steps for a plan, from the DAG when there is one. */
export function stepsOf(plan: PlanInFlight): PlanStep[] {
  return (plan.steps?.length ?? 0) > 0 ? realSteps(plan) : placeholderSteps(plan);
}

/**
 * Mark the steps an intervention is blocking.
 *
 * A HITL names a `step_id`. Anything downstream of that step is blocked too,
 * but only transitively — so the row that says "needs approval" is the one the
 * operator can actually act on, and its dependents keep saying what they wait
 * on. Naming every downstream step would turn one decision into a wall of warn.
 */
export function withApprovals(
  steps: PlanStep[],
  interventions: readonly HITLIntervention[],
): PlanStep[] {
  if (interventions.length === 0) return steps;
  const blocked = new Set(interventions.map((h) => h.step_id));
  if (blocked.size === 0) return steps;

  return steps.map((s) =>
    blocked.has(s.step_id) || blocked.has(String(s.index))
      ? { ...s, needs_approval: true }
      : s,
  );
}
