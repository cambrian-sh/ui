import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectionSettings } from './ConnectionSettings';
import { projectionStore } from '@/store/projection';
import type { AuthMethods, StateOfRecord } from '@/ipc/types';
import { resetAutoConnectForTests } from '@/lib/autoConnect';

vi.mock('@/ipc', () => ({
  ipc: {
    login: vi.fn().mockResolvedValue({ role: 'operator' }),
    loginOidc: vi.fn().mockResolvedValue({ role: 'member' }),
    describeAuth: vi.fn(),
    loginSaved: vi.fn(),
    savedConnection: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue({ revoked: true, note: '' }),
  },
}));

import { ipc } from '@/ipc';

const base = (o: Partial<StateOfRecord>): StateOfRecord =>
  ({
    connection: { status: 'down', endpoint: null, last_known_state_at: null, reason: null },
    role: null,
    kernel_version: '',
    contract_version: '',
    capabilities: [],
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    scope: {},
    watch_configs: [],
    ...o,
  }) as StateOfRecord;

const methods = (o: Partial<AuthMethods>): AuthMethods => ({
  password_login: false,
  oidc_issuer: '',
  oidc_client_id: '',
  describe_supported: true,
  ...o,
});

function typeEndpoint(v = 'kernel.example.org') {
  fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: v } });
}

describe('ConnectionSettings — sign-in methods (ADR-0142 D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAutoConnectForTests();
    vi.mocked(ipc.savedConnection).mockResolvedValue(null);
    localStorage.clear();
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(base({}));
  });

  it('offers single sign-on AND password when the kernel names both', async () => {
    vi.mocked(ipc.describeAuth).mockResolvedValue(
      methods({ password_login: true, oidc_issuer: 'https://id.example.org/realms/c', oidc_client_id: 'console' }),
    );
    render(<ConnectionSettings />);
    typeEndpoint();
    expect(await screen.findByRole('button', { name: 'Sign in with id.example.org' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(ipc.describeAuth).toHaveBeenCalledWith('kernel.example.org');
  });

  it('hides the password form when the kernel takes only single sign-on, and signs in through the Rust core', async () => {
    vi.mocked(ipc.describeAuth).mockResolvedValue(methods({ oidc_issuer: 'https://id.example.org', oidc_client_id: 'console' }));
    render(<ConnectionSettings />);
    typeEndpoint();
    const button = await screen.findByRole('button', { name: 'Sign in with id.example.org' });
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(ipc.loginOidc).toHaveBeenCalledWith('kernel.example.org', true));
    // Nothing secret was handed to the webview: the call takes no token and returns a role.
    expect(vi.mocked(ipc.loginOidc).mock.calls[0]).toHaveLength(2);
  });

  it('shows only the password form for a password-only or older kernel', async () => {
    vi.mocked(ipc.describeAuth).mockResolvedValue(methods({ describe_supported: false }));
    render(<ConnectionSettings />);
    typeEndpoint();
    expect(await screen.findByText(/predates single sign-on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign in with/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('keeps the password form when the kernel cannot be asked', async () => {
    vi.mocked(ipc.describeAuth).mockRejectedValue('connect: refused');
    render(<ConnectionSettings />);
    typeEndpoint();
    expect(await screen.findByText(/Could not ask the kernel how to sign in/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('surfaces a failed single sign-on', async () => {
    vi.mocked(ipc.describeAuth).mockResolvedValue(methods({ oidc_issuer: 'https://id.example.org', oidc_client_id: 'console' }));
    vi.mocked(ipc.loginOidc).mockRejectedValueOnce('sign-in timed out: the browser never returned to the console');
    render(<ConnectionSettings />);
    typeEndpoint();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with id.example.org' }));
    expect(await screen.findByText(/sign-in timed out/)).toBeInTheDocument();
  });

  it('shows who is signed in, how, and with which role', () => {
    projectionStore.getState().hydrate(
      base({
        connection: { status: 'live', endpoint: 'k', last_known_state_at: null, reason: null },
        role: 'member',
        identity: {
          method: 'oidc',
          principal: '',
          display_name: 'Ada Lovelace',
          username: 'ada',
          email: 'ada@example.org',
          subject: 'u-1',
          issuer: 'https://id.example.org/realms/c',
          roles: [],
          role_source: 'probe',
          expires_at_unix_ms: Date.now() + 10 * 60_000,
        },
      }),
    );
    render(<ConnectionSettings />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Single sign-on · https:\/\/id.example.org\/realms\/c/)).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
    expect(screen.getByText(/Your own chat, approvals and accounts/)).toBeInTheDocument();
    expect(screen.getByText(/Inferred from what the kernel lets this sign-in do/)).toBeInTheDocument();
  });
});
