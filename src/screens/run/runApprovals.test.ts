import { describe, expect, it } from 'vitest';
import type { HITLIntervention, PlanInFlight } from '@/ipc/types';
import { approvalsForRun } from './RunApprovals';

const h = (o: Partial<HITLIntervention>): HITLIntervention => ({
  intervention_id: 'x', plan_id: '', step_id: '', agent_id: '', nature: 'approval_request',
  proposed_action: {}, intended_action: null, reason: '', raised_at: '', ...o,
});

const plan = {
  plan_id: 'p1', session_id: 'T1', active_agent: 'coder',
  steps: [{ index: 0, label: 'a', depends_on: [], is_thought: false, status: 'running', agent: 'coder', required_capabilities: [] }],
} as unknown as PlanInFlight;

describe('approvalsForRun', () => {
  it('matches by session or plan, and infers hub approvals by running agent', () => {
    const got = approvalsForRun(
      [
        h({ intervention_id: 'bySession', session_id: 'T1' }),
        h({ intervention_id: 'byPlan', plan_id: 'p1' }),
        h({ intervention_id: 'byAgent', agent_id: 'coder' }),
        h({ intervention_id: 'otherAgent', agent_id: 'someone' }),
        h({ intervention_id: 'otherSession', session_id: 'T2', agent_id: 'coder' }),
      ],
      'T1',
      plan,
    );
    expect(got.map((g) => [g.hitl.intervention_id, g.inferred])).toEqual([
      ['bySession', false],
      ['byPlan', false],
      ['byAgent', true],
    ]);
  });
});
