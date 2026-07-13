import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScopeConsole } from './ScopeConsole';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, ScopeSummary } from '@/ipc/types';

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
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope,
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('ScopeConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
  });

  it('renders empty state when no scope data', () => {
    projectionStore.getState().hydrate(makeState());
    render(<ScopeConsole />);
    expect(screen.getByText('No agents to scope')).toBeInTheDocument();
    expect(screen.getByText('Scope data will appear here when agents are registered.')).toBeInTheDocument();
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

    render(<ScopeConsole />);

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

    render(<ScopeConsole />);

    const row = screen.getByRole('button', { name: /agent-alpha/i });
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/scope',
      search: { focus: 'agent-alpha' },
      replace: true,
    });
    expect(searchState.focus).toBe('agent-alpha');
  });

  it('scrubs stale focus param when the agent is no longer in scope', async () => {
    searchState.focus = 'ghost-agent';
    projectionStore.getState().hydrate(makeState({}));

    render(<ScopeConsole />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/scope',
          replace: true,
          search: { focus: undefined },
        }),
      ),
    );
  });
});
