import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';
import type { MCPServerConfig, StateOfRecord } from '@/ipc/types';

const listMCPServerConfigs = vi.fn();
const saveMCPServer = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listMCPServerConfigs: (...a: unknown[]) => listMCPServerConfigs(...a),
    saveMCPServer: (...a: unknown[]) => saveMCPServer(...a),
    removeMCPServer: vi.fn(),
    setMCPServerToken: vi.fn(),
    clearMCPServerToken: vi.fn(),
    testMCPServer: vi.fn(),
  },
}));

import { CustomServers } from './CustomServers';

function seed(role: string) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role,
    capabilities: [],
    pending_hitl: [],
    audit_tail: [],
  } as unknown as StateOfRecord);
}

const server = (id: string): MCPServerConfig => ({
  id, transport: 'http', endpoint: 'http://localhost:3002/mcp', args: [], auth_type: 'none', auth_header: '',
  classification_tags: [], connected: true, last_error: '', tool_count: 2, token_configured: false, token_source: '',
});

// Owner decision 2026-11-15 (ENG-1188): Integrations owns every MCP server change,
// including custom (non-catalog) servers, which used to be edited on /mcp.
describe('CustomServers (Integrations owns MCP server changes)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    queryClient.clear();
    listMCPServerConfigs.mockReset();
    saveMCPServer.mockReset();
  });

  it('lists servers that are not catalog integrations', async () => {
    seed('operator');
    listMCPServerConfigs.mockResolvedValue([server('brave'), server('my-crm')]);
    render(<CustomServers exclude={['brave']} />);
    expect(await screen.findByText('my-crm')).toBeInTheDocument();
    expect(screen.queryByText('brave')).toBeNull();
  });

  it('Add server opens the editor and a save calls the write RPC', async () => {
    seed('operator');
    listMCPServerConfigs.mockResolvedValue([]);
    saveMCPServer.mockResolvedValue({
      command_id: 'c1', deduped: false,
      outcomes: [{ key: 'mcp.servers', stored: true, effect: 'live', shadowed_by: '', error: '' }],
    });
    render(<CustomServers />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add server' }));
    fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'files' } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://localhost:9000/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));
    await waitFor(() => expect(saveMCPServer).toHaveBeenCalledTimes(1));
    const [saved] = saveMCPServer.mock.calls[0] as [MCPServerConfig, string];
    expect(saved.id).toBe('files');
  });

  it('a viewer can look but not add', async () => {
    seed('viewer');
    listMCPServerConfigs.mockResolvedValue([]);
    render(<CustomServers />);
    expect(await screen.findByRole('button', { name: 'Add server' })).toBeDisabled();
  });
});
