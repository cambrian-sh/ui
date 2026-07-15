import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PlanWorkSurface } from './PlanWorkSurface';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, PlanInFlight } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
  },
}));

const searchState: { focus: string | undefined } = { focus: undefined };
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
}));

function makePlan(overrides: Partial<PlanInFlight> = {}): PlanInFlight {
  return {
    plan_id: 'plan-123',
    session_id: 'ses-456',
    subject: 'Test plan',
    status: 'running',
    step_count: 3,
    active_agent: 'agent-1',
    cost: 0.5,
    elapsed_ms: 1000,
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(plans: PlanInFlight[] = [], role: 'operator' | 'viewer' = 'operator'): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
    contract_skew: 0,
    cursor: 0,
    plans,
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
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

describe('PlanWorkSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('disables pause/resume buttons and shows role notice for Viewer role', () => {
    const plan = makePlan({ status: 'running' });
    projectionStore.getState().hydrate(makeState([plan], 'viewer'));
    searchState.focus = 'ses-456';

    render(<PlanWorkSurface />);

    const pauseBtn = screen.getByRole('button', { name: 'Pause' });
    const resumeBtn = screen.getByRole('button', { name: 'Resume' });

    expect(pauseBtn).toBeDisabled();
    expect(resumeBtn).toBeDisabled();
    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();

    fireEvent.click(pauseBtn);
    fireEvent.click(resumeBtn);

    expect(ipc.pauseSession).not.toHaveBeenCalled();
    expect(ipc.resumeSession).not.toHaveBeenCalled();
  });

  it('shows ErrorState on kernel error', async () => {
    const plan = makePlan({ status: 'running' });
    projectionStore.getState().hydrate(makeState([plan]));
    searchState.focus = 'ses-456';

    vi.mocked(ipc.pauseSession).mockRejectedValueOnce(new Error('Kernel error'));

    render(<PlanWorkSurface />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const reasonInput = screen.getByLabelText('Reason (required)');
    fireEvent.change(reasonInput, { target: { value: 'testing pause' } });

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Pause' });
    fireEvent.click(confirmBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kernel error');
  });

  it('renders without crashing when no plan is focused', () => {
    projectionStore.getState().hydrate(makeState([]));
    searchState.focus = undefined;

    render(<PlanWorkSurface />);

    expect(screen.getByText(/No plan in flight/i)).toBeInTheDocument();
  });
});
