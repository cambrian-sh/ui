import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function makeState(plans: PlanInFlight[] = []): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
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

  it('disables pause/resume buttons when reason is empty and does not send fallback reason', () => {
    const plan = makePlan({ status: 'running' });
    projectionStore.getState().hydrate(makeState([plan]));
    searchState.focus = 'ses-456';

    render(<PlanWorkSurface />);

    const pauseBtn = screen.getByRole('button', { name: 'Pause' });
    const resumeBtn = screen.getByRole('button', { name: 'Resume' });

    // Initially disabled because reason is empty
    expect(pauseBtn).toBeDisabled();
    // Resume is disabled because status is running AND reason is empty
    expect(resumeBtn).toBeDisabled();

    const input = screen.getByPlaceholderText('Reason (mandatory for pause / resume)');
    
    // Type whitespace
    fireEvent.change(input, { target: { value: '   ' } });
    expect(pauseBtn).toBeDisabled();

    // Type valid reason
    fireEvent.change(input, { target: { value: 'need to pause' } });
    expect(pauseBtn).not.toBeDisabled();

    // Click pause
    fireEvent.click(pauseBtn);

    expect(ipc.pauseSession).toHaveBeenCalledWith({
      session_id: 'ses-456',
      reason: 'need to pause',
    });
  });

  it('calls resumeSession when resuming a paused plan with a reason', () => {
    const plan = makePlan({ status: 'paused' });
    projectionStore.getState().hydrate(makeState([plan]));
    searchState.focus = 'ses-456';

    render(<PlanWorkSurface />);

    const resumeBtn = screen.getByRole('button', { name: 'Resume' });
    const input = screen.getByPlaceholderText('Reason (mandatory for pause / resume)');

    fireEvent.change(input, { target: { value: 'continue' } });
    expect(resumeBtn).not.toBeDisabled();

    fireEvent.click(resumeBtn);

    expect(ipc.resumeSession).toHaveBeenCalledWith({
      session_id: 'ses-456',
      reason: 'continue',
    });
  });

  it('renders without crashing when the plan has sparse fields', () => {
    const plan = makePlan({ subject: '', cost: 0, step_count: 0, status: 'running' });
    projectionStore.getState().hydrate(makeState([plan]));
    searchState.focus = 'ses-456';

    render(<PlanWorkSurface />);

    expect(screen.getByPlaceholderText('Reason (mandatory for pause / resume)')).toBeInTheDocument();
  });
});
