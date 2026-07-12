import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToolDetail } from '@/screens/tools/ToolDetail';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import type {
  ToolDetail as ToolDetailType,
  AgentSummary,
  StateOfRecord,
  BlastRadiusPreviewResponse,
} from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    getTool: vi.fn(),
    setToolGrant: vi.fn().mockResolvedValue({ deduped: false }),
    getBlastRadiusPreview: vi.fn().mockResolvedValue({
      affected_agents: [],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    } as BlastRadiusPreviewResponse),
  },
}));

function makeTool(overrides: Partial<ToolDetailType> = {}): ToolDetailType {
  return {
    id: 'tool-1',
    description: 'A test tool',
    danger: false,
    granted_agent_count: 0,
    recent_invocation_count: 0,
    last_cost: 0,
    manifest_version: '1.0',
    schema_json: '{}',
    granted_agents: [],
    ...overrides,
  };
}

function makeAgent(id: string): AgentSummary {
  return {
    id,
    trait: 'Cognitive',
    scope_summary: '',
    trust_score: 0.5,
    last_activity_at: new Date().toISOString(),
    last_state: 'idle',
  };
}

function makeState(agents: AgentSummary[] = []): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: null, last_known_state_at: null, reason: null },
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

function seedAgents(agents: AgentSummary[]) {
  projectionStore.setState({ state: makeState(agents) });
}

async function renderAndOpenActions(toolId = 'tool-1', role: 'operator' | 'viewer' = 'operator') {
  render(<ToolDetail toolId={toolId} role={role} />);
  await waitFor(() => {
    expect(screen.getByText(toolId)).toBeInTheDocument();
  });
  const actionsTab = screen.getByRole('tab', { name: 'Actions' });
  fireEvent.mouseDown(actionsTab);
  fireEvent.click(actionsTab);
}

describe('ToolDetail Actions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getTool).mockResolvedValue(makeTool());
    projectionStore.setState({ state: makeState() });
  });

  it('hides grant/revoke controls for Viewer role', async () => {
    seedAgents([makeAgent('agent-1')]);
    await renderAndOpenActions('tool-1', 'viewer');

    expect(screen.queryByRole('button', { name: /Grant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke/i })).not.toBeInTheDocument();
    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();
  });

  it('shows Grant for ungranted agents and Revoke for granted agents', async () => {
    seedAgents([makeAgent('agent-1'), makeAgent('agent-2')]);
    vi.mocked(ipc.getTool).mockResolvedValue(makeTool({ granted_agents: ['agent-1'] }));

    await renderAndOpenActions('tool-1', 'operator');

    expect(screen.getByRole('button', { name: 'Revoke agent-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant agent-2' })).toBeInTheDocument();
  });

  it('disables confirm when reason is empty and enables with valid reason', async () => {
    seedAgents([makeAgent('agent-1')]);
    await renderAndOpenActions('tool-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Grant agent-1' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Grant' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls setToolGrant with correct params on confirm', async () => {
    seedAgents([makeAgent('agent-1')]);
    await renderAndOpenActions('tool-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Grant agent-1' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.setToolGrant)).toHaveBeenCalledWith({
        agent_id: 'agent-1',
        tool_name: 'tool-1',
        granted: true,
        reason: 'needed for task',
      });
    });
  });

  it('shows ErrorState on kernel error', async () => {
    seedAgents([makeAgent('agent-1')]);
    vi.mocked(ipc.setToolGrant).mockRejectedValueOnce(new Error('PermissionDenied'));

    await renderAndOpenActions('tool-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Grant agent-1' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('fetches blast-radius preview before opening the dialog', async () => {
    seedAgents([makeAgent('agent-1')]);
    const previewResp: BlastRadiusPreviewResponse = {
      affected_agents: [],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    };
    vi.mocked(ipc.getBlastRadiusPreview).mockResolvedValueOnce(previewResp);

    await renderAndOpenActions('tool-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Grant agent-1' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.getBlastRadiusPreview)).toHaveBeenCalledWith({
        kind: 'set_tool_grant',
        agent_id: 'agent-1',
        tool_name: 'tool-1',
        granted: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Blast radius preview')).toBeInTheDocument();
    });
  });
});