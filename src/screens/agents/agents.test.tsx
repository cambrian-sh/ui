import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { AgentsConsole } from '@/screens/agents/AgentsConsole';
import { projectionStore } from '@/store/projection';
import type { AgentSummary, StateOfRecord } from '@/ipc/types';

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

function makeAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    trait: 'Cognitive',
    scope_summary: 'read:*,write:*',
    trust_score: 0.85,
    last_activity_at: new Date().toISOString(),
    last_state: 'ready',
    ...overrides,
  };
}

function makeState(agents: AgentSummary[] = []): StateOfRecord {
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
    agents,
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

describe('AgentsConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
  });

  it('renders the empty state when there are no agents', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<AgentsConsole />);
    expect(screen.getByText('No agents registered')).toBeInTheDocument();
  });

  it('renders all agents and supports trait filtering', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeAgent({ id: 'alpha', trait: 'Cognitive' }),
        makeAgent({ id: 'beta', trait: 'Model' }),
        makeAgent({ id: 'gamma', trait: 'Daemon' }),
      ]),
    );

    render(<AgentsConsole />);

    const list = screen.getByRole('list', { name: 'Agents' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Model' }));

    expect(within(list).queryByText('alpha')).not.toBeInTheDocument();
    expect(within(list).getByText('beta')).toBeInTheDocument();
    expect(within(list).queryByText('gamma')).not.toBeInTheDocument();
  });

  it('shows the detail panel when an agent is selected', () => {
    const agent = makeAgent({ id: 'selected-agent' });
    projectionStore.getState().hydrate(makeState([agent]));

    render(<AgentsConsole />);

    fireEvent.click(screen.getByText('selected-agent'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/agents',
      search: { focus: agent.id },
    });
    expect(searchState.focus).toBe(agent.id);
  });

  it('renders without crashing when trust_score is undefined', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeAgent({ id: 'nullish-agent', trust_score: undefined as unknown as number }),
      ]),
    );

    render(<AgentsConsole />);

    expect(screen.getByText('nullish-agent')).toBeInTheDocument();
  });
});
