import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { PlansInFlight } from '@/screens/plans/PlansInFlight';
import { projectionStore } from '@/store/projection';
import type { PlanInFlight, SessionSummary, StateOfRecord } from '@/ipc/types';

const searchState: { focus: string | undefined } = { focus: undefined };
const navigateMock = vi.fn((opts: { to?: string; search?: { focus?: string }; replace?: boolean }) => {
  if (opts.search?.focus !== undefined) {
    searchState.focus = opts.search.focus;
  }
});

type HotkeyHandler = (e: { key: string; preventDefault: () => void }) => void;
let capturedHandler: HotkeyHandler | null = null;
let capturedEnabled: boolean | null = null;

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

/* Mock that respects the `enabled` flag, matching the real library's
 * runtime behaviour. When `enabled` is false, invoking the captured
 * handler is a no-op. When true, the handler fires. */
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: (
    _keys: string,
    handler: HotkeyHandler,
    options?: { enabled?: boolean },
  ) => {
    capturedHandler = (e) => {
      if (options?.enabled === false) return;
      handler(e);
    };
    capturedEnabled = options?.enabled ?? true;
  },
}));

function makePlan(overrides: Partial<PlanInFlight> = {}): PlanInFlight {
  return {
    plan_id: `mock-plan-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'mock-session-1',
    subject: 'Sample plan',
    step_count: 3,
    active_agent: 'analyst',
    status: 'running',
    elapsed_ms: 5000,
    cost: 0.012,
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'mock-session-1',
    title: 'Test session',
    state: 'active',
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    plan_count: 0,
    agent_mix: [],
    cost: 0,
    ...overrides,
  };
}

function makeState(
  plans: PlanInFlight[] = [],
  sessions: SessionSummary[] = [],
): StateOfRecord {
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
    plans,
    sessions,
    audit_tail: [],
    pending_hitl: [],
    agents: [],
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

describe('PlansInFlight', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    navigateMock.mockClear();
    capturedHandler = null;
    capturedEnabled = null;
  });

  it('renders the empty state when there are no plans', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<PlansInFlight />);
    expect(screen.getByText('No plans in flight')).toBeInTheDocument();
  });

  it('shows a clear-filters action in the empty state when filters exclude all plans', () => {
    projectionStore.getState().hydrate(
      makeState([makePlan({ plan_id: 'plan-1', subject: 'Real plan' })]),
    );
    render(<PlansInFlight />);
    fireEvent.change(screen.getByLabelText('Search plans'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('renders all plans sorted by started_at descending', () => {
    const old = makePlan({ plan_id: 'plan-old', subject: 'Old plan', started_at: '2026-01-01T00:00:00Z' });
    const fresh = makePlan({ plan_id: 'plan-fresh', subject: 'Fresh plan', started_at: '2026-06-01T00:00:00Z' });
    projectionStore.getState().hydrate(makeState([old, fresh]));

    render(<PlansInFlight />);

    const list = screen.getByRole('list', { name: 'Plans in flight' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Fresh plan');
    expect(rows[1]).toHaveTextContent('Old plan');
  });

  it('shows the session title in each row', () => {
    const plan = makePlan({ subject: 'Migrate schema' });
    const session = makeSession({ session_id: 'mock-session-1', title: 'Production deployment' });
    projectionStore.getState().hydrate(makeState([plan], [session]));

    render(<PlansInFlight />);

    expect(screen.getByText('Production deployment')).toBeInTheDocument();
  });

  it('supports status filtering', () => {
    const running = makePlan({ plan_id: 'plan-r', subject: 'Running plan', status: 'running' });
    const paused = makePlan({ plan_id: 'plan-p', subject: 'Paused plan', status: 'paused' });
    projectionStore.getState().hydrate(makeState([running, paused]));

    render(<PlansInFlight />);

    const list = screen.getByRole('list', { name: 'Plans in flight' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Paused' }));

    expect(within(list).getByText('Paused plan')).toBeInTheDocument();
    expect(within(list).queryByText('Running plan')).not.toBeInTheDocument();
  });

  it('clicking a row writes the focus search param', () => {
    const plan = makePlan({ plan_id: 'plan-x', subject: 'Selected plan' });
    projectionStore.getState().hydrate(makeState([plan]));

    render(<PlansInFlight />);

    fireEvent.click(screen.getByText('Selected plan'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/plans',
      search: { focus: 'plan-x' },
      replace: true,
    });
    expect(searchState.focus).toBe('plan-x');
  });

  it('1-9 hotkey does not fire when the list is not focused', () => {
    const plans = [
      makePlan({ plan_id: 'plan-1', subject: 'Plan 1' }),
      makePlan({ plan_id: 'plan-2', subject: 'Plan 2' }),
    ];
    projectionStore.getState().hydrate(makeState(plans));

    render(<PlansInFlight />);

    expect(capturedEnabled).toBe(false);
    capturedHandler!({ key: '2', preventDefault: () => {} });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('1-9 hotkey fires when the list has focus', () => {
    const plans = [
      makePlan({ plan_id: 'plan-1', subject: 'Plan 1' }),
      makePlan({ plan_id: 'plan-2', subject: 'Plan 2' }),
    ];
    projectionStore.getState().hydrate(makeState(plans));

    render(<PlansInFlight />);

    const list = screen.getByRole('list', { name: 'Plans in flight' });
    fireEvent.focus(list);

    expect(capturedEnabled).toBe(true);
    capturedHandler!({ key: '2', preventDefault: () => {} });

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/plans',
      search: { focus: 'plan-2' },
      replace: true,
    });
  });

  it('scrubs stale focus param when the plan is no longer in the list', async () => {
    searchState.focus = 'ghost-plan';
    projectionStore.getState().hydrate(makeState([]));

    render(<PlansInFlight />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/plans',
          replace: true,
          search: { focus: undefined },
        }),
      ),
    );
  });
});
