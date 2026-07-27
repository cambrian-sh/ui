import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessPolicyConsole } from './AccessPolicyConsole';
import { TagPicker } from './TagPicker';
import { DecisionCard } from './DecisionCard';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import type { AccessDecision, StateOfRecord } from '@/ipc/types';

const searchState: { focus: string | undefined; tab: string | undefined } = {
  focus: undefined,
  tab: undefined,
};
const navigateMock = vi.fn(
  (opts: { to?: string; search?: { focus?: string; tab?: string }; replace?: boolean }) => {
    if (opts.search && 'focus' in opts.search) searchState.focus = opts.search.focus;
    if (opts.search?.tab !== undefined) searchState.tab = opts.search.tab;
  },
);

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));

vi.mock('@/ipc', () => ({
  ipc: {
    // The premium plane carries closed-ness; the OSS list is the fallback.
    listTags: vi.fn().mockResolvedValue([]),
    listClassificationTags: vi.fn().mockResolvedValue([]),
    listIngresses: vi.fn().mockResolvedValue([]),
    listGroups: vi.fn().mockResolvedValue([]),
    listPolicies: vi.fn().mockResolvedValue([]),
    listLinks: vi.fn().mockResolvedValue([]),
    explainAccess: vi.fn(),
    resultantPolicy: vi.fn(),
  },
}));

function makeState(capabilities: string[] = []): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.10-alpha',
    contract_version: '0066',
    capabilities,
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
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
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

describe('AccessPolicyConsole — the capability gate', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    searchState.focus = undefined;
    searchState.tab = undefined;
    navigateMock.mockClear();
    vi.clearAllMocks();
  });

  // The whole point of the first premium surface: an OSS kernel does not grow it.
  it('hides the premium panes when the kernel does not advertise access-policy', async () => {
    projectionStore.getState().hydrate(makeState([]));
    searchState.tab = 'policies';
    render(<AccessPolicyConsole />);

    expect(await screen.findByText(/need the access-policy plugin/i)).toBeInTheDocument();
    // It must not have gone looking for data it cannot have.
    expect(ipc.listPolicies).not.toHaveBeenCalled();
    expect(ipc.listGroups).not.toHaveBeenCalled();
  });

  // An OSS kernel is a CORRECT single-tenant deployment, not a broken premium one.
  // The empty state has to say that, and must not read as an upsell.
  it('describes an unscoped kernel as correct rather than missing something', async () => {
    projectionStore.getState().hydrate(makeState([]));
    searchState.tab = 'groups';
    render(<AccessPolicyConsole />);

    const body = await screen.findByText(/single-tenant open-source deployment/i);
    expect(body).toBeInTheDocument();
    expect(body.textContent).toMatch(/correct and only behaviour/i);
    expect(screen.getByText(/Unscoped kernel/i)).toBeInTheDocument();
  });

  it('loads policy data only when the capability is present', async () => {
    projectionStore.getState().hydrate(makeState(['access-policy']));
    render(<AccessPolicyConsole />);

    await waitFor(() => expect(ipc.listPolicies).toHaveBeenCalled());
    expect(ipc.listGroups).toHaveBeenCalled();
    expect(ipc.listTags).toHaveBeenCalled();
  });

  // Explain rides the OSS contract, so it must stay usable on a kernel with no
  // plugin — that is the case where an unexplained empty result hurts most.
  it('keeps Explain available without the premium plane', async () => {
    projectionStore.getState().hydrate(makeState([]));
    searchState.tab = 'explain';
    render(<AccessPolicyConsole />);

    expect(await screen.findByLabelText(/^Principal$/i)).toBeInTheDocument();
    expect(screen.queryByText(/need the access-policy plugin/i)).not.toBeInTheDocument();
  });
});

describe('TagPicker — the free-text defect fix', () => {
  const configured = { tags: ['secrets', 'public_kb'], configured: true, closed: new Set<string>(), loading: false, error: null };
  const none = { tags: [], configured: false, closed: new Set<string>(), loading: false, error: null };

  it('offers selection, not free text, when a vocabulary exists', () => {
    const onChange = vi.fn();
    render(
      <TagPicker
        label="Forbidden"
        hint="hint"
        selected={[]}
        onChange={onChange}
        vocabulary={configured}
      />,
    );
    // No text input at all — a typo must be unreachable.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ secrets' }));
    expect(onChange).toHaveBeenCalledWith(['secrets']);
  });

  it('allows free entry when the kernel has no vocabulary, and says why', () => {
    render(
      <TagPicker label="Forbidden" hint="hint" selected={[]} onChange={vi.fn()} vocabulary={none} />,
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText(/no classification vocabulary/i)).toBeInTheDocument();
    expect(screen.getByText(/typo here produces a boundary that matches nothing/i)).toBeInTheDocument();
  });

  it('removes a selected tag when its chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <TagPicker
        label="Forbidden"
        hint="hint"
        selected={['secrets']}
        onChange={onChange}
        vocabulary={configured}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove secrets' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('DecisionCard — an answer has to be actionable', () => {
  const base: AccessDecision = {
    allowed: false,
    reason: 'forbidden_tag',
    detail: 'internal_only',
    decided_by: [
      {
        policy_id: 'p1',
        policy_name: 'Outsider clamp',
        linked_at: 'surface:chat:public',
        term: 'forbidden',
        values: ['internal_only'],
        enforced: true,
      },
    ],
    policy_version: 'v7',
    report_only: false,
    would_have_denied: false,
    explain: 'denied memory/doc-1 …',
  };

  it('names the responsible tag, the policy, and where it was linked', () => {
    render(<DecisionCard decision={base} />);
    expect(screen.getByText('Denied')).toBeInTheDocument();
    // Named twice on purpose: once as the responsible term, once as the value the
    // contributing policy supplied. Both matter, so assert presence, not count.
    expect(screen.getAllByText('internal_only').length).toBeGreaterThan(0);
    expect(screen.getByText('Outsider clamp')).toBeInTheDocument();
    expect(screen.getByText('surface:chat:public')).toBeInTheDocument();
    expect(screen.getByText('enforced')).toBeInTheDocument();
    // Reproducibility: the snapshot the decision was computed against.
    expect(screen.getByText('v7')).toBeInTheDocument();
  });

  it('tells the operator what to do about it', () => {
    render(<DecisionCard decision={base} />);
    expect(screen.getByText(/Remove the tag from the contributing policy/i)).toBeInTheDocument();
  });

  // A report-only decision ALLOWED the request. Rendering it as a denial would be
  // a lie; rendering it as a plain allow would hide the whole point.
  it('distinguishes a would-have-denied allow from both an allow and a denial', () => {
    render(
      <DecisionCard
        decision={{ ...base, allowed: true, report_only: true, would_have_denied: true }}
      />,
    );
    expect(screen.getByText('Would deny')).toBeInTheDocument();
    expect(screen.getByText(/The request proceeded/i)).toBeInTheDocument();
  });

  // The zombie boundary: safe, and therefore the easiest to mistake for no data.
  it('flags an impossible boundary as a thing to fix, not a shrug', () => {
    render(
      <DecisionCard
        decision={{
          ...base,
          allowed: true,
          reason: 'unsatisfiable_policy',
          detail: 'Required∩Forbidden={secrets}',
          decided_by: [],
        }}
      />,
    );
    expect(screen.getByText(/can never match anything/i)).toBeInTheDocument();
    expect(screen.getByText(/Two policies contradict each other/i)).toBeInTheDocument();
  });
});
