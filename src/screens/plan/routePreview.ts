// Route preview (`12b` §D.1) — "who would take this step", answered while the
// operator types.
//
// Dispatch's L1 gate is **set containment over declared capabilities**: an agent
// is eligible when its manifest declares every capability the step requires.
// That is a pure function over data the projection already carries, so the
// eligible set is computable here EXACTLY — no RPC, no agent boot, and no
// disagreement with what the kernel would decide.
//
// Merit RANKING is deliberately not attempted. The scorer reads success rates,
// both latency terms, context growth and per-capability stats, none of which the
// projection publishes. Ordering the list by something else and presenting it as
// "who goes first" would be a fabricated answer wearing the kernel's authority —
// worse than the client-side reachability evaluator, because there the console
// shows its working and a disagreement reads as a defect.

import type { AgentSummary } from '@/ipc/types';

export interface RouteEligibility {
  /** Agents whose declared capabilities cover every requirement. */
  eligible: AgentSummary[];
  /** How many agents were considered at all. */
  registered: number;
  /**
   * The first requirement that no registered agent declares. This is what turns
   * a card red **as it is typed**, rather than failing the plan at step four.
   */
  unmatched: string | null;
  /**
   * Every capability any agent declares — the vocabulary a typo is measured
   * against. Naming it is what makes "matches nobody" actionable.
   */
  vocabulary: string[];
}

/** Agents that can be routed to. A model or daemon entry is not a candidate. */
function routable(agents: AgentSummary[]): AgentSummary[] {
  return agents.filter((a) => (a.capabilities?.length ?? 0) > 0);
}

export function previewRoute(
  agents: AgentSummary[],
  required: string[],
): RouteEligibility {
  const pool = routable(agents);
  const vocabulary = Array.from(
    new Set(pool.flatMap((a) => a.capabilities ?? [])),
  ).sort();

  const wanted = required.map((c) => c.trim()).filter(Boolean);

  // A step with no stated requirement is routable by anyone — that is the
  // kernel's behaviour too (an empty contract does not gate).
  if (wanted.length === 0) {
    return { eligible: pool, registered: pool.length, unmatched: null, vocabulary };
  }

  const unmatched =
    wanted.find((c) => !pool.some((a) => (a.capabilities ?? []).includes(c))) ?? null;

  const eligible = pool.filter((a) =>
    wanted.every((c) => (a.capabilities ?? []).includes(c)),
  );

  return { eligible, registered: pool.length, unmatched, vocabulary };
}

/**
 * The advice line — "the difference between a form and a tool" (§D.1).
 *
 * A count alone tells an operator a number. This tells them what the number
 * means for the run: one eligible agent means the cascade has nowhere to go if
 * it fails, and that is worth knowing before it does.
 */
export function routeAdvice(r: RouteEligibility, required: string[]): string {
  if (r.registered === 0) {
    return 'No agent has reported its capabilities yet, so eligibility cannot be checked on this kernel.';
  }
  if (r.unmatched) {
    return `Nothing declares "${r.unmatched}". This step cannot be routed as written${
      r.vocabulary.length > 0
        ? ` — the fleet declares ${r.vocabulary.slice(0, 8).join(', ')}${
            r.vocabulary.length > 8 ? '…' : ''
          }.`
        : '.'
    }`;
  }
  if (r.eligible.length === 0) {
    return `Each capability is declared by somebody, but no single agent declares all ${required.length} together. Splitting this into two steps would route.`;
  }
  if (r.eligible.length === 1) {
    return 'Only one — so there is nothing to escalate to if it fails. Adding an alternative capability would widen it and give the cascade somewhere to go.';
  }
  return `${r.eligible.length} can take it, so a failure has somewhere to cascade to. Which one goes first is decided by merit at dispatch.`;
}

/** "3 agents eligible" / "1 eligible · pinned to calculator". */
export function routeSummary(
  r: RouteEligibility,
  step: { preferred_agent?: string; agent_pin?: string },
): string {
  if (r.unmatched) return `nothing declares "${r.unmatched}"`;
  const n = r.eligible.length;
  const head = n === 1 ? '1 eligible' : `${n} agents eligible`;
  if (step.agent_pin && step.preferred_agent) return `${head} · pinned to ${step.preferred_agent}`;
  if (step.preferred_agent) return `${head} · ${step.preferred_agent} goes first`;
  // No name is asserted: merit decides the order and this cannot reproduce it.
  return `${head} · merit decides the order`;
}
