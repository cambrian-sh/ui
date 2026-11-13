import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { axe } from 'vitest-axe';
import { projectionStore } from '@/store/projection';
import type { HITLIntervention, OntologyDraftView, Role, StateOfRecord } from '@/ipc/types';
import { ONTOLOGY_DRAFT } from '@/ipc/mock-fixtures';

// The approver's full view of an agent-drafted ontology change
// (T-20261113-approvers-of-an-ontology-change-see-only-a-200).

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/ipc', () => ({
  ipc: {
    resolveHITL: vi.fn().mockResolvedValue({ deduped: false }),
    answerApproval: vi
      .fn()
      .mockResolvedValue({ ok: true, deduped: false, state: 'approved', refusal: '', standing_id: '' }),
    listStandingApprovals: vi.fn().mockResolvedValue([]),
    listSkillProposals: vi.fn().mockResolvedValue([]),
    listSkillGrants: vi.fn().mockResolvedValue({ grants: [], requests: [] }),
    getOntologyDraft: vi.fn(),
  },
}));

import { ipc } from '@/ipc';
import { InboxConsole } from './InboxConsole';

const approval: HITLIntervention = {
  intervention_id: 'apr-o1',
  plan_id: '',
  step_id: '',
  agent_id: 'planner',
  nature: 'approval_request',
  kind: 'ontology_change',
  proposed_action: {
    tool_name: 'ontology_change',
    object: 'od_mock1',
    args_preview: 'tightening change to ontology "default" (v3)…',
  },
  intended_action: null,
  reason: 'ontology_change',
  raised_at: new Date(Date.now() - 30_000).toISOString(),
};

function seed(role: Role, capabilities: string[]) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role,
    capabilities,
    pending_hitl: [approval],
    audit_tail: [],
    plans: [],
    sessions: [],
  } as unknown as StateOfRecord);
}

const REASON = 'read every spec and the dry run';
const OPEN = { name: 'Read the full draft' };

async function openDraft() {
  fireEvent.click(await screen.findByRole('button', OPEN));
  const dialog = await screen.findByRole('dialog', { name: 'Ontology change draft' });
  const d = within(dialog);
  await d.findByText('agent:cognitive-analyst');
  return d;
}

describe('ontology_change approvals: the full draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    vi.mocked(ipc.getOntologyDraft).mockResolvedValue(structuredClone(ONTOLOGY_DRAFT));
  });

  it('shows every spec current vs drafted, classification, versions, proposer and the dry run', async () => {
    seed('operator', ['substrate-query']);
    render(<InboxConsole />);
    const d = await openDraft();
    expect(ipc.getOntologyDraft).toHaveBeenCalledWith('od_mock1');
    expect(d.getAllByText('v3')).toHaveLength(2); // base and current
    expect(d.getByText(/"lost" is not a status/)).toBeInTheDocument();
    // The modified kind shows both sides; the new relation says it is new.
    expect(d.getByLabelText('kind order: Declared now').textContent).toContain('"lost"');
    expect(d.getByLabelText('kind order: As drafted').textContent).not.toContain('"lost"');
    expect(d.getByLabelText('relation ships_to: As drafted')).toBeInTheDocument();
    expect(d.queryByLabelText('relation ships_to: Declared now')).not.toBeInTheDocument();
    expect(d.getByText(/new — nothing is declared under this name yet/)).toBeInTheDocument();
    expect(d.getByText(/Approving now would apply it as drafted/)).toBeInTheDocument();
    expect(d.getAllByText('kind order.status').length).toBeGreaterThan(0);
  });

  it('decides from the draft with the mandatory reason', async () => {
    seed('operator', ['substrate-query', 'addressed-approvals']);
    render(<InboxConsole />);
    const d = await openDraft();
    const approve = d.getByRole('button', { name: 'Approve and apply' });
    expect(approve).toBeDisabled();
    fireEvent.change(d.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(approve);
    await waitFor(() =>
      expect(ipc.answerApproval).toHaveBeenCalledWith({
        id: 'apr-o1',
        approve: true,
        standing: false,
        standing_ttl_seconds: 0,
        reason: REASON,
      }),
    );
  });

  it('says why approving now would apply nothing', async () => {
    const moved: OntologyDraftView = {
      ...structuredClone(ONTOLOGY_DRAFT),
      current_version: 4,
      dry_run_refusal: 'namespace "default" moved from version 3 to 4 since it was drafted',
    };
    vi.mocked(ipc.getOntologyDraft).mockResolvedValue(moved);
    seed('operator', ['substrate-query']);
    render(<InboxConsole />);
    const d = await openDraft();
    expect(d.getByRole('alert')).toHaveTextContent('moved from version 3 to 4');
    expect(d.getByText('The declarations moved since this was drafted.')).toBeInTheDocument();
  });

  it('blocks deciding a draft that is no longer pending', async () => {
    vi.mocked(ipc.getOntologyDraft).mockResolvedValue({
      ...structuredClone(ONTOLOGY_DRAFT),
      state: 'superseded',
      dry_run_ran: false,
    });
    seed('operator', ['substrate-query']);
    render(<InboxConsole />);
    const d = await openDraft();
    fireEvent.change(d.getByLabelText('Reason'), { target: { value: REASON } });
    expect(d.getByRole('button', { name: 'Approve and apply' })).toBeDisabled();
    expect(d.getByText(/No dry run/)).toBeInTheDocument();
  });

  it('is not offered to a Viewer or a member (the kernel read is Operator-only)', async () => {
    for (const role of ['viewer', 'member'] as Role[]) {
      projectionStore.getState().reset();
      seed(role, ['substrate-query']);
      const { unmount } = render(<InboxConsole />);
      await screen.findByText('1 decision waiting · longest waiting first');
      expect(screen.queryByRole('button', OPEN)).not.toBeInTheDocument();
      unmount();
    }
    expect(ipc.getOntologyDraft).not.toHaveBeenCalled();
  });

  it('is not offered when the kernel does not advertise the substrate plane', async () => {
    seed('operator', []);
    render(<InboxConsole />);
    await screen.findByText('1 decision waiting · longest waiting first');
    expect(screen.queryByRole('button', OPEN)).not.toBeInTheDocument();
    expect(ipc.getOntologyDraft).not.toHaveBeenCalled();
  });

  it('says so when the draft cannot be read', async () => {
    vi.mocked(ipc.getOntologyDraft).mockRejectedValue(
      new Error('PermissionDenied: reading an ontology draft needs the Operator role'),
    );
    seed('operator', ['substrate-query']);
    render(<InboxConsole />);
    fireEvent.click(await screen.findByRole('button', OPEN));
    expect(await screen.findByText(/The draft could not be read\. PermissionDenied/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and apply' })).not.toBeInTheDocument();
  });

  it('has no axe violations with the draft open', async () => {
    seed('operator', ['substrate-query']);
    const { container } = render(<InboxConsole />);
    await openDraft();
    expect(await axe(container)).toHaveNoViolations();
  });
});
