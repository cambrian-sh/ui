import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SurfaceRegistryPane } from './SurfaceRegistryPane';
import { projectionStore } from '@/store/projection';
import type { AgentSummary, IngressSpec, LinkSpec, PolicySpec, StateOfRecord } from '@/ipc/types';

const listIngresses = vi.fn();
const listLinks = vi.fn();
const listPolicies = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listIngresses: () => listIngresses(),
    listLinks: () => listLinks(),
    listPolicies: () => listPolicies(),
  },
}));

function makeState(agents: AgentSummary[] = []): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0076',
    capabilities: [],
    contract_skew: 0,
    plugins: [],
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
      max_energy_per_step: 0,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

const INGRESS: IngressSpec = {
  agent_id: 'telegram_ingress',
  surface_kind: 'chat',
  surface_id: 'telegram',
  namespace: ['tg:'],
};

const LINK: LinkSpec = {
  policy_id: 'p1',
  container_kind: 'surface',
  target_id: 'chat:telegram',
  enforced: false,
  order: 0,
  expires_at_unix_ms: 0,
  granted_by: '',
};

const POLICY: PolicySpec = {
  id: 'p1',
  name: 'No customer PII on Telegram',
  version: 1,
  rule: { required_tags: [], any_of_tags: [], forbidden_tags: [], granted_tags: [] },
  effects: { allow: [], deny: [] },
  mode: 'enforced',
  expires_at_unix_ms: 0,
  granted_by: '',
  updated_at_unix_ms: 0,
};

const DAEMON: AgentSummary = {
  id: 'telegram_ingress',
  trait: 'Daemon',
  scope_summary: '',
  trust_score: 0.9,
  last_activity_at: new Date().toISOString(),
  last_state: 'ready',
};

describe('SurfaceRegistryPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    listIngresses.mockResolvedValue([]);
    listLinks.mockResolvedValue([]);
    listPolicies.mockResolvedValue([]);
  });

  it('makes a surface a concrete thing: what registers it, and what bounds it', async () => {
    listIngresses.mockResolvedValue([INGRESS]);
    listLinks.mockResolvedValue([LINK]);
    listPolicies.mockResolvedValue([POLICY]);
    projectionStore.getState().hydrate(makeState([DAEMON]));

    render(<SurfaceRegistryPane />);

    await waitFor(() => expect(screen.getByText('surface:chat:telegram')).toBeInTheDocument());
    expect(screen.getByText(/registered by/)).toBeInTheDocument();
    expect(screen.getByText(/1 policy linked/)).toBeInTheDocument();
  });

  it('calls out a policy linked to a surface nothing registers', async () => {
    // The fault this screen exists to catch: from the Policies pane this is
    // indistinguishable from a working boundary, and it applies to nobody.
    listIngresses.mockResolvedValue([]);
    listLinks.mockResolvedValue([{ ...LINK, target_id: 'chat:slack' }]);
    listPolicies.mockResolvedValue([POLICY]);
    projectionStore.getState().hydrate(makeState());

    render(<SurfaceRegistryPane />);

    await waitFor(() => expect(screen.getByText('surface:chat:slack')).toBeInTheDocument());
    expect(screen.getByText('NOTHING REGISTERS THIS')).toBeInTheDocument();
    expect(screen.getByText(/1 surface has policy linked but nothing registering/)).toBeInTheDocument();
  });

  it('flags a registered surface that no policy bounds', async () => {
    listIngresses.mockResolvedValue([INGRESS]);
    projectionStore.getState().hydrate(makeState([DAEMON]));

    render(<SurfaceRegistryPane />);

    await waitFor(() => expect(screen.getByText('NO POLICY LINKED')).toBeInTheDocument());
  });

  it('distinguishes a silent daemon from a missing registration', async () => {
    // `agents` folds from AgentReadyOp, so an absent agent means nothing has
    // reported — which is not the same as the daemon being down.
    listIngresses.mockResolvedValue([INGRESS]);
    listLinks.mockResolvedValue([LINK]);
    listPolicies.mockResolvedValue([POLICY]);
    projectionStore.getState().hydrate(makeState([]));

    render(<SurfaceRegistryPane />);

    await waitFor(() => expect(screen.getByText('NO DAEMON HAS REPORTED')).toBeInTheDocument());
    expect(screen.queryByText('NOTHING REGISTERS THIS')).not.toBeInTheDocument();
  });

  it('reads an empty registry as a correct deployment, not a missing step', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<SurfaceRegistryPane />);

    await waitFor(() =>
      expect(screen.getByText(/correct deployment, not a missing step/)).toBeInTheDocument(),
    );
  });
});
