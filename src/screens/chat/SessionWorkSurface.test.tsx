import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { SessionWorkSurface } from '@/screens/chat/SessionWorkSurface';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, HITLIntervention, SessionSummary } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    sendMessage: vi.fn().mockResolvedValue({ deduped: false }),
    injectCorrection: vi.fn().mockResolvedValue({ deduped: false }),
    resolveHITL: vi.fn().mockResolvedValue({ deduped: false }),
    pauseSession: vi.fn().mockResolvedValue({ deduped: false }),
    resumeSession: vi.fn().mockResolvedValue({ deduped: false }),
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

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    title:
      'Find every airline route that goes beyond ARMATA coverage, and summarise what is missing',
    state: 'active',
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    plan_count: 1,
    agent_mix: ['researcher'],
    cost: 0.31,
    ...overrides,
  };
}

function makeState(
  role: 'operator' | 'viewer' = 'operator',
  hitl: HITLIntervention[] = [],
  sessions: SessionSummary[] = [makeSession()],
): StateOfRecord {
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
    plugins: [],
    cursor: 0,
    plans: [
      {
        plan_id: 'plan-1',
        session_id: 'session-1',
        subject: 'Test plan',
        step_count: 2,
        active_agent: 'researcher',
        status: 'running',
        elapsed_ms: 0,
        cost: 0.21,
        started_at: new Date().toISOString(),
        steps: [
          {
            index: 0,
            label: 'Collect the route table',
            depends_on: [],
            is_thought: false,
            status: 'done',
            agent: 'researcher',
          },
          {
            index: 1,
            label: 'Compare against ARMATA coverage',
            depends_on: [0],
            is_thought: false,
            status: 'running',
            agent: 'researcher',
          },
        ],
      },
    ],
    sessions,
    audit_tail: [],
    pending_hitl: hitl,
    agents: [],
    tools: [],
    skills: [],
    scope: {},
    watch_configs: [],
    lifecycle: {
      scheduler_state: 'idle',
      pending_jobs: 0,
      last_consolidation: null,
      dormancy_events: [],
    },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

describe('SessionWorkSurface — HITL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('renders the HITL card for a pending intervention on this session', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(
      screen.getByRole('region', { name: 'HITL intervention hitl-1' }),
    ).toBeInTheDocument();
  });

  it('does not render HITL for plans belonging to a different session', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-other" />);

    expect(
      screen.queryByRole('region', { name: 'HITL intervention hitl-1' }),
    ).not.toBeInTheDocument();
  });

  it('disables resolve controls for a Viewer and says why, visibly', () => {
    projectionStore.getState().hydrate(makeState('viewer', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(screen.getByRole('button', { name: 'Approve with reason' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(
      screen.getByText('Operator role required to resolve an intervention.'),
    ).toBeInTheDocument();
  });

  it('calls resolveHITL with approve=true on approve', async () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve with reason' }));
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: 'this action is safe to proceed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

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
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText(/Reason for rejection/i), {
      target: { value: 'this action is too dangerous' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() => {
      expect(ipc.resolveHITL).toHaveBeenCalledWith({
        intervention_id: 'hitl-1',
        approve: false,
        reason: 'this action is too dangerous',
      });
    });
  });

  it('keeps the confirm disabled below the 16-character reason gate, and says what is missing', () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve with reason' }));
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: 'short' },
    });

    expect(
      screen.getByRole('button', { name: 'Approve — needs a reason' }),
    ).toBeDisabled();
    // The bar is not the only feedback: the sentence counts down in words.
    expect(screen.getByText(/11 more characters/)).toBeInTheDocument();
  });

  it('surfaces a kernel rejection via ErrorState', async () => {
    vi.mocked(ipc.resolveHITL).mockRejectedValueOnce(new Error('PermissionDenied'));
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve with reason' }));
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: 'this action is safe to proceed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('resets the card to idle and renders no error on a successful resolve', async () => {
    projectionStore.getState().hydrate(makeState('operator', [makeHitl()]));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve with reason' }));
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: 'this action is safe to proceed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() => expect(ipc.resolveHITL).toHaveBeenCalled());

    expect(screen.queryByLabelText(/Reason for approval/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve with reason' }),
    ).toBeInTheDocument();
  });
});

describe('SessionWorkSurface — composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('enables the composer for an Operator', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(screen.getByLabelText('Chat message')).not.toBeDisabled();
  });

  it('disables the composer for a Viewer and renders the reason as visible text', () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(screen.getByLabelText('Chat message')).toBeDisabled();
    // Visible text, not a `title` attribute: a tooltip is not an explanation.
    expect(
      screen.getByText('Operator role required to send messages.'),
    ).toBeInTheDocument();
  });

  it('surfaces a rejected send instead of swallowing it', async () => {
    // Regression: both sends were `void ipc.…(…)`, so a rejected command vanished —
    // the draft cleared, the composer looked like it had worked, and nothing ever
    // said otherwise. An ASYNC failure (the provider refusing) arrives later on the
    // progress channel, but a send that never left the machine has no progress
    // channel to arrive on, so this was the one failure a user could never find out
    // about.
    vi.mocked(ipc.sendMessage).mockRejectedValueOnce(new Error('Unavailable'));
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'what is the status' },
    });
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unavailable');
  });

  it('surfaces a rejected mid-plan inject too', async () => {
    vi.mocked(ipc.injectCorrection).mockRejectedValueOnce(new Error('PermissionDenied'));
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    // Switch the composer to the running plan, then send.
    fireEvent.click(screen.getByRole('radio', { name: /Inject into plan/ }));
    const box = screen.getByLabelText('Inject into plan');
    fireEvent.change(box, { target: { value: 'stop and re-read the brief' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('switches the target between the session and the running plan', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    fireEvent.click(screen.getByRole('radio', { name: /Inject into plan/ }));
    expect(screen.getByLabelText('Inject into plan')).toBeInTheDocument();
  });
});

describe('SessionWorkSurface — plan and inspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('renders the plan inline in the conversation', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(screen.getByText('ExecutionPlan')).toBeInTheDocument();
    expect(screen.getByText('Compare against ARMATA coverage')).toBeInTheDocument();
  });

  it('renders a derived subject as the heading and keeps the goal verbatim beneath it', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(
      screen.getByRole('heading', { name: 'Find every airline route that goes beyond…' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/“Find every airline route .* what is missing”/)).toBeInTheDocument();
  });

  it('has no step inspector in the DOM until a step is selected', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<SessionWorkSurface sessionId="session-1" />);

    // Rendered outside a shell there is no slot to portal into, so the assertion
    // that matters is that nothing claims the region unprompted.
    expect(
      screen.queryByRole('complementary', { name: 'Step detail' }),
    ).not.toBeInTheDocument();
  });

  it('renders without throwing when the projection is empty', () => {
    projectionStore.getState().reset();
    render(<SessionWorkSurface sessionId="session-1" />);

    expect(
      screen.getByText('No blocks yet. The plan view appears here when a plan starts.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState('operator', []));
    const { container } = render(<SessionWorkSurface sessionId="session-1" />);
    await waitFor(() => {
      expect(screen.getByText('ExecutionPlan')).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
