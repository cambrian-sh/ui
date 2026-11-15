import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/ipc', async () => {
  const { createAccountsMock } = await import('@/ipc/accounts-mock');
  return { ipc: { ...createAccountsMock() } };
});

import { ipc } from '@/ipc';
import { createAccountsMock } from '@/ipc/accounts-mock';
import { buildInbox } from '@/lib/inbox';
import { accountInboxEntries } from '@/lib/accounts';
import { ProviderClientsSettings } from '@/screens/settings/ProviderClientsSettings';
import { AccountPicker } from '@/screens/ingress-studio/AccountPicker';
import { LifecyclePane } from '@/screens/ingress-studio/LifecyclePane';
import type { StudioStatus } from '@/ipc/types';

function seed(capabilities: string[], role: 'operator' | 'viewer' = 'operator') {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'mock://t', last_known_state_at: '', reason: null },
    role,
    capabilities,
    pending_hitl: [],
    audit_tail: [],
  } as unknown as StateOfRecord);
}

beforeEach(() => {
  projectionStore.getState().reset();
  Object.assign(ipc, createAccountsMock());
});

describe('Settings › OAuth providers', () => {
  it('shows status only and sends the secret once, clearing the field', async () => {
    const set = vi.spyOn(ipc, 'setProviderClient');
    seed(['accounts']);
    render(<ProviderClientsSettings />);
    expect(await screen.findByText('https://kernel.acme.example/oauth/callback')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Microsoft 365 OAuth client' });
    expect(form).toHaveTextContent('Not set');
    const id = screen.getByLabelText('Client id', { selector: '#oauth-microsoft-id' });
    const secret = screen.getByLabelText(/Client secret/, { selector: '#oauth-microsoft-secret' }) as HTMLInputElement;
    expect(secret.type).toBe('password');
    fireEvent.change(id, { target: { value: 'app-1234' } });
    fireEvent.change(secret, { target: { value: 's3cr3t-value' } });
    fireEvent.change(screen.getByLabelText('Reason', { selector: '#oauth-microsoft-reason' }), { target: { value: 'enable outlook sign-in' } });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith({ provider: 'microsoft', client_id: 'app-1234', client_secret: 's3cr3t-value', reason: 'enable outlook sign-in' }),
    );
    expect(secret.value).toBe('');
    // Never rendered back: only the last four of the (non-secret) client id.
    await waitFor(() => expect(form).toHaveTextContent('set ····1234'));
    expect(document.body.textContent).not.toContain('s3cr3t-value');
  });

  it('a public (PKCE) client has no secret field', async () => {
    seed(['accounts']);
    render(<ProviderClientsSettings />);
    const form = await screen.findByRole('form', { name: 'GitHub OAuth client' });
    expect(form).toHaveTextContent('not used (PKCE)');
    expect(form.querySelector('#oauth-github-secret')).toBeNull();
  });
});

describe('Ingress Studio account picker', () => {
  it('is absent without the accounts capability or for a Viewer', () => {
    seed([]);
    const { container, unmount } = render(<AccountPicker ingressId="github-prs" slot="api_key" readOnly={false} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    seed(['accounts'], 'viewer');
    const r = render(<AccountPicker ingressId="github-prs" slot="api_key" readOnly={false} />);
    expect(r.container).toBeEmptyDOMElement();
  });

  it('shows the bound account and moves the binding to another with a reason', async () => {
    const bind = vi.spyOn(ipc, 'bindOrgAccount');
    seed(['accounts']);
    render(<AccountPicker ingressId="github-prs" slot="api_key" readOnly={false} />);
    expect(await screen.findByText('acme-bot PAT')).toBeInTheDocument();
    const select = screen.getByLabelText('Outbound account');
    // Revoked accounts are not offered.
    expect(select).not.toHaveTextContent('Brave Search key');
    fireEvent.change(select, { target: { value: 'slack:org:T0ACME' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bind' }));
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: 'one bot token for all of slack' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Bind' }).slice(-1)[0]);
    await waitFor(() =>
      expect(bind).toHaveBeenCalledWith('slack:org:T0ACME', { purpose: 'ingress', consumer_id: 'github-prs', slot: 'api_key' }, 'one bot token for all of slack'),
    );
  });
});

// T-20261106-ingress-studio-cannot-tell-an-inbound-secret: an inbound signing
// secret is never an account (ADR-0141 D4), so only the outbound slot gets the picker.
describe('Ingress Studio credential list', () => {
  it('offers an account only on the outbound credential', async () => {
    seed(['accounts', 'ingress-studio']);
    const status = (await ipc.studioGetIngress('github-prs')) as StudioStatus;
    render(<LifecyclePane ingressId="github-prs" state="ARMED" status={status} readOnly={false} onChanged={() => {}} />);
    expect(await screen.findByText('signing_secret')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByLabelText('Outbound account')).toHaveLength(1));
    expect(screen.getByLabelText('Outbound account').id).toBe('acct-github-prs-api_key');
  });
});

describe('Inbox account items', () => {
  it('adds confirm and reconnect items for MY accounts to the one queue', async () => {
    const mine = await createAccountsMock().listMyAccounts();
    const items = buildInbox({ hitl: [], accounts: accountInboxEntries(mine) });
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['account_reconnect', 'Connect your Slack account to continue'],
      ['account_confirm', 'Confirm alice@acme.example for Gmail'],
    ]);
    expect(items.every((i) => i.account?.row)).toBe(true);
  });
});
