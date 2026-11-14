import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelegramConsole } from '@/screens/telegram/TelegramConsole';
import { projectionStore } from '@/store/projection';
import type { PluginState, StateOfRecord } from '@/ipc/types';

// T-20261113-telegram-and-link-review-screens-gate-on: Telegram is a premium
// plugin screen, so it must render inside PluginSurface (ADR-0089) and show the
// expired-entitlement and plugin-skew banners the other premium screens show.
// It used to gate on `capabilities.includes(...)` inline and showed neither.

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/routes/telegram', () => ({
  Route: { useSearch: () => ({}) },
}));

// Every kernel read stays pending: these tests are about the frame around the
// workspace, not what the workspace loads.
vi.mock('@/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => new Promise(() => {}) }),
}));

function makeState(capabilities: string[], plugins: PluginState[]): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0067',
    capabilities,
    contract_skew: 0,
    plugins,
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
    lifecycle: {
      scheduler_state: 'idle',
      pending_jobs: 0,
      last_consolidation: null,
      dormancy_events: [],
    },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

function telegramPlugin(over: Partial<PluginState> = {}): PluginState {
  return {
    id: 'telegram',
    display_name: 'Telegram Ingress',
    version: '1.0.0',
    state: 'active',
    capabilities: ['telegram-ingress'],
    panels: [],
    reason: '',
    missing: [],
    expires_at: '',
    skew: 'aligned',
    pinned_version: '1.0.0',
    ...over,
  };
}

describe('TelegramConsole plugin surface (ADR-0089)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  it('explains an absent plugin instead of rendering the workspace', () => {
    projectionStore.getState().hydrate(makeState([], []));
    render(<TelegramConsole />);
    expect(screen.getByText('This kernel is not running the Telegram plugin')).toBeInTheDocument();
    expect(screen.queryByText('Telegram')).not.toBeInTheDocument();
  });

  it('renders the workspace with no banner when the plugin is aligned', () => {
    projectionStore.getState().hydrate(makeState(['telegram-ingress'], [telegramPlugin()]));
    render(<TelegramConsole />);
    expect(screen.getByRole('heading', { name: 'Telegram' })).toBeInTheDocument();
    expect(screen.queryByTestId('plugin-skew-major')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plugin-expired')).not.toBeInTheDocument();
  });

  it('shows the major-skew banner for a telegram plugin across the major line', () => {
    projectionStore
      .getState()
      .hydrate(makeState(['telegram-ingress'], [telegramPlugin({ version: '2.0.0', skew: 'major' })]));
    render(<TelegramConsole />);
    expect(screen.getByTestId('plugin-skew-major')).toBeInTheDocument();
  });

  it('shows the expired-entitlement banner', () => {
    projectionStore
      .getState()
      .hydrate(makeState(['telegram-ingress'], [telegramPlugin({ state: 'expired' })]));
    render(<TelegramConsole />);
    expect(screen.getByTestId('plugin-expired')).toBeInTheDocument();
  });
});
