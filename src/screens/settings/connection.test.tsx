import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ConnectionSettings } from './ConnectionSettings';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    login: vi.fn().mockResolvedValue({ role: 'operator' }),
    loginSaved: vi.fn().mockResolvedValue({ role: 'operator' }),
    savedConnection: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ipc } from '@/ipc';

function makeState(overrides: Partial<StateOfRecord> = {}): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'http://localhost:50051',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0057',
    capabilities: ['feed', 'snapshot'],
    contract_skew: 0,
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
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
    ...overrides,
  };
}

function disconnectedState(): StateOfRecord {
  return makeState({
    connection: {
      status: 'down',
      endpoint: null,
      last_known_state_at: null,
      reason: null,
    },
    role: null,
    kernel_version: '',
    contract_version: '',
    capabilities: [],
  });
}

describe('ConnectionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.login).mockResolvedValue({ role: 'operator' });
    vi.mocked(ipc.loginSaved).mockResolvedValue({ role: 'operator' });
    vi.mocked(ipc.savedConnection).mockResolvedValue(null);
    vi.mocked(ipc.disconnect).mockResolvedValue(undefined);
    localStorage.clear();
    projectionStore.getState().reset();
  });

  it('shows the connect form when disconnected', () => {
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    expect(screen.getByLabelText('Endpoint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('logs in with the entered instance details', async () => {
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'http://kernel:50051' },
    });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ops' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(ipc.login).toHaveBeenCalledWith('http://kernel:50051', 'ops', 'hunter2', true);
    });
  });

  it('remembers the endpoint and username but never the password', async () => {
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'http://kernel:50051' },
    });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ops' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      const raw = localStorage.getItem('cambrian:connection:last') ?? '';
      expect(raw).toContain('http://kernel:50051');
      expect(raw).toContain('ops');
      expect(raw).not.toContain('hunter2');
    });
  });

  it('surfaces the kernel reason when login fails', async () => {
    vi.mocked(ipc.login).mockRejectedValueOnce(new Error('login: invalid credentials'));
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://k:1' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'u' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('login: invalid credentials');
  });

  it('shows the live instance and hides the connect form', () => {
    projectionStore.getState().hydrate(makeState());
    render(<ConnectionSettings />);

    expect(screen.getByText('http://localhost:50051')).toBeInTheDocument();
    expect(screen.getByText('● live')).toBeInTheDocument();
    expect(screen.getByText('0.6.9-alpha · contract 0057')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('disconnects on request', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<ConnectionSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(ipc.disconnect).toHaveBeenCalled();
    });
  });

  it('auto-connects from a saved connection on mount', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue({
      endpoint: 'http://saved:50051',
      username: 'ops',
    });
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    await waitFor(() => {
      expect(ipc.loginSaved).toHaveBeenCalled();
    });
    // The password never crosses the bridge — loginSaved takes no args.
    expect(vi.mocked(ipc.loginSaved).mock.calls[0]).toEqual([]);
  });

  it('does not auto-connect when nothing is saved', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue(null);
    projectionStore.getState().hydrate(disconnectedState());
    render(<ConnectionSettings />);

    await waitFor(() => expect(ipc.savedConnection).toHaveBeenCalled());
    expect(ipc.loginSaved).not.toHaveBeenCalled();
  });

  it('warns on contract skew', () => {
    projectionStore.getState().hydrate(makeState({ contract_skew: 1 }));
    render(<ConnectionSettings />);

    expect(screen.getByRole('alert')).toHaveTextContent('Contract skew');
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(disconnectedState());
    const { container } = render(<ConnectionSettings />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
