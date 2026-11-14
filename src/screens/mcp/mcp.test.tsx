import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MCPServerConfig, StateOfRecord } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';

const listMCPServerConfigs = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listMCPServerConfigs: (...a: unknown[]) => listMCPServerConfigs(...a),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
    scope: {},
    watch_configs: [],
  } as unknown as StateOfRecord;
}

describe('MCPServersConsole (contract 0097 — read-only runtime view)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(makeState('operator'));
    queryClient.clear();
    listMCPServerConfigs.mockReset();
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

  it('is read-only: no add or edit, and it points to Integrations for changes', async () => {
    // Owner decision 2026-11-15: Integrations owns every MCP server change.
    listMCPServerConfigs.mockResolvedValue([makeServer({ id: 'firecrawl' })]);
    render(<MCPServersConsole />);
    expect(await screen.findByText('firecrawl')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add server' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit →' })).toBeNull();
    expect(screen.getByText(/Add or change servers in Integrations/)).toBeInTheDocument();
  });
});
