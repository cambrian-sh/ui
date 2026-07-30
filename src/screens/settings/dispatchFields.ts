/**
 * The dispatch & retrieval tunables, as a typed catalogue.
 *
 * This is a form over the kernel's configuration, per UI-015 — **not a JSON
 * editor**. Every field is typed, and every field carries a *consequence*
 * rather than a description, because a wrong value here does not error. It
 * degrades quality quietly: plans get slower, retrieval returns less, routing
 * stops discriminating — and nothing in the console would otherwise look
 * different. The copy is the only thing that makes the cost visible before it
 * is paid.
 *
 * Keys and defaults are the kernel's own (`internal/config/config.go`,
 * `configs/tuning.json`), so what is written back is what the kernel reads.
 */

export type SectionId = 'dispatch' | 'timeouts' | 'retrieval';

export type FieldKind = 'toggle' | 'number';

export interface DispatchField {
  /** The `execution.*` key, and the name `SetRuntimeConfig` writes. */
  key: string;
  label: string;
  kind: FieldKind;
  section: SectionId;
  /** Kernel default. Booleans are 0/1 — SetRuntimeConfig carries doubles. */
  fallback: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** What it does. */
  description: string;
  /** What it costs when it is wrong. This is the field that earns its place. */
  consequence: string;
  /**
   * True when the field is the *mechanism* rather than a preference — turning
   * it off changes which algorithm runs, not how well it runs.
   */
  mechanism?: boolean;
}

