import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusedPlan } from '@/lib/useFocusedPlan';
import type { PlanInFlight } from '@/ipc/types';

const searchState: { focus: string | undefined } = { focus: undefined };

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
}));

function makePlan(id: string): PlanInFlight {
  return {
    plan_id: id,
    session_id: 's1',
    subject: `Plan ${id}`,
    step_count: 1,
    active_agent: null,
    status: 'running',
    elapsed_ms: 0,
    cost: 0,
    started_at: new Date().toISOString(),
  };
}

describe('useFocusedPlan', () => {
  beforeEach(() => {
    searchState.focus = undefined;
  });

  it('returns the focused plan when ?focus matches', () => {
    searchState.focus = 'plan-2';
    const plans = [makePlan('plan-1'), makePlan('plan-2'), makePlan('plan-3')];
    const { result } = renderHook(() => useFocusedPlan(plans));
    expect(result.current?.plan_id).toBe('plan-2');
  });

  it('falls back to plans[0] when ?focus does not match any plan', () => {
    searchState.focus = 'plan-nonexistent';
    const plans = [makePlan('plan-1'), makePlan('plan-2')];
    const { result } = renderHook(() => useFocusedPlan(plans));
    expect(result.current?.plan_id).toBe('plan-1');
  });

  it('falls back to plans[0] when ?focus is absent', () => {
    searchState.focus = undefined;
    const plans = [makePlan('plan-1'), makePlan('plan-2')];
    const { result } = renderHook(() => useFocusedPlan(plans));
    expect(result.current?.plan_id).toBe('plan-1');
  });

  it('returns null when plans is empty', () => {
    searchState.focus = 'plan-1';
    const { result } = renderHook(() => useFocusedPlan([]));
    expect(result.current).toBeNull();
  });
});
