import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MCPServersConsole } from '@/screens/mcp/MCPServersConsole';
import { projectionStore } from '@/store/projection';
import type { MCPServerSummary, StateOfRecord } from '@/ipc/types';

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

function makeMCPServer(overrides: Partial<MCPServerSummary> = {}): MCPServerSummary {
  return {
    id: `mcp-${Math.random().toString(36).slice(2, 8)}`,
    connection_state: 'Up',
    tool_count: 5,
    default_price: 0.0,
    last_health_check_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(mcp_servers: MCPServerSummary[] = []): StateOfRecord {
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
    mcp_servers,
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('MCPServersConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
  });

  it('renders the empty state when there are no MCP servers', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<MCPServersConsole />);
    expect(screen.getByText('No MCP servers registered')).toBeInTheDocument();
  });

  it('renders all MCP servers and supports connection state filtering', () => {
    projectionStore.getState().hydrate(
      makeState([
        makeMCPServer({ id: 'alpha', connection_state: 'Up' }),
        makeMCPServer({ id: 'beta', connection_state: 'Reconnecting' }),
        makeMCPServer({ id: 'gamma', connection_state: 'Down' }),
      ]),
    );

    render(<MCPServersConsole />);

    const list = screen.getByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnecting' }));

    expect(within(list).queryByText('alpha')).not.toBeInTheDocument();
    expect(within(list).getByText('beta')).toBeInTheDocument();
    expect(within(list).queryByText('gamma')).not.toBeInTheDocument();
  });

  it('shows the detail panel when an MCP server is selected', () => {
    const server = makeMCPServer({ id: 'selected-server' });
    projectionStore.getState().hydrate(makeState([server]));

    render(<MCPServersConsole />);

    fireEvent.click(screen.getByText('selected-server'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/mcp',
      search: { focus: server.id },
    });
    expect(searchState.focus).toBe(server.id);
  });
});
