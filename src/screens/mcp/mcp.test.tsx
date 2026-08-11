import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MCPServerConfig, StateOfRecord } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';

const listMCPServerConfigs = vi.fn();
const saveMCPServer = vi.fn();
const testMCPServer = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listMCPServerConfigs: (...a: unknown[]) => listMCPServerConfigs(...a),
    saveMCPServer: (...a: unknown[]) => saveMCPServer(...a),
    removeMCPServer: vi.fn(),
    setMCPServerToken: vi.fn(),
    clearMCPServerToken: vi.fn(),
    testMCPServer: (...a: unknown[]) => testMCPServer(...a),
  },
}));

import { MCPServersConsole } from './MCPServersConsole';

function makeServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'firecrawl',
    transport: 'http',
    endpoint: 'http://localhost:3002/mcp',
    args: [],
    auth_type: 'none',
    auth_header: '',
    classification_tags: [],
    connected: true,
    last_error: '',
    tool_count: 6,
    token_configured: false,
    token_source: '',
    ...overrides,
  };
}

function makeState(role: string): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0097',
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
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  } as unknown as StateOfRecord;
}

describe('MCPServersConsole (contract 0097 — the ONE MCP surface)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(makeState('operator'));
    queryClient.clear();
    listMCPServerConfigs.mockReset();
    saveMCPServer.mockReset();
    testMCPServer.mockReset();
  });

  it('renders the kernel-reported servers with their live connection state', async () => {
    listMCPServerConfigs.mockResolvedValue([
      makeServer({ id: 'firecrawl', connected: true, tool_count: 6 }),
      makeServer({
        id: 'tau2-airline',
        connected: false,
        last_error: 'dial tcp: connection refused',
      }),
    ]);

    render(<MCPServersConsole />);

    expect(await screen.findByText('firecrawl')).toBeInTheDocument();
    expect(screen.getByText('tau2-airline')).toBeInTheDocument();
    // A disconnected server explains itself AND says the kernel keeps trying —
    // "down" without the retry fact reads as "broken until I do something".
    expect(screen.getByText(/dial tcp: connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/keeps retrying with backoff/)).toBeInTheDocument();
  });

  it('offers Add server on an empty list — zero servers is a starting state, not an absence', async () => {
    listMCPServerConfigs.mockResolvedValue([]);
    render(<MCPServersConsole />);
    expect(await screen.findByText(/No servers yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add server' })).toBeEnabled();
  });

  it('a viewer can look but not add', async () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    listMCPServerConfigs.mockResolvedValue([]);
    render(<MCPServersConsole />);
    expect(await screen.findByRole('button', { name: 'Add server' })).toBeDisabled();
  });

  it('Add server opens the editor and a save calls the write RPC', async () => {
    listMCPServerConfigs.mockResolvedValue([]);
    saveMCPServer.mockResolvedValue({
      command_id: 'c1',
      deduped: false,
      outcomes: [{ key: 'mcp.servers', stored: true, effect: 'live', shadowed_by: '', error: '' }],
    });

    render(<MCPServersConsole />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add server' }));

    expect(screen.getByText('New MCP server')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'files' } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'http://localhost:9000/mcp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));

    await waitFor(() => expect(saveMCPServer).toHaveBeenCalledTimes(1));
    const [saved] = saveMCPServer.mock.calls[0] as [MCPServerConfig, string];
    expect(saved.id).toBe('files');
    expect(saved.endpoint).toBe('http://localhost:9000/mcp');
  });

  it('the probe reports the tools the server actually advertises', async () => {
    listMCPServerConfigs.mockResolvedValue([makeServer({ id: 'firecrawl' })]);
    testMCPServer.mockResolvedValue({
      ok: true,
      latency_ms: 42,
      tool_names: ['scrape', 'crawl'],
      error: '',
    });

    render(<MCPServersConsole />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test this server' }));

    // The tool list is the fact worth one real connection — nothing else in
    // the console can reveal what a server offers before committing to it.
    expect(await screen.findByText('scrape')).toBeInTheDocument();
    expect(screen.getByText('crawl')).toBeInTheDocument();
    expect(testMCPServer).toHaveBeenCalledTimes(1);
  });
});