export const DISPATCH_FIELDS: DispatchField[] = [
  {
    key: 'capability_contract',
    label: 'Capability contract',
    kind: 'toggle',
    section: 'dispatch',
    fallback: 1,
    mechanism: true,
    description:
      'The planner emits a required capability for every step, and the eligibility gate filters on it.',
    consequence:
      'Off, the eligibility gate becomes a free pass, the resolution ladder never fires, and dispatch degrades to merit-ranking alone — the most-trusted agent takes every step whether or not it can do the work. Nothing in the UI would otherwise look different, which is what makes this the most dangerous switch on the page.',
  },
  {
    key: 'per_capability_merit',
    label: 'Per-capability merit',
    kind: 'toggle',
    section: 'dispatch',
    fallback: 0,
    description:
      'Merit is read for the step’s required capability rather than as one global score, falling back to the global profile where a tag has no history.',
    consequence:
      'Off, an agent that is excellent at one capability and poor at another carries a single averaged score into both. On, a tag with little labelled volume leans on the global fallback anyway — so this is only as good as the verifier’s coverage.',
  },
  {
    key: 'gatekeeper_w1',
    label: 'Per-capability success rate',
    kind: 'number',
    section: 'dispatch',
    fallback: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Weight on how often this agent has succeeded at this capability, from verifier labels.',
    consequence:
      'High with little labelled volume ranks on noise: a tag with three outcomes is not evidence.',
  },
  {
    key: 'gatekeeper_w2',
    label: 'Overall trust',
    kind: 'number',
    section: 'dispatch',
    fallback: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Weight on the agent’s global TrustScore, across all work.',
    consequence:
      'High makes a generally-good agent win specialist work it has never done.',
  },
  {
    key: 'gatekeeper_w3',
    label: 'Cost & latency',
    kind: 'number',
    section: 'dispatch',
    fallback: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Weight on what the agent costs and how long it takes.',
    consequence:
      'High buys cheap answers you then pay a verifier to reject.',
  },
  {
    key: 'dispatch_cheap_energy_max',
    label: 'Cheapest-competent trigger',
    kind: 'number',
    section: 'dispatch',
    fallback: 0,
    min: 0,
    step: 0.01,
    unit: 'MaxEnergy',
    description:
      'On a VERIFIED step whose budget is at or below this, dispatch sends the cheapest eligible agent above the merit floor instead of the merit argmax, and escalates if the verifier rejects it.',
    consequence:
      'Zero disables the branch and every step takes the argmax. Non-zero is where discrimination comes from now, and it is how a cold agent earns its first labels — but only on steps that are actually verified, so a step with no declared budget is never treated as cheap.',
  },
  {
    key: 'dispatch_merit_floor',
    label: 'Cheapest-competent floor',
    kind: 'number',
    section: 'dispatch',
    fallback: 0,
    min: 0,
    max: 1,
    step: 0.05,
    description:
      'The minimum merit a candidate needs before the cheapest-competent branch will consider it.',
    consequence:
      'This is what keeps "cheapest" from meaning "worst". Too low and the cheap branch hands verified work to whoever charges least; too high and no cold agent ever qualifies, so none of them ever earn a record. Ignored entirely on the argmax path.',
  },
  {
    key: 'provisional_exploration_budget',
    label: 'Exploration budget, per capability',
    kind: 'number',
    section: 'dispatch',
    fallback: 3,
    min: 0,
    step: 1,
    unit: 'wins per window',
    description:
      'How many provisional wins a capability may spend before the free bypass is withdrawn for it.',
    consequence:
      'Bounded per capability, not globally, so a busy tag cannot spend a quiet tag’s exploration. Zero freezes the ranking on whatever early noise it already has — no new agent can ever displace an incumbent.',
  },
  {
    key: 'cold_start_penalty_multiplier',
    label: 'New-agent penalty',
    kind: 'number',
    section: 'dispatch',
    fallback: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
    description:
      'What a provisional agent’s merit is multiplied by until it has a record of its own.',
    consequence:
      'At 1.0 an unproven agent competes as an equal on its first ever step. Near 0 it never wins one, so it never builds the record that would let it compete — the penalty has to be survivable or it is permanent.',
  },

  {
    key: 'plan_timeout_ms',
    label: 'Plan timeout',
    kind: 'number',
    section: 'timeouts',
    fallback: 120000,
    min: 1000,
    step: 1000,
    unit: 'ms',
    description: 'How long a whole plan may run before it is abandoned.',
    consequence:
      'Below your real distribution this kills work that was about to succeed, and the operator sees a failure rather than a slow plan.',
  },
  {
    key: 'step_timeout_multiplier',
    label: 'Step timeout multiplier',
    kind: 'number',
    section: 'timeouts',
    fallback: 2,
    min: 1,
    step: 0.5,
    unit: '×',
    description: 'A step’s timeout, as a multiple of its expected duration.',
    consequence:
      'Exceeding a step timeout counts as a breaker failure against its generator, so a tight multiplier does not just cancel the step — it can trip the model out of rotation for everything else.',
  },

  {
    key: 'memory_relevance_threshold',
    label: 'Memory relevance threshold',
    kind: 'number',
    section: 'retrieval',
    fallback: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'The minimum score a chunk needs to be returned at all.',
    consequence:
      'Raise it and answers get cleaner right up until they get empty — a query that clears no chunk returns nothing, which reads as "the corpus does not know" rather than "the threshold was too high". Lower it and grounded answers start citing chunks that merely share vocabulary.',
  },
  {
    key: 'kg2rag_enabled',
    label: 'KG²RAG expansion',
    kind: 'toggle',
    section: 'retrieval',
    fallback: 1,
    description: 'Expand retrieval along the knowledge graph and re-rank.',
    consequence:
      'On with the extractor off, this walks a graph that stopped being fed — see the coherence check below.',
  },
  {
    key: 'kg_extractor_enabled',
    label: 'KG extractor',
    kind: 'toggle',
    section: 'retrieval',
    fallback: 1,
    description: 'Build graph edges from ingested documents.',
    consequence:
      'Off, the graph stops growing. Anything already extracted stays, so retrieval keeps working over an increasingly stale graph rather than failing.',
  },
  {
    key: 'structure_graph_enabled',
    label: 'Structure graph',
    kind: 'toggle',
    section: 'retrieval',
    fallback: 1,
    description: 'Use document structure (sections, headings) as retrieval signal.',
    consequence:
      'Off, section breadcrumbs disappear from citations and structurally-anchored recall drops on long documents.',
  },
];

