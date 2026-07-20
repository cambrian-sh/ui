import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToolDetail } from '@/screens/tools/ToolDetail';
import { projectionStore } from '@/store/projection';
import type {
  ToolSummary,
  StateOfRecord,
} from '@/ipc/types';

function makeTool(overrides: Partial<ToolSummary> = {}): ToolSummary {
  return {
    id: 'tool-1',
    description: 'A test tool',
    danger: false,
    granted_agent_count: 0,
    recent_invocation_count: 0,
    last_cost: 0,
    ...overrides,
  };
}

function makeState(
  tools: ToolSummary[] = [],
  role: 'operator' | 'viewer' = 'operator',
): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: null, last_known_state_at: null, reason: null },
    role,
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
    tools,
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('ToolDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tool info from projection', () => {
    const tool = makeTool({
      id: 'tool-alpha',
      description: 'Alpha tool',
      danger: true,
      granted_agent_count: 3,
      recent_invocation_count: 12,
      last_cost: 0.45,
    });
    projectionStore.setState({
      state: makeState([tool], 'operator'),
    });

    render(<ToolDetail toolId="tool-alpha" role="operator" />);

    expect(screen.getByText('tool-alpha')).toBeInTheDocument();
    expect(screen.getByText('Alpha tool')).toBeInTheDocument();
    expect(screen.getByText('Danger')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('$0.45')).toBeInTheDocument();
  });

  it('shows empty state when tool not found', () => {
    projectionStore.setState({
      state: makeState([], 'operator'),
    });

    render(<ToolDetail toolId="missing-tool" role="operator" />);

    expect(screen.getByText('Tool not found in the current projection.')).toBeInTheDocument();
  });

  it('shows loading skeleton when projection is hydrating', () => {
    projectionStore.setState({
      state: null,
      isHydrating: true,
    });

    render(<ToolDetail toolId="tool-1" role="operator" />);

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('viewer role sees operator notice in Actions tab', async () => {
    const tool = makeTool({ id: 'tool-1' });
    projectionStore.setState({
      state: makeState([tool], 'viewer'),
    });

    render(<ToolDetail toolId="tool-1" role="viewer" />);

    expect(screen.getByText('tool-1')).toBeInTheDocument();

    const actionsTab = screen.getByRole('tab', { name: 'Actions' });
    fireEvent.mouseDown(actionsTab);
    fireEvent.click(actionsTab);

    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();
  });

  it('shows degradation notice for per-agent grant list', () => {
    const tool = makeTool({ id: 'tool-1', granted_agent_count: 2 });
    projectionStore.setState({
      state: makeState([tool], 'operator'),
    });

    render(<ToolDetail toolId="tool-1" role="operator" />);

    expect(screen.getByText(/not projected by the current kernel build/i)).toBeInTheDocument();
  });

  it('renders without crashing when fields are empty', () => {
    const tool = makeTool({ description: '', last_cost: 0, granted_agent_count: 0 });
    projectionStore.setState({
      state: makeState([tool], 'operator'),
    });

    render(<ToolDetail toolId="tool-1" role="operator" />);

    expect(screen.getByText('tool-1')).toBeInTheDocument();
  });

  it('has no a11y violations', async () => {
    const tool = makeTool({ id: 'tool-1' });
    projectionStore.setState({
      state: makeState([tool], 'operator'),
    });
    const { container } = render(<ToolDetail toolId="tool-1" role="operator" />);
    expect(screen.getByText('tool-1')).toBeInTheDocument();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
