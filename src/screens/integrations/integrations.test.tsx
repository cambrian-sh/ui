import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/ipc', () => ({
  ipc: {
    listMCPServerConfigs: vi.fn().mockResolvedValue([]),
    listIntegrations: vi.fn(),
    listIntegrationCatalog: vi.fn(),
    installIntegration: vi.fn(),
  },
}));

import { ipc } from '@/ipc';
import { IntegrationsConsole } from './IntegrationsConsole';

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
  notes: '', source: 'builtin', multi_instance: false,
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
});