export const SECTIONS: { id: SectionId; title: string; blurb: string }[] = [
  {
    id: 'dispatch',
    title: 'How a step finds an agent',
    blurb:
      'Selection is capability-typed dispatch: the step declares what it needs, an eligibility gate filters, and the survivors are ranked on merit. Nobody bids.',
  },
  {
    id: 'timeouts',
    title: 'Timeouts',
    blurb: 'Shown against what your plans actually take, not against a round number.',
  },
  {
    id: 'retrieval',
    title: 'Memory & retrieval',
    blurb: 'What a grounded answer is allowed to be built from.',
  },
];

/** The three merit weights, which are one control and must sum to 1. */
export const MERIT_WEIGHT_KEYS = ['gatekeeper_w1', 'gatekeeper_w2', 'gatekeeper_w3'] as const;

/**
 * Axes ADR-0100 retired, and why they must not get inputs.
 *
 * A stale schema may still publish these. UI-015 says skip and warn rather than
 * render them: an input for a flag the kernel no longer reads is worse than no
 * input, because changing it looks like it worked.
 */
export const RETIRED_AXES: { key: string; why: string }[] = [
  {
    key: 'bid_round',
    why: 'selects the legacy auction; deleted with the auction in ADR-0100 P3',
  },
  {
    key: 'min_auction_confidence',
    why: 'a floor on a bid nobody submits any more',
  },
  {
    key: 'calibrated_bids',
    why: 'calibrates a bid confidence that no longer exists',
  },
  {
    key: 'bid_calibration_min_samples',
    why: 'shrinkage for that same retired calibration',
  },
  {
    key: 'exploration_rate',
    why: 'superseded by the per-capability exploration budget',
  },
  {
    key: 'resource_selector',
    why: 'replaced by capability-typed dispatch',
  },
];

/**
 * Combinations where each value is legal on its own but the pair is not
 * sensible.
 *
 * None of these is a validation error, which is exactly why they need saying:
 * the kernel accepts them and then quietly does less useful work. Detecting
 * them is the difference between a form and a form that knows what it is for.
 *
 * `values` is keyed by `execution.*` name; booleans are >= 0.5.
 */
export function coherenceProblems(values: Record<string, number>): string[] {
  const on = (key: string) => (values[key] ?? 0) >= 0.5;
  const num = (key: string) => values[key] ?? 0;
  const problems: string[] = [];

  if (on('kg2rag_enabled') && !on('kg_extractor_enabled')) {
    problems.push(
      'KG²RAG expansion is on but the extractor is off. Retrieval is walking a graph that stopped being fed: it will keep working over whatever was extracted before, getting quietly staler as documents arrive, and nothing will report an error.',
    );
  }

  if (!on('capability_contract') && on('per_capability_merit')) {
    problems.push(
      'Per-capability merit is on but the capability contract is off, so steps carry no capability to scope merit by. Merit falls back to the global profile for every step and the setting does nothing.',
    );
  }

  if (num('dispatch_cheap_energy_max') > 0 && num('dispatch_merit_floor') === 0) {
    problems.push(
      'The cheapest-competent branch is enabled with a merit floor of 0, so "cheapest" can mean "worst" — verified low-budget steps will go to whichever eligible agent costs least, regardless of whether it has ever succeeded.',
    );
  }

  return problems;
}

/** The D5 resolution ladder, in the order it is tried. */
export const RESOLUTION_LADDER: { label: string; detail: string }[] = [
  { label: 'normalise', detail: 'case, separators and plurals are flattened' },
  { label: 'alias map', detail: 'a reviewed synonym file, edited by a human' },
  { label: 'generalist tier', detail: 'no specialist matched; a generalist takes it' },
  { label: 'fail', detail: 'naming the gap — the unmatched tag, verbatim' },
];
