import { describe, it, expect } from 'vitest';
import { placeholderSteps, stepsOf } from './planSteps';
import type { PlanInFlight } from '@/ipc/types';

function snapshotOnlyPlan(over: Partial<PlanInFlight> = {}): PlanInFlight {
  return {
    plan_id: 'p1',
    session_id: 's1',
    subject: 'refund audit',
    step_count: 3,
    active_agent: 'analyst',
    steps: [],
    ...over,
  } as PlanInFlight;
}

describe('placeholderSteps (T-20261106-snapshot-only-plans-render-fabricated-step)', () => {
  it('renders the step count with every status not reported — never invented progress', () => {
    const steps = placeholderSteps(snapshotOnlyPlan());
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.status)).toEqual(['unreported', 'unreported', 'unreported']);
    expect(steps.some((s) => s.agent)).toBe(false);
    expect(steps[1].query).toBe('Step 2 of 3 — subject: refund audit');
  });

  it('stepsOf uses the placeholders only while the plan has no DAG', () => {
    expect(stepsOf(snapshotOnlyPlan())[0].status).toBe('unreported');
    const withDag = snapshotOnlyPlan({
      steps: [{ index: 0, label: 'read', status: 'done', depends_on: [], is_thought: false, agent: 'a' }],
    } as Partial<PlanInFlight>);
    expect(stepsOf(withDag).map((s) => s.status)).toEqual(['done']);
  });
});
