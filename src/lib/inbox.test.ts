import { describe, expect, it } from 'vitest';
import type { HITLIntervention, SkillAccessRequest, SkillProposal } from '@/ipc/types';
import { buildInbox, inboxCount } from './inbox';

function hitl(o: Partial<HITLIntervention>): HITLIntervention {
  return {
    intervention_id: 'appr-1',
    plan_id: '',
    step_id: '',
    agent_id: 'a1',
    nature: 'destructive_command',
    proposed_action: {},
    intended_action: null,
    reason: 'shell_exec',
    raised_at: '2026-11-06T10:00:00Z',
    ...o,
  };
}

function request(o: Partial<SkillAccessRequest>): SkillAccessRequest {
  return {
    id: 'r1', agent_id: 'a2', skill_name: 'web', run_id: '', rationale: '', state: 'pending',
    requested_at_unix_ms: Date.parse('2026-11-06T09:00:00Z'), decided_at_unix_ms: 0, decided_by: '', ...o,
  };
}

function proposal(o: Partial<SkillProposal>): SkillProposal {
  return {
    id: 'p1', name: 'report', skill_md: '', rationale: '', state: 'pending', proposer_agent_id: 'a3',
    principal_id: '', source_run_id: '', evidence_cids: [], base_version: '', current_version: '',
    scan_verdict: 'clean', scan_findings: [], created_at_unix_ms: Date.parse('2026-11-06T11:00:00Z'),
    decided_at_unix_ms: 0, decided_by: '', decision_note: '', ...o,
  };
}

describe('buildInbox', () => {
  it('aggregates all three sources, longest-waiting first', () => {
    const items = buildInbox({
      hitl: [hitl({})],
      requests: [request({})],
      proposals: [proposal({})],
    });
    expect(items.map((i) => i.kind)).toEqual(['skill_access_request', 'tool_approval', 'skill_proposal']);
    expect(items[1].destructive).toBe(true);
  });

  it('shows a live skill-access approval once, not again as its timed-out request', () => {
    const items = buildInbox({
      hitl: [hitl({ intervention_id: 'appr-2', kind: 'skill_access', reason: 'skill:web', agent_id: 'a2', nature: 'approval_request' })],
      requests: [request({})],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('skill_access');
    expect(items[0].title).toBe('Use skill web');
    expect(items[0].destructive).toBe(false);
  });

  it("shows an assistant's recurring-task proposal as a schedule approval", () => {
    const items = buildInbox({
      hitl: [hitl({ intervention_id: 'appr-3', kind: 'schedule', reason: 'schedule_task', agent_id: 'assistant',
        nature: 'destructive_command', proposed_action: { tool_name: 'schedule_task', args_preview: 'for lena: "weekly"' } })],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('schedule_approval');
    expect(items[0].title).toBe('Set up a recurring task');
    expect(items[0].destructive).toBe(false);
  });

  it('skips decided requests and proposals', () => {
    expect(
      inboxCount({ hitl: [], requests: [request({ state: 'granted' })], proposals: [proposal({ state: 'approved' })] }),
    ).toBe(0);
  });

  it('blocks approving a dangerous or stale proposal, warns on a suspicious one', () => {
    const [danger, stale, sus] = buildInbox({
      hitl: [],
      proposals: [
        proposal({ id: 'd', scan_verdict: 'dangerous', created_at_unix_ms: 1 }),
        proposal({ id: 's', base_version: '1.0', current_version: '1.1', created_at_unix_ms: 2 }),
        proposal({ id: 'u', scan_verdict: 'suspicious', created_at_unix_ms: 3 }),
      ],
    });
    expect(danger.approve_blocked).toMatch(/dangerous/);
    expect(stale.approve_blocked).toMatch(/now 1.1/);
    expect(sus.approve_blocked).toBeUndefined();
    expect(sus.warning).toMatch(/suspicious/);
  });

  it('says a timed-out request cannot be denied', () => {
    const [item] = buildInbox({ hitl: [], requests: [request({})] });
    expect(item.deny_unavailable).toBeTruthy();
  });

  it('sorts items with no raise time last', () => {
    const items = buildInbox({ hitl: [hitl({ intervention_id: 'x', raised_at: '' }), hitl({ intervention_id: 'y' })] });
    expect(items.map((i) => i.key)).toEqual(['hitl:y', 'hitl:x']);
  });
});

describe('paused ingresses (ADR-0141 D3)', () => {
  it('lists an ingress paused for its account, with nothing to approve', () => {
    const items = buildInbox({
      hitl: [],
      attention: [{
        id: 'ingress:mail', purpose: 'ingress', consumer_id: 'mail', consumer_name: "Alice's mail", slot: 'token',
        owner: 'alice', account: 'owner:google', provider: 'google', reason: 'account_reconnect_needed',
        title: "Reconnect your Google account to keep ingesting Alice's mail", detail: '', since_unix_ms: 5,
      }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('ingress_paused');
    expect(items[0].key).toBe('attention:ingress:mail');
    expect(items[0].title).toContain('Reconnect your Google account');
    expect(items[0].approve_blocked).toBeTruthy();
    expect(inboxCount({ hitl: [], attention: items.map((i) => i.attention!) })).toBe(1);
  });
});
