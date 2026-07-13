import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatSurface } from '@/screens/chat/ChatSurface';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, HITLIntervention } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    sendMessage: vi.fn().mockResolvedValue({ deduped: false }),
    injectCorrection: vi.fn().mockResolvedValue({ deduped: false }),
    resolveHITL: vi.fn().mockResolvedValue({ deduped: false }),
  },
}));

import { ipc } from '@/ipc';

function makeHitl(overrides: Partial<HITLIntervention> = {}): HITLIntervention {
  return {
    intervention_id: 'hitl-1',
    plan_id: 'plan-1',
    step_id: 'step-1',
    agent_id: 'agent-1',
    nature: 'approval_request',
    proposed_action: { command: 'rm -rf /tmp/cache' },
    intended_action: null,
    reason: 'Needs operator approval before execution.',
    raised_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(role: 'operator' | 'viewer' = 'operator', hitl: HITLIntervention[] = []): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
    contract_skew: 0,
    cursor: 0,
    plans: [
      {
        plan_id: 'plan-1',
        session_id: 'session-1',
        subject: 'Test plan',
        step_count: 1,
        active_agent: null,
        status: 'running',
        elapsed_ms: 0,
        cost: 0,
        started_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    audit_tail: [],
    pending_hitl: hitl,
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('ChatSurface HITL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('renders HITLInline for pending HITL belonging to the active session plan', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    expect(screen.getByRole('region', { name: 'HITL intervention hitl-1' })).toBeInTheDocument();
    expect(screen.getByText('Needs operator approval before execution.')).toBeInTheDocument();
  });

  it('does not render HITL for plans belonging to a different session', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-other" />);

    expect(screen.queryByRole('region', { name: 'HITL intervention hitl-1' })).not.toBeInTheDocument();
  });

  it('disables resolve controls for Viewer role', () => {
    projectionStore.getState().hydrate(makeState('viewer', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('calls resolveHITL with approve=true on approve', async () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'this action is safe to proceed' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));

    await waitFor(() => {
      expect(ipc.resolveHITL).toHaveBeenCalledWith({
        intervention_id: 'hitl-1',
        approve: true,
        reason: 'this action is safe to proceed',
      });
    });
  });

  it('calls resolveHITL with approve=false on reject', async () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'this action is too dangerous' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));

    await waitFor(() => {
      expect(ipc.resolveHITL).toHaveBeenCalledWith({
        intervention_id: 'hitl-1',
        approve: false,
        reason: 'this action is too dangerous',
      });
    });
  });

  it('disables confirm when reason is below REASON_MIN', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'short' } });

    expect(screen.getByRole('button', { name: 'Confirm approve' })).toBeDisabled();
  });

  it('surfaces a kernel error via ErrorState', async () => {
    vi.mocked(ipc.resolveHITL).mockRejectedValueOnce(new Error('PermissionDenied'));
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'this action is safe to proceed' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('disables chat and inject inputs for Viewer role and shows the operator-required message', () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    render(<ChatSurface sessionId="session-1" />);

    const chatTextarea = screen.getByLabelText('Chat message');
    expect(chatTextarea).toBeDisabled();
    expect(chatTextarea).toHaveAttribute('title', 'Operator role required to send messages.');

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();

    const injectTextarea = screen.getByLabelText('Inject correction into running plan');
    expect(injectTextarea).toBeDisabled();
    expect(injectTextarea).toHaveAttribute('title', 'Operator role required to send messages.');
  });

  it('surfaces a reject error via ErrorState', async () => {
    vi.mocked(ipc.resolveHITL).mockRejectedValueOnce(new Error('PermissionDenied'));
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'this action is too dangerous' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('resets HITLInline to idle and renders no error on successful resolve', async () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<ChatSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: 'this action is safe to proceed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));

    await waitFor(() => {
      expect(ipc.resolveHITL).toHaveBeenCalledWith({
        intervention_id: 'hitl-1',
        approve: true,
        reason: 'this action is safe to proceed',
      });
    });

    expect(screen.queryByLabelText(/Reason/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('renders without throwing when state is null', () => {
    projectionStore.getState().reset();
    render(<ChatSurface sessionId="session-1" />);

    expect(
      screen.getByText('No blocks yet. The plan view appears here when a plan starts.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
  });
});