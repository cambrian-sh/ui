import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MCPDetail } from '@/screens/mcp/MCPDetail';
import { ipc } from '@/ipc';
import type { MCPServerDetail } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    getMCPServer: vi.fn(),
    registerMCP: vi.fn().mockResolvedValue({ deduped: false }),
  },
}));

function makeServer(overrides: Partial<MCPServerDetail> = {}): MCPServerDetail {
  return {
    id: 'mcp-1',
    connection_state: 'Up',
    tool_count: 0,
    last_health_check_at: new Date().toISOString(),
    default_price: 0,
    health_check_history: [],
    discovered_tools: [],
    ...overrides,
  };
}

async function renderAndOpenActions(serverId = 'mcp-1', role: 'operator' | 'viewer' = 'operator') {
  render(<MCPDetail serverId={serverId} role={role} />);
  await waitFor(() => {
    expect(screen.getByText(serverId)).toBeInTheDocument();
  });
  const actionsTab = screen.getByRole('tab', { name: 'Actions' });
  fireEvent.mouseDown(actionsTab);
  fireEvent.click(actionsTab);
}

describe('MCPDetail Actions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getMCPServer).mockResolvedValue(makeServer());
  });

  it('hides register controls for Viewer role', async () => {
    await renderAndOpenActions('mcp-1', 'viewer');

    expect(screen.queryByLabelText('Name (required)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Command (required)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register MCP server' })).not.toBeInTheDocument();
    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();
  });

  it('shows register form for Operator role', async () => {
    await renderAndOpenActions('mcp-1', 'operator');

    expect(screen.getByLabelText('Name (required)')).toBeInTheDocument();
    expect(screen.getByLabelText('Command (required)')).toBeInTheDocument();
    expect(screen.getByLabelText('URL (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register MCP server' })).toBeInTheDocument();
  });

  it('disables Register when name or command is empty', async () => {
    await renderAndOpenActions('mcp-1', 'operator');

    const registerBtn = screen.getByRole('button', { name: 'Register MCP server' });
    expect(registerBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name (required)'), {
      target: { value: 'filesystem' },
    });
    expect(registerBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Command (required)'), {
      target: { value: 'npx -y server' },
    });
    expect(registerBtn).not.toBeDisabled();
  });

  it('disables confirm when reason is empty and enables with valid reason', async () => {
    await renderAndOpenActions('mcp-1', 'operator');

    fireEvent.change(screen.getByLabelText('Name (required)'), {
      target: { value: 'filesystem' },
    });
    fireEvent.change(screen.getByLabelText('Command (required)'), {
      target: { value: 'npx -y server' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register MCP server' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Register' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'need filesystem tool' },
    });

    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls registerMCP with correct params on confirm', async () => {
    await renderAndOpenActions('mcp-1', 'operator');

    fireEvent.change(screen.getByLabelText('Name (required)'), {
      target: { value: 'filesystem' },
    });
    fireEvent.change(screen.getByLabelText('Command (required)'), {
      target: { value: 'npx -y server' },
    });
    fireEvent.change(screen.getByLabelText('URL (optional)'), {
      target: { value: 'https://example.com/mcp' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register MCP server' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'need filesystem tool' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.registerMCP)).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'need filesystem tool',
          name: 'filesystem',
          command: 'npx -y server',
          url: 'https://example.com/mcp',
        }),
      );
    });
    expect(vi.mocked(ipc.registerMCP)).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(ipc.registerMCP).mock.calls[0][0];
    expect(callArgs.command_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('passes empty string url when url field is left blank', async () => {
    await renderAndOpenActions('mcp-1', 'operator');

    fireEvent.change(screen.getByLabelText('Name (required)'), {
      target: { value: 'filesystem' },
    });
    fireEvent.change(screen.getByLabelText('Command (required)'), {
      target: { value: 'npx -y server' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register MCP server' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'need filesystem tool' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.registerMCP)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '',
        }),
      );
    });
  });

  it('shows ErrorState on kernel error', async () => {
    vi.mocked(ipc.registerMCP).mockRejectedValueOnce(new Error('PermissionDenied'));

    await renderAndOpenActions('mcp-1', 'operator');

    fireEvent.change(screen.getByLabelText('Name (required)'), {
      target: { value: 'filesystem' },
    });
    fireEvent.change(screen.getByLabelText('Command (required)'), {
      target: { value: 'npx -y server' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register MCP server' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'need filesystem tool' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });
});