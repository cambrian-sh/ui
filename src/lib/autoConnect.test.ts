import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoConnectOnce, resetAutoConnectForTests } from '@/lib/autoConnect';

vi.mock('@/ipc', () => ({
  ipc: {
    savedConnection: vi.fn(),
    loginSaved: vi.fn(),
  },
}));

const { ipc } = await import('@/ipc');

describe('autoConnectOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAutoConnectForTests();
  });

  it('reconnects to the saved instance without a password', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue({
      endpoint: 'http://saved:50051',
      username: 'ops',
    });
    vi.mocked(ipc.loginSaved).mockResolvedValue({ role: 'operator' });

    const result = await autoConnectOnce();

    expect(ipc.loginSaved).toHaveBeenCalledTimes(1);
    // The password lives in the OS keychain and must never cross the IPC bridge.
    expect(vi.mocked(ipc.loginSaved).mock.calls[0]).toEqual([]);
    expect(result).toEqual({
      saved: { endpoint: 'http://saved:50051', username: 'ops' },
      attempted: true,
      error: null,
    });
  });

  it('does nothing on a first run with an empty keychain', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue(null);

    const result = await autoConnectOnce();

    expect(ipc.loginSaved).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.error).toBeNull();
  });

  // Both the Shell (at launch) and the connection panel call this. Two concurrent logins
  // against one kernel would race for the token, so only the first call may do work.
  it('attempts at most once per launch, however many callers there are', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue({
      endpoint: 'http://saved:50051',
      username: 'ops',
    });
    vi.mocked(ipc.loginSaved).mockResolvedValue({ role: 'operator' });

    const [a, b, c] = await Promise.all([autoConnectOnce(), autoConnectOnce(), autoConnectOnce()]);

    expect(ipc.savedConnection).toHaveBeenCalledTimes(1);
    expect(ipc.loginSaved).toHaveBeenCalledTimes(1);
    // Every caller sees the same outcome.
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  // A stale or rejected credential must leave the operator on a usable connection panel with
  // the reason visible — never crash the shell at launch.
  it('reports a failed login instead of throwing', async () => {
    vi.mocked(ipc.savedConnection).mockResolvedValue({
      endpoint: 'http://saved:50051',
      username: 'ops',
    });
    vi.mocked(ipc.loginSaved).mockRejectedValue(new Error('token expired'));

    const result = await autoConnectOnce();

    expect(result.attempted).toBe(true);
    expect(result.error).toContain('token expired');
    // The endpoint is still recovered, so the panel can prefill and let them retry.
    expect(result.saved?.endpoint).toBe('http://saved:50051');
  });

  // A keychain read that fails is the same as an empty one — not a launch failure.
  it('treats an unreadable keychain as nothing saved', async () => {
    vi.mocked(ipc.savedConnection).mockRejectedValue(new Error('keychain locked'));

    const result = await autoConnectOnce();

    expect(result.attempted).toBe(false);
    expect(result.saved).toBeNull();
    expect(ipc.loginSaved).not.toHaveBeenCalled();
  });
});
