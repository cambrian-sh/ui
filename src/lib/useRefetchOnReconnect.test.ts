import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const invalidateQueries = vi.fn();
vi.mock('./queryClient', () => ({
  queryClient: { invalidateQueries: (...a: unknown[]) => invalidateQueries(...a) },
}));

import { useRefetchOnReconnect } from './useRefetchOnReconnect';

/**
 * The bug this closes: `useKernelQuery` never refetches, so a kernel restart
 * left the pipeline list showing what was true at app launch. It fires on ONE
 * edge — becoming live — because firing while live would be the poll the
 * architecture rejects.
 */
describe('useRefetchOnReconnect', () => {
  beforeEach(() => invalidateQueries.mockReset());

  it('re-reads when the kernel comes back', () => {
    const { rerender } = renderHook(({ s }) => useRefetchOnReconnect(s), {
      initialProps: { s: 'down' },
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
    rerender({ s: 'live' });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('does not re-read while it stays live — that would be a poll', () => {
    const { rerender } = renderHook(({ s }) => useRefetchOnReconnect(s), {
      initialProps: { s: 'live' },
    });
    invalidateQueries.mockReset();
    rerender({ s: 'live' });
    rerender({ s: 'live' });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('re-reads after a reconnect cycle, not on the way down', () => {
    const { rerender } = renderHook(({ s }) => useRefetchOnReconnect(s), {
      initialProps: { s: 'live' },
    });
    invalidateQueries.mockReset();
    rerender({ s: 'reconnecting' });
    expect(invalidateQueries).not.toHaveBeenCalled();
    rerender({ s: 'live' });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
