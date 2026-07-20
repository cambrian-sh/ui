import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { WatchDetail } from '@/screens/watch/WatchDetail';
import { projectionStore } from '@/store/projection';
import type { WatchConfigSummary, StateOfRecord } from '@/ipc/types';

function makeWatchConfig(overrides: Partial<WatchConfigSummary> = {}): WatchConfigSummary {
  return {
    id: 'watch-1',
    target_streams: ['stream-alpha'],
    last_fire_at: new Date().toISOString(),
    last_fire_status: 'ok',
    error_count: 0,
    ...overrides,
  };
}

function makeState(configs: WatchConfigSummary[]): StateOfRecord {
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
    watch_configs: configs,
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('WatchDetail', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  it('renders watch config details from projection', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1' })]));

    render(<WatchDetail configId="watch-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('watch-1')).toBeInTheDocument();
    });
    expect(screen.getByText('stream-alpha')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows not found state when config ID is missing', async () => {
    projectionStore.getState().hydrate(makeState([]));

    render(<WatchDetail configId="nonexistent" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('Watch config not found')).toBeInTheDocument();
    });
  });

  it('disables action buttons for Viewer role', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1' })]));

    render(<WatchDetail configId="watch-1" role="viewer" />);

    await waitFor(() => {
      expect(screen.getByText('watch-1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Create Watch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Watch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Watch' })).toBeDisabled();
    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();
  });

  it('enables action buttons for Operator role', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1' })]));

    render(<WatchDetail configId="watch-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('watch-1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Create Watch' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Watch' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Watch' })).not.toBeDisabled();
  });

  it('renders target streams from projection', async () => {
    projectionStore.getState().hydrate(makeState([
      makeWatchConfig({ id: 'watch-1', target_streams: ['alpha', 'beta'] }),
    ]));

    render(<WatchDetail configId="watch-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('beta')).toBeInTheDocument();
    });
  });

  it('shows degrade note about missing rule/fire-history/errors', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1' })]));

    render(<WatchDetail configId="watch-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText(/Rule definition \/ fire history \/ errors are not projected/i)).toBeInTheDocument();
    });
  });

  it('shows Never when last_fire_at is null', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1', last_fire_at: null })]));

    render(<WatchDetail configId="watch-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState([makeWatchConfig({ id: 'watch-1' })]));
    const { container } = render(<WatchDetail configId="watch-1" role="operator" />);
    await waitFor(() => {
      expect(screen.getByText('watch-1')).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
