import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { WatchConsole } from '@/screens/watch/WatchConsole';
import { projectionStore } from '@/store/projection';
import type { WatchConfigSummary, StateOfRecord } from '@/ipc/types';

const searchState: { focus: string | undefined } = { focus: undefined };
const navigateMock = vi.fn((opts: { search?: { focus?: string } }) => {
  if (opts.search?.focus !== undefined) {
    searchState.focus = opts.search.focus;
  }
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

function makeWatchConfig(overrides: Partial<WatchConfigSummary> = {}): WatchConfigSummary {
  return {
    id: `watch-${Math.random().toString(36).slice(2, 8)}`,
    target_streams: ['stream1'],
    last_fire_at: new Date().toISOString(),
    last_fire_status: 'ok',
    error_count: 0,
    ...overrides,
  };
}

function makeState(watch_configs: WatchConfigSummary[] = []): StateOfRecord {
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
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs,
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('WatchConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
  });

  it('renders the empty state when there are no watch configs', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<WatchConsole />);
    expect(screen.getByText('No watch configs')).toBeInTheDocument();
  });

  it('renders all watch configs and supports status filtering', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeWatchConfig({ id: 'alpha', last_fire_status: 'ok' }),
        makeWatchConfig({ id: 'beta', last_fire_status: 'error' }),
        makeWatchConfig({ id: 'gamma', last_fire_status: 'pending' }),
      ]),
    );

    render(<WatchConsole />);

    const list = screen.getByRole('list', { name: 'Watch configs' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Error' }));

    expect(within(list).queryByText('alpha')).not.toBeInTheDocument();
    expect(within(list).getByText('beta')).toBeInTheDocument();
    expect(within(list).queryByText('gamma')).not.toBeInTheDocument();
  });

  it('shows the detail panel when a watch config is selected', () => {
    const config = makeWatchConfig({ id: 'selected-watch' });
    projectionStore.getState().hydrate(makeState([config]));

    render(<WatchConsole />);

    fireEvent.click(screen.getByText('selected-watch'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/watch',
      search: { focus: config.id },
    });
    expect(searchState.focus).toBe(config.id);
  });

  it('renders without crashing when last_fire_at is null and target_streams is empty', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeWatchConfig({ id: 'nullish-watch', last_fire_at: null, target_streams: [] }),
      ]),
    );

    render(<WatchConsole />);

    expect(screen.getByText('nullish-watch')).toBeInTheDocument();
    expect(screen.getByText('No streams')).toBeInTheDocument();
  });
});
