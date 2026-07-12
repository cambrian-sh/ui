import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ToolsSkillsConsole } from '@/screens/tools/ToolsSkillsConsole';
import { projectionStore } from '@/store/projection';
import type { ToolSummary, SkillSummary, StateOfRecord } from '@/ipc/types';

const searchState: { focus?: string; tab?: string } = {};
const navigateMock = vi.fn((opts: { search?: { focus?: string; tab?: string } }) => {
  if (opts.search?.focus !== undefined) searchState.focus = opts.search.focus;
  if (opts.search?.tab !== undefined) searchState.tab = opts.search.tab;
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

function makeTool(overrides: Partial<ToolSummary> = {}): ToolSummary {
  return {
    id: `tool-${Math.random().toString(36).slice(2, 8)}`,
    description: 'A test tool',
    danger: false,
    granted_agent_count: 0,
    recent_invocation_count: 0,
    last_cost: 0,
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id: `skill-${Math.random().toString(36).slice(2, 8)}`,
    description: 'A test skill',
    scope_tags: [],
    loaded_in_count: 0,
    last_loaded_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(tools: ToolSummary[] = [], skills: SkillSummary[] = []): StateOfRecord {
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
    agents: [],
    tools,
    skills,
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('ToolsSkillsConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchState.focus = undefined;
    searchState.tab = undefined;
  });

  it('renders the empty state when there are no tools or skills', () => {
    projectionStore.setState({ state: makeState() });
    render(<ToolsSkillsConsole />);
    expect(screen.getByText('No tools registered')).toBeInTheDocument();
  });

  it('renders tools and supports filtering', () => {
    const tools = [
      makeTool({ id: 'tool-1', danger: false }),
      makeTool({ id: 'tool-2', danger: true }),
      makeTool({ id: 'tool-3', danger: false }),
    ];
    projectionStore.setState({ state: makeState(tools) });
    render(<ToolsSkillsConsole />);

    const list = screen.getByRole('list', { name: 'Tools' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);

    const dangerBtn = screen.getByRole('button', { name: 'Danger only' });
    fireEvent.click(dangerBtn);

    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByText('tool-2')).toBeInTheDocument();
  });

  it('shows the detail panel when a tool is selected', () => {
    const tools = [makeTool({ id: 'tool-1' })];
    projectionStore.setState({ state: makeState(tools) });
    render(<ToolsSkillsConsole />);

    const list = screen.getByRole('list', { name: 'Tools' });
    const row = within(list).getByRole('button');
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/tools',
      search: { focus: 'tool-1', tab: 'tools' },
    });
  });

  it('switches to skills tab and shows skills', () => {
    const skills = [makeSkill({ id: 'skill-1' })];
    projectionStore.setState({ state: makeState([], skills) });
    render(<ToolsSkillsConsole />);

    const skillsTab = screen.getByRole('tab', { name: 'Skills' });
    fireEvent.mouseDown(skillsTab);
    fireEvent.click(skillsTab);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/tools',
      search: { tab: 'skills', focus: undefined },
    });

    // Simulate the router updating the search state
    searchState.tab = 'skills';
    render(<ToolsSkillsConsole />);

    const list = screen.getByRole('list', { name: 'Skills' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByText('skill-1')).toBeInTheDocument();
  });
});
