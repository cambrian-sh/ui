import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { axe } from 'vitest-axe';
import { projectionStore } from '@/store/projection';
import type { HITLIntervention, SkillAccessRequest, SkillProposal, StateOfRecord } from '@/ipc/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const proposal: SkillProposal = {
  id: 'p1', name: 'report', skill_md: '# Report\nfour sections\n', rationale: 'Missing summaries', state: 'pending',
  proposer_agent_id: 'writer', principal_id: 'alice', source_run_id: 'run-1', evidence_cids: [], base_version: '',
  current_version: '', scan_verdict: 'clean', scan_findings: [], created_at_unix_ms: Date.now() - 60_000,
  decided_at_unix_ms: 0, decided_by: '', decision_note: '',
};
const request: SkillAccessRequest = {
  id: 'r1', agent_id: 'analyst', skill_name: 'web', run_id: 'run-2', rationale: 'needs prices', state: 'pending',
  requested_at_unix_ms: Date.now() - 120_000, decided_at_unix_ms: 0, decided_by: '',
};

vi.mock('@/ipc', () => ({
  ipc: {
    resolveHITL: vi.fn().mockResolvedValue({ deduped: false }),
    listSkillProposals: vi.fn(),
    listSkillGrants: vi.fn(),
    listSkillsFull: vi.fn().mockResolvedValue([]),
    decideSkillProposal: vi.fn().mockResolvedValue({ deduped: false, skill_version: '1.0', ledger_entry_id: 'l1' }),
    grantSkill: vi.fn().mockResolvedValue({ deduped: false }),
  },
}));

import { ipc } from '@/ipc';
import { InboxConsole } from './InboxConsole';

const hitl: HITLIntervention = {
  intervention_id: 'appr-1', plan_id: '', step_id: '', agent_id: 'coder', nature: 'destructive_command',
  proposed_action: { tool_name: 'shell_exec', args_preview: 'rm -rf build/' }, intended_action: null,
  reason: 'shell_exec', raised_at: new Date(Date.now() - 30_000).toISOString(),
};

function seed(capabilities: string[], pending: HITLIntervention[] = [hitl]) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role: 'operator',
    capabilities,
    pending_hitl: pending,
    audit_tail: [],
    plans: [],
    sessions: [],
  } as unknown as StateOfRecord);
}

const REASON = 'reviewed the change in detail';

describe('InboxConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    vi.mocked(ipc.listSkillProposals).mockResolvedValue([proposal]);
    vi.mocked(ipc.listSkillGrants).mockResolvedValue({ grants: [], requests: [request] });
  });

  it('lists every pending decision from all three sources', async () => {
    seed(['skills-lifecycle', 'skill-grants']);
    render(<InboxConsole />);
    expect(await screen.findByText('New skill report')).toBeInTheDocument();
    expect(await screen.findByText('analyst asks to use the skill web')).toBeInTheDocument();
    expect(screen.getByText(/coder wants to run shell_exec with rm -rf build\//)).toBeInTheDocument();
    expect(screen.getByText('3 decisions waiting · longest waiting first')).toBeInTheDocument();
  });

  it('does not read sources whose capability is absent', async () => {
    seed([]);
    render(<InboxConsole />);
    expect(screen.getByText('1 decision waiting · longest waiting first')).toBeInTheDocument();
    expect(ipc.listSkillProposals).not.toHaveBeenCalled();
    expect(ipc.listSkillGrants).not.toHaveBeenCalled();
  });

  it('approves a proposal with the mandatory reason', async () => {
    seed(['skills-lifecycle'], []);
    render(<InboxConsole />);
    await screen.findByText('New skill report');
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(approve);
    await waitFor(() =>
      expect(ipc.decideSkillProposal).toHaveBeenCalledWith({
        proposal_id: 'p1', approve: true, reason: REASON, lock_after_approve: false,
      }),
    );
  });

  it('offers only Grant for a timed-out access request, and says why', async () => {
    seed(['skill-grants'], []);
    render(<InboxConsole />);
    await screen.findByText('analyst asks to use the skill web');
    expect(screen.getByRole('button', { name: 'Grant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.getByText(/no RPC to deny/)).toBeInTheDocument();
  });

  it('disables decisions for a Viewer', async () => {
    seed(['skills-lifecycle'], []);
    projectionStore.getState().fold({ ...projectionStore.getState().state!, role: 'viewer' });
    render(<InboxConsole />);
    await screen.findByText('New skill report');
    expect(screen.getByText('Operator role required to decide.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    seed(['skills-lifecycle', 'skill-grants']);
    const { container } = render(<InboxConsole />);
    await screen.findByText('New skill report');
    expect(await axe(container)).toHaveNoViolations();
  });
});
