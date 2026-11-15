import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { projectionStore } from '@/store/projection';
import type { Integration, StateOfRecord } from '@/ipc/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/ipc', () => ({
  ipc: {
    listMCPServerConfigs: vi.fn().mockResolvedValue([]),
    listIntegrations: vi.fn(),
    listIntegrationCatalog: vi.fn(),
    installIntegration: vi.fn(),
    setIntegrationTrustTier: vi.fn(),
  },
}));

import { ipc } from '@/ipc';
import { InstalledCard, IntegrationsConsole } from './IntegrationsConsole';

function seed(capabilities: string[], health: Record<string, unknown> = {}) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role: 'operator',
    capabilities,
    pending_hitl: [],
    audit_tail: [],
    integration_health: health,
  } as unknown as StateOfRecord);
}

const entry = {
  id: 'brave', name: 'Brave Search', description: 'Search the web', category: 'web-search', publisher: 'Brave',
  license: 'MIT', trust_tier: 'official', docs_url: '', version: '1', transport: 'stdio', command: 'npx', args: [], url: '',
  runtimes: [], platforms: [], platform_supported: true,
  fields: [{ name: 'BRAVE_API_KEY', label: 'API key', secret: true, required: true, help: '', kind: 'env', default_value: '', placeholder: '' }],
  tool_policies: [], has_default_policy: true, default_policy: null, policy_summary: 'read + egress', probe_tool: '',
  notes: '', source: 'builtin', multi_instance: false, credential_scope: 'shared', provider: '', scopes: [] as string[],
};

describe('IntegrationsConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    vi.mocked(ipc.listIntegrations).mockResolvedValue({ integrations: [], configured: true });
    vi.mocked(ipc.listIntegrationCatalog).mockResolvedValue({ entries: [entry], categories: ['web-search'] });
  });

  it('without the capability, says so and shows the configured servers instead', async () => {
    seed([]);
    render(<IntegrationsConsole />);
    expect(screen.getByText(/does not serve the integration catalog/)).toBeInTheDocument();
    expect(ipc.listIntegrationCatalog).not.toHaveBeenCalled();
  });

  it('connects a catalog entry, sending the secret write-only and the reason', async () => {
    seed(['integrations']);
    vi.mocked(ipc.installIntegration).mockResolvedValue({
      deduped: false,
      outcome: { key: 'brave', stored: true, effect: 'live', shadowed_by: '', error: '' },
      integration: null,
    });
    render(<IntegrationsConsole />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    const connect = screen.getAllByRole('button', { name: 'Connect' }).slice(-1)[0];
    expect(connect).toBeDisabled(); // required key missing, no reason
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-123' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'search for the research team' } });
    fireEvent.click(connect);
    await waitFor(() =>
      expect(ipc.installIntegration).toHaveBeenCalledWith({
        catalog_id: 'brave', id: 'brave', settings: {}, secrets: { BRAVE_API_KEY: 'sk-123' }, enabled: true,
        reason: 'search for the research team',
      }),
    );
    expect(await screen.findByText('Applied now.')).toBeInTheDocument();
  });

  // T-20261106-integrationop-has-no-structured-containment: a stdio server's
  // structured containment is shown once, on its own line (stripped from the
  // "Can:" text the kernel still appends it to), and a degraded launch says
  // which control is not enforced.
  it("renders a stdio server's structured containment once", async () => {
    seed(['integrations']);
    const summary = 'containment third-party/native: job_object+low_integrity [env workdir]; degraded, missing: network: no egress control';
    const integration: Integration = {
      id: 'brave', catalog_id: 'brave', name: 'Brave Search', category: 'web-search', source: 'store', overrides_file: false,
      editable: true, enabled: true, transport: 'stdio', command: 'npx', args: [], url: '', settings: {}, secrets: [],
      health: null, installed_version: '1', update_available: false, missing_required: [], tool_policies: [],
      has_default_policy: true, default_policy: null, policy_summary: 'read + egress; ' + summary,
      classification_tags: [], trust_tier: 'third-party', passthrough_env: [],
      containment: {
        tier: 'third-party', tier_source: 'catalog', runner: 'native', mechanisms: ['job_object', 'low_integrity'],
        enforced: ['env', 'workdir'], missing: ['network: no egress control'], notes: [], refused: false, disabled: false, summary,
      },
    };
    render(<InstalledCard integration={integration} health={null} onResult={() => {}} />);
    expect(await screen.findByText('Can: read + egress')).toBeInTheDocument();
    const line = await screen.findByTestId('integration-containment');
    expect(line).toHaveTextContent('Sandbox: third-party on native via job_object + low_integrity — enforces env, workdir');
    expect(line).toHaveTextContent('Not enforced here: network: no egress control');
    expect(screen.queryByText(new RegExp('containment third-party/native'))).not.toBeInTheDocument();
  });

  // T-20261106-testintegration-and-the-catalog-op-do-not: before install the
  // catalog says a per-user entry is signed in by each person.
  it('says a per-user catalog entry is connected by each person', async () => {
    seed(['integrations']);
    vi.mocked(ipc.listIntegrationCatalog).mockResolvedValue({
      entries: [{ ...entry, id: 'gh', name: 'GitHub', credential_scope: 'per_user', provider: 'github' }],
      categories: ['web-search'],
    });
    render(<IntegrationsConsole />);
    expect(await screen.findByText('Each person connects their own github account.')).toBeInTheDocument();
  });

  // Owner decision 2026-11-15 (T-20261115-console-custom-mcp-server-install-cannot-set):
  // an operator may set any sandbox tier, lowering included, after a reasoned
  // confirm; the kernel audits who, old tier, new tier and the reason.
  it("sets a stdio server's sandbox tier through a reasoned confirm", async () => {
    seed(['integrations']);
    vi.mocked(ipc.setIntegrationTrustTier).mockResolvedValue({
      deduped: false, outcome: { key: 'brave', stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: null,
    });
    const integration: Integration = {
      id: 'brave', catalog_id: '', name: 'Local tool', category: '', source: 'store', overrides_file: false,
      editable: true, enabled: true, transport: 'stdio', command: 'node', args: [], url: '', settings: {}, secrets: [],
      health: null, installed_version: '', update_available: false, missing_required: [], tool_policies: [],
      has_default_policy: true, default_policy: null, policy_summary: 'read', classification_tags: [], trust_tier: '',
      passthrough_env: [],
      containment: {
        tier: 'third-party', tier_source: 'default', runner: 'native', mechanisms: [], enforced: ['env'], missing: [],
        notes: [], refused: false, disabled: false, summary: 'containment third-party/native',
      },
    };
    render(<InstalledCard integration={integration} health={null} onResult={() => {}} />);
    fireEvent.change(screen.getByLabelText('Sandbox tier'), { target: { value: 'first-party' } });
    expect(await screen.findByText(/A lower tier gives the process more access/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'our own server, audited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set tier' }));
    await waitFor(() =>
      expect(ipc.setIntegrationTrustTier).toHaveBeenCalledWith({ id: 'brave', trust_tier: 'first-party', reason: 'our own server, audited' }),
    );
  });
});
