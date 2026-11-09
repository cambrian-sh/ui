import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { projectionStore } from '@/store/projection';
import type { Integration, StateOfRecord } from '@/ipc/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/ipc', async () => {
  const { createAccountsMock } = await import('@/ipc/accounts-mock');
  return {
    ipc: {
      ...createAccountsMock(),
      listIntegrations: vi.fn(),
      listIntegrationCatalog: vi.fn().mockResolvedValue({ entries: [], categories: [] }),
      testIntegration: vi.fn(),
    },
  };
});

import { ipc } from '@/ipc';
import { createAccountsMock } from '@/ipc/accounts-mock';
import { SystemPage } from './SystemPage';

const ALL = ['integrations', 'ingress-studio', 'accounts'];

function seed(capabilities: string[], role: 'operator' | 'viewer' = 'operator', health: Record<string, unknown> = {}) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role,
    capabilities,
    pending_hitl: [],
    audit_tail: [],
    integration_health: health,
  } as unknown as StateOfRecord);
}

const server = (id: string, o: Partial<Integration> = {}): Integration =>
  ({ id, catalog_id: id, name: id, category: '', source: 'store', overrides_file: false, editable: true, enabled: true, transport: 'stdio',
    command: 'npx', args: [], url: '', settings: {}, secrets: [],
    health: { server_id: id, state: 'ready', last_handshake_unix_ms: 0, tool_count: 2, last_error: '', restart_count: 0, changed_at_unix_ms: 1 },
    installed_version: '', update_available: false, missing_required: [], tool_policies: [], has_default_policy: true, default_policy: null,
    policy_summary: '', classification_tags: [], trust_tier: 'official', passthrough_env: [], ...o }) as Integration;

describe('SystemPage', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    // A fresh accounts plane per test: one test's confirm/disconnect must not leak.
    Object.assign(ipc, createAccountsMock());
    vi.mocked(ipc.listIntegrations).mockResolvedValue({ configured: true, integrations: [server('gmail'), server('google-calendar'), server('slack'), server('brave')] });
  });

  it('gates each section on its capability and never calls an ungated RPC', async () => {
    const mine = vi.spyOn(ipc, 'listMyAccounts');
    const org = vi.spyOn(ipc, 'listOrgAccounts');
    const ingresses = vi.spyOn(ipc, 'studioListIngresses');
    seed(['integrations']);
    render(<SystemPage systemId="brave" />);
    expect(await screen.findByText(/does not serve accounts/)).toBeInTheDocument();
    expect(screen.getByText(/has no Ingress Studio/)).toBeInTheDocument();
    expect(mine).not.toHaveBeenCalled();
    expect(org).not.toHaveBeenCalled();
    expect(ingresses).not.toHaveBeenCalled();
  });

  it('renders the live health pushed on the feed over the listed one (agent actions)', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue({
      configured: true,
      integrations: [server('brave', { health: { server_id: 'brave', state: 'starting', last_handshake_unix_ms: 0, tool_count: 0, last_error: '', restart_count: 0, changed_at_unix_ms: 1 } })],
    });
    seed(['integrations'], 'operator', {
      brave: { server_id: 'brave', state: 'ready', last_handshake_unix_ms: 0, tool_count: 3, last_error: '', restart_count: 0, changed_at_unix_ms: 2 },
    });
    render(<SystemPage systemId="brave" />);
    expect(await screen.findByText('Connected', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/3 tools/)).toBeInTheDocument();
  });

  it('aggregates a system: org account + bindings, my account, data in, servers', async () => {
    seed(ALL);
    render(<SystemPage systemId="slack" />);
    const org = await screen.findByRole('region', { name: 'Organization accounts' });
    expect(within(org).getByText('Acme workspace bot')).toBeInTheDocument();
    expect(within(org).getByText(/data in · slack-eng · bot_token/)).toBeInTheDocument();
    expect(within(org).getByText(/migrated from mcp:slack:token/)).toBeInTheDocument();
    const mineRegion = screen.getByRole('region', { name: 'My accounts' });
    expect(within(mineRegion).getByText('Reconnect needed')).toBeInTheDocument();
    expect(within(mineRegion).getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(await screen.findByText('Slack #eng history')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Slack #eng history running' })).toBeChecked();
    // The slack server takes its token from the org account: its secret fields are retired.
    expect(screen.queryByRole('button', { name: 'Credentials' })).toBeNull();
  });

  it('binds an org account to a server slot with a reason', async () => {
    const bind = vi.spyOn(ipc, 'bindOrgAccount');
    vi.mocked(ipc.listIntegrations).mockResolvedValue({
      configured: true,
      integrations: [server('slack', { secrets: [{ name: 'SLACK_TEAM_ID', label: '', set: false, source: '', updated_at_unix_ms: 0, required: false, kind: 'env' }] })],
    });
    seed(ALL);
    render(<SystemPage systemId="slack" />);
    fireEvent.change(await screen.findByLabelText('Bind Acme workspace bot to'), { target: { value: 'slack\u0000env:SLACK_TEAM_ID' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bind' }));
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: 'one workspace credential' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Bind' }).slice(-1)[0]);
    await waitFor(() =>
      expect(bind).toHaveBeenCalledWith('slack:org:T0ACME', { purpose: 'mcp', consumer_id: 'slack', slot: 'env:SLACK_TEAM_ID' }, 'one workspace credential'),
    );
  });

  it('a revoked org account says what fails closed and offers a replacement key', async () => {
    seed(ALL);
    render(<SystemPage systemId="brave-search" />);
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
    expect(screen.getByText(/fails closed until the key is replaced/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('confirms a pending sign-in only after showing its identity (phishing defence)', async () => {
    const confirm = vi.spyOn(ipc, 'confirmMyAccount');
    seed(ALL);
    render(<SystemPage systemId="google" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('alice@acme.example')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, this is me' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('gmail', 'alice@acme.example'));
  });

  it('connects my account through the system browser and follows the flow to the end', async () => {
    const start = vi.spyOn(ipc, 'startAccountConnect');
    const poll = vi.spyOn(ipc, 'getAccountConnectFlow');
    seed(ALL);
    render(<SystemPage systemId="google" />);
    const buttons = await screen.findAllByRole('button', { name: 'Connect my account' });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(start).toHaveBeenCalledWith('google-calendar'));
    expect(await screen.findByText(/Finish signing in in your browser/)).toBeInTheDocument();
    await waitFor(() => expect(poll).toHaveBeenCalled(), { timeout: 5000 });
    expect(await screen.findByText(/Connected as alice@acme.example/, {}, { timeout: 6000 })).toBeInTheDocument();
  }, 15000);

  it('a Viewer can manage their own account but sees no org or people controls', async () => {
    seed(ALL, 'viewer');
    render(<SystemPage systemId="slack" />);
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Add an org account' })).toBeNull();
    expect(screen.getByText('Organization accounts are managed by operators.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: "People's accounts" })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('retires the per-server credential fields for an account-backed server', async () => {
    seed(ALL);
    render(<SystemPage systemId="google" />);
    await screen.findAllByText(/Credentials come from accounts/);
    expect(screen.queryByRole('button', { name: 'Credentials' })).toBeNull();
  });

  it('an operator revokes another person’s account with a reason', async () => {
    const revoke = vi.spyOn(ipc, 'revokeAccount');
    seed(ALL);
    render(<SystemPage systemId="google" />);
    fireEvent.click(await screen.findByRole('button', { name: "Revoke bob's gmail account" }));
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: 'left the company' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' }).slice(-1)[0]);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('gmail', 'bob', 'left the company'));
  });
});
