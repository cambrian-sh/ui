import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PluginSurface } from '@/components/PluginSurface';
import { projectionStore } from '@/store/projection';
import type { PluginState, StateOfRecord } from '@/ipc/types';

function makeState(capabilities: string[], plugins: PluginState[]): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0067',
    capabilities,
    contract_skew: 0,
    plugins,
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

function plugin(over: Partial<PluginState> = {}): PluginState {
  return {
    id: 'authz',
    display_name: 'Access Policy',
    version: '1.0.0',
    state: 'active',
    capabilities: ['access-policy'],
    panels: [],
    reason: '',
    missing: [],
    expires_at: '',
    skew: 'aligned',
    pinned_version: '1.0.0',
    ...over,
  };
}

function renderSurface(state: StateOfRecord) {
  projectionStore.getState().hydrate(state);
  render(
    <PluginSurface pluginId="authz" capability="access-policy">
      <p>panel body</p>
    </PluginSurface>,
  );
}

describe('PluginSurface (ADR-0089)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  // The default case has to be silent, or the banner becomes chrome nobody reads.
  it('shows no banner when the plugin matches what this console was built against', () => {
    renderSurface(makeState(['access-policy'], [plugin()]));

    expect(screen.getByText('panel body')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // The case the whole feature exists for: every RPC answers normally while the
  // panels compiled here may mean something else.
  it('warns loudly on a major-version difference, and still renders the panel', () => {
    renderSurface(makeState(['access-policy'], [plugin({ version: '2.0.0', skew: 'major' })]));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('2.0.0');
    expect(alert).toHaveTextContent('1.0.0');
    // The surface is not withheld — the operator is told, then trusted.
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  it('notes a minor difference quietly rather than as an alert', () => {
    renderSurface(makeState(['access-policy'], [plugin({ version: '1.4.2', skew: 'minor' })]));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('plugin-skew-minor')).toHaveTextContent('1.4.2');
  });

  // A kernel too old to report plugins (pre-0067) serves the surface anyway. That
  // is worth saying once, quietly — not treating as an error.
  it('says so when the kernel serves the surface but reports no plugin', () => {
    renderSurface(makeState(['access-policy'], []));

    expect(screen.getByTestId('plugin-skew-unattributed')).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  // An OSS kernel is a correct deployment, not a broken premium one.
  it('explains the absence plainly when the deployment simply has no such plugin', () => {
    renderSurface(makeState([], []));

    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
    expect(screen.getByTestId('plugin-absent')).toHaveTextContent('complete deployment');
  });

  // The distinction contract 0067 exists to carry: paid for, built in, not running.
  it('distinguishes a plugin that declined to register from one that is absent', () => {
    renderSurface(
      makeState([], [plugin({ state: 'not_entitled', reason: 'licence expired 2026-07-01' })]),
    );

    expect(screen.getByTestId('plugin-not-entitled')).toHaveTextContent('licence expired');
    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  });

  // An expired entitlement still serves inside its grace window (ADR-0082 D9), so
  // the surface stays and the warning is about time running out, not about being
  // locked out now.
  it('warns about an expired entitlement while still rendering the surface', () => {
    renderSurface(
      makeState(
        ['access-policy'],
        [plugin({ state: 'expired', expires_at: '2026-07-01T00:00:00Z' })],
      ),
    );

    expect(screen.getByTestId('plugin-expired')).toHaveTextContent('grace window');
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  it('names the missing dependency when one blocked the plugin', () => {
    renderSurface(makeState([], [plugin({ state: 'deps_unmet', missing: ['reactive'] })]));

    expect(screen.getByTestId('plugin-deps-unmet')).toHaveTextContent('reactive');
  });
});
