import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { ToolsConsole } from '@/screens/tools/ToolsConsole';
import { projectionStore } from '@/store/projection';
import type { ToolSummary, StateOfRecord } from '@/ipc/types';

const searchState: { focus?: string; tab?: string } = {};
const navigateMock = vi.fn((opts: { to?: string; search?: { focus?: string; tab?: string }; replace?: boolean }) => {
  if (opts.search?.focus !== undefined) searchState.focus = opts.search.focus;
  if (opts.search?.tab !== undefined) searchState.tab = opts.search.tab;
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
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

function makeState(tools: ToolSummary[] = []): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: null, last_known_state_at: null, reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools,
    scope: {},
    watch_configs: [],
  };
}

describe('ToolsConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchState.focus = undefined;
    searchState.tab = undefined;
  });

  it('renders the empty state when there are no tools', () => {
    projectionStore.setState({ state: makeState() });
    render(<ToolsConsole />);
    expect(screen.getByText('No tools registered')).toBeInTheDocument();
  });

  it('renders tools and supports filtering', () => {
    const tools = [
      makeTool({ id: 'tool-1', danger: false }),
      makeTool({ id: 'tool-2', danger: true }),
      makeTool({ id: 'tool-3', danger: false }),
    ];
    projectionStore.setState({ state: makeState(tools) });
    render(<ToolsConsole />);

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
    render(<ToolsConsole />);

    const list = screen.getByRole('list', { name: 'Tools' });
    const row = within(list).getByRole('button');
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/tools',
      search: { focus: 'tool-1' },
      replace: true,
    });
  });

  it('has no skills tab; it points at the /skills screen instead', () => {
    projectionStore.setState({ state: makeState([makeTool({ id: 'tool-1' })]) });
    render(<ToolsConsole />);
    expect(screen.queryByRole('tab', { name: 'Skills' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Skills' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
  });

  it('scrubs stale focus param when the tool is no longer in the list', async () => {
    searchState.focus = 'ghost-tool';
    projectionStore.setState({ state: makeState([]) });

    render(<ToolsConsole />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/tools',
          replace: true,
          search: { focus: undefined },
        }),
      ),
    );
  });
});
