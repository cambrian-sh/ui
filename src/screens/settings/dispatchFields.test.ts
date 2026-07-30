import { describe, expect, it } from 'vitest';
import {
  coherenceProblems,
  DISPATCH_FIELDS,
  MERIT_WEIGHT_KEYS,
  RETIRED_AXES,
} from './dispatchFields';

/** Every field at its kernel default. */
function defaults(): Record<string, number> {
  const values: Record<string, number> = {};
  for (const f of DISPATCH_FIELDS) values[f.key] = f.fallback;
  return values;
}

describe('the dispatch field catalogue', () => {
  it('gives every field a consequence, not just a description', () => {
    // The consequence line is the product on this screen: a wrong value here
    // does not error, it degrades quality quietly. A field without one is a
    // field the operator cannot judge.
    for (const f of DISPATCH_FIELDS) {
      expect(f.consequence, `${f.key} has no consequence`).toBeTruthy();
      expect(f.description, `${f.key} has no description`).toBeTruthy();
    }
  });

  it('renders no input for any axis ADR-0100 retired', () => {
    // UI-015 skip-and-warn. An input for a flag the kernel no longer reads is
    // worse than no input, because changing it looks like it worked.
    const keys = new Set(DISPATCH_FIELDS.map((f) => f.key));
    for (const axis of RETIRED_AXES) {
      expect(keys.has(axis.key), `${axis.key} must not be editable`).toBe(false);
    }
  });

  it('names the auction axes specifically among the retired set', () => {
    const retired = RETIRED_AXES.map((a) => a.key);
    expect(retired).toContain('bid_round');
    expect(retired).toContain('min_auction_confidence');
    expect(retired).toContain('calibrated_bids');
  });

  it('has merit weights that sum to exactly 1 at their defaults', () => {
    // The kernel rejects a set that does not sum to 1, so the defaults the form
    // opens with must already be valid — otherwise the screen starts in a state
    // it will not let you save.
    const values = defaults();
    const sum = MERIT_WEIGHT_KEYS.reduce((acc, k) => acc + values[k], 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('keeps every weight within 0..1', () => {
    for (const key of MERIT_WEIGHT_KEYS) {
      const f = DISPATCH_FIELDS.find((x) => x.key === key)!;
      expect(f.min).toBe(0);
      expect(f.max).toBe(1);
    }
  });

  it('marks the capability contract as the mechanism, not a preference', () => {
    const f = DISPATCH_FIELDS.find((x) => x.key === 'capability_contract')!;
    expect(f.mechanism).toBe(true);
    // The reason it needs marking: turning it off changes nothing visible.
    expect(f.consequence).toMatch(/nothing in the UI would otherwise look different/i);
  });
});

describe('coherenceProblems', () => {
  it('finds nothing wrong with the kernel defaults', () => {
    expect(coherenceProblems(defaults())).toEqual([]);
  });

  it('catches KG retrieval walking a graph that stopped being fed', () => {
    const values = { ...defaults(), kg2rag_enabled: 1, kg_extractor_enabled: 0 };
    const problems = coherenceProblems(values);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/stopped being fed/);
  });

  it('catches per-capability merit with no capability to scope by', () => {
    const values = { ...defaults(), capability_contract: 0, per_capability_merit: 1 };
    expect(coherenceProblems(values).some((p) => /does nothing/.test(p))).toBe(true);
  });

  it('catches a cheapest-competent branch with no floor under it', () => {
    // Legal, and quietly awful: "cheapest" becomes "worst" on verified work.
    const values = {
      ...defaults(),
      dispatch_cheap_energy_max: 0.05,
      dispatch_merit_floor: 0,
    };
    expect(coherenceProblems(values).some((p) => /"cheapest" can mean "worst"/.test(p))).toBe(
      true,
    );
  });

  it('accepts the cheap branch once a floor is set', () => {
    const values = {
      ...defaults(),
      dispatch_cheap_energy_max: 0.05,
      dispatch_merit_floor: 0.4,
    };
    expect(coherenceProblems(values)).toEqual([]);
  });

  it('reports several problems at once rather than only the first', () => {
    const values = {
      ...defaults(),
      kg2rag_enabled: 1,
      kg_extractor_enabled: 0,
      capability_contract: 0,
      per_capability_merit: 1,
    };
    expect(coherenceProblems(values).length).toBe(2);
  });

  it('treats a boolean as on at or above 0.5, since the wire carries doubles', () => {
    // SetRuntimeConfig is map<string,double>, so booleans travel as 1/0.
    const values = { ...defaults(), kg2rag_enabled: 1, kg_extractor_enabled: 0.4 };
    expect(coherenceProblems(values).length).toBe(1);
  });
});
