import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { SessionsConsole } from '@/screens/sessions/SessionsConsole';
import { projectionStore } from '@/store/projection';
import type { SessionSummary, StateOfRecord } from '@/ipc/types';

const searchState: { focus: string | undefined } = { focus: undefined };
const navigateMock = vi.fn((opts: { to?: string; search?: { focus?: string }; replace?: boolean }) => {
  if (opts.search?.focus !== undefined) {
    searchState.focus = opts.search.focus;
  }
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: `mock-${Math.random().toString(36).slice(2, 10)}`,
    title: 'Sample session',
    state: 'active',
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    plan_count: 0,
    agent_mix: [],
    cost: 0,
    ...overrides,
  };
}

function makeState(sessions: SessionSummary[] = []): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
    contract_skew: 0,
    cursor: 0,
    plans: [],
    sessions,
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

describe('SessionsConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
  });

  it('renders the empty state when there are no sessions', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<SessionsConsole />);
    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  });

  it('renders all sessions and supports state filtering', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeSession({ title: 'Active task', state: 'active' }),
        makeSession({ title: 'Paused work', state: 'paused' }),
        makeSession({ title: 'Dormant item', state: 'dormant' }),
      ]),
    );

    render(<SessionsConsole />);

    const list = screen.getByRole('list', { name: 'Sessions' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Paused' }));

    expect(within(list).queryByText('Active task')).not.toBeInTheDocument();
    expect(within(list).getByText('Paused work')).toBeInTheDocument();
    expect(within(list).queryByText('Dormant item')).not.toBeInTheDocument();
  });

  it('shows the session detail when a row is selected', () => {
    const session = makeSession({ title: 'Selected task', state: 'active' });
    projectionStore.getState().hydrate(makeState([session]));

    render(<SessionsConsole />);

    fireEvent.click(screen.getByText('Selected task'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/sessions',
      search: { focus: session.session_id },
      replace: true,
    });
    expect(searchState.focus).toBe(session.session_id);
  });

  it('renders without crashing when agent_mix is empty and cost is NaN', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeSession({ title: 'Nullish session', agent_mix: [], cost: NaN }),
      ]),
    );

    render(<SessionsConsole />);

    expect(screen.getByText('Nullish session')).toBeInTheDocument();
  });

  it('scrubs stale focus param when the session is no longer in the list', async () => {
    searchState.focus = 'ghost-session';
    projectionStore.getState().hydrate(makeState([]));

    render(<SessionsConsole />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/sessions',
          replace: true,
          search: { focus: undefined },
        }),
      ),
    );
  });
});
