import { describe, expect, it } from 'vitest';
import type { HITLIntervention } from '@/ipc/types';
import { buildInbox, inboxCount } from './inbox';

const base: HITLIntervention = {
  intervention_id: 'apr-1',
  plan_id: '',
  step_id: '',
  agent_id: 'assistant',
  nature: 'approval_request',
  proposed_action: { tool_name: 'local:laptop/write_file' },
  intended_action: null,
  reason: 'local:laptop/write_file',
  raised_at: '2026-11-06T09:00:00Z',
};

// ADR-0142 D11: the addressed hub's rule is shown, and an item the logged-in
// person may not answer is listed (audit) but neither counted nor approvable.
describe('addressed approvals in the inbox', () => {
  it('shows the rule and maps the hub kind', () => {
    const [item] = buildInbox({ hitl: [{ ...base, kind: 'machine_consent', rule: 'self', answerable: true }] });
    expect(item.kind).toBe('machine_consent');
    expect(item.rule).toBe('self');
    expect(item.approve_blocked).toBeUndefined();
  });

  it('lists but does not count an item addressed to someone else', () => {
    const hitl = [
      { ...base, kind: 'machine_consent', rule: 'self', answerable: false },
      { ...base, intervention_id: 'apr-2', rule: 'operator', answerable: true },
    ];
    const items = buildInbox({ hitl });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.key === 'hitl:apr-1')?.approve_blocked).toMatch(/Addressed to self/);
    expect(inboxCount({ hitl })).toBe(1);
  });

  it('treats a pre-hub kernel (no rule) as answerable', () => {
    expect(inboxCount({ hitl: [{ ...base }] })).toBe(1);
  });
});
