import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessPolicyConsole } from './AccessPolicyConsole';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, ScopeSummary } from '@/ipc/types';

const searchState: { focus: string | undefined; tab: string | undefined } = {
  focus: undefined,
  tab: undefined,
};
const navigateMock = vi.fn(
  (opts: { to?: string; search?: { focus?: string; tab?: string }; replace?: boolean }) => {
    if (opts.search && 'focus' in opts.search) {
      searchState.focus = opts.search.focus;
    }
    if (opts.search?.tab !== undefined) {
      searchState.tab = opts.search.tab;
    }
  },
);

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

function makeState(scope: Record<string, ScopeSummary> = {}): StateOfRecord {
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
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    scope,
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('AccessPolicyConsole — principals', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    // The console now lands on Overview — coverage is the first question, not
    // the principal list. These cases exercise the principals pane, so they
    // select it explicitly rather than relying on it being the default.
    searchState.tab = 'principals';
    navigateMock.mockClear();
  });

  it('hides the premium authoring panes on a kernel without the access-policy plane', () => {
    // ADR-0082 D2 / the console's own non-negotiable: a premium surface is
    // capability-gated, never probed. These RPCs answer Unimplemented without
    // the plane, so a rendered tab leads to a dead pane — worse than an absent
    // one. makeState() advertises no capabilities.
    projectionStore.getState().hydrate(makeState());
    render(<AccessPolicyConsole />);

    expect(screen.queryByRole('tab', { name: 'Policies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Groups' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Assistant' })).not.toBeInTheDocument();
    // The OSS panes ride the pinned contract and must stay.
    expect(screen.getByRole('tab', { name: 'Principals' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Explain' })).toBeInTheDocument();
    // And the screen says what the deployment IS rather than looking broken.
    expect(screen.getByText(/absent rather than broken/)).toBeInTheDocument();
  });

  it('renders empty state when no scope data, without claiming agents are the only principals', () => {
    projectionStore.getState().hydrate(makeState());
    render(<AccessPolicyConsole />);
    expect(screen.getByText('No scoped agents')).toBeInTheDocument();
    // The old copy said principals appear "when agents are registered", which is
    // what made a person bound to an entry point look like they did not exist.
    expect(screen.getByText(/People bound to an entry point are listed below/)).toBeInTheDocument();
  });

  it('renders agents and filters by search', () => {
    projectionStore.getState().hydrate(
      makeState({
        'agent-alpha': {
          agent_id: 'agent-alpha',
          effective_scope_summary: 'read:*,write:*',
          default_write_tags: ['tag1'],
          last_scope_change_at: new Date().toISOString(),
        },
        'agent-beta': {
          agent_id: 'agent-beta',
          effective_scope_summary: 'read:docs',
          default_write_tags: [],
          last_scope_change_at: new Date().toISOString(),
        },
      }),
    );

    render(<AccessPolicyConsole />);

    expect(screen.getByText('agent-alpha')).toBeInTheDocument();
    expect(screen.getByText('agent-beta')).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox', { name: 'Search agents' });
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    expect(screen.getByText('agent-alpha')).toBeInTheDocument();
    expect(screen.queryByText('agent-beta')).not.toBeInTheDocument();
  });

  it('navigates with focus param when agent is clicked', () => {
    projectionStore.getState().hydrate(
      makeState({
        'agent-alpha': {
          agent_id: 'agent-alpha',
          effective_scope_summary: 'read:*,write:*',
          default_write_tags: ['tag1'],
          last_scope_change_at: new Date().toISOString(),
        },
      }),
    );

    render(<AccessPolicyConsole />);

    const row = screen.getByRole('button', { name: /agent-alpha/i });
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/scope',
      search: { focus: 'agent-alpha', tab: 'principals' },
      replace: true,
    });
    expect(searchState.focus).toBe('agent-alpha');
  });

  it('scrubs stale focus param when the agent is no longer in scope', async () => {
    searchState.focus = 'ghost-agent';
    projectionStore.getState().hydrate(makeState({}));

    render(<AccessPolicyConsole />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/scope',
          replace: true,
          search: { focus: undefined, tab: 'principals' },
        }),
      ),
    );
  });
});
