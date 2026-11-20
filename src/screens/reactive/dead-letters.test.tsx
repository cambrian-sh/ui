import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeadLettersPanel } from '@/screens/reactive/DeadLettersPanel';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, WatchDeadLetter } from '@/ipc/types';

// ENG-1654 (contract 0116, owner decision 2026-11-20 option C): the panel offers
// Retry only on entries the kernel marks retryable (failed deliveries), says an
// expired signal is delete-only, and sends the operator's reason.

const { listWatchDeadLetters, retryWatchDeadLetter, deleteWatchDeadLetter } = vi.hoisted(() => ({
  listWatchDeadLetters: vi.fn(),
  retryWatchDeadLetter: vi.fn(),
  deleteWatchDeadLetter: vi.fn(),
}));

vi.mock('@/ipc', () => ({ ipc: { listWatchDeadLetters, retryWatchDeadLetter, deleteWatchDeadLetter } }));

const failed: WatchDeadLetter = {
  id: 'dl-q', watch_id: 'refunds', action_type: 'plan', key: '', reason: 'queue_full',
  signal_stream_id: 'ingress:acme', signal_raw_text: '{"id":"R-1"}', failed_at_unix_ms: Date.now() - 60_000, retryable: true,
};
const expired: WatchDeadLetter = {
  ...failed, id: 'dl-e', reason: 'expired_before_replay', signal_raw_text: '{"id":"R-0"}', retryable: false,
};

function state(role: 'operator' | 'viewer'): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://k', last_known_state_at: new Date().toISOString(), reason: null },
    role, kernel_version: 'x', contract_version: '0116', capabilities: ['watch-deadletter', 'watch-deadletter-delete'],
    contract_skew: 0, plugins: [], cursor: 0, plans: [], sessions: [], audit_tail: [], pending_hitl: [], agents: [],
    tools: [], scope: {}, watch_configs: [],
  } as StateOfRecord;
}

describe('DeadLettersPanel (ENG-1654)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    listWatchDeadLetters.mockResolvedValueOnce([failed, expired]).mockResolvedValue([expired]);
    retryWatchDeadLetter.mockResolvedValue({ deduped: false });
    deleteWatchDeadLetter.mockResolvedValue({ deduped: false });
  });

  it('retries a failed delivery with a reason; an expired signal is delete-only', async () => {
    projectionStore.getState().hydrate(state('operator'));
    render(<DeadLettersPanel canDelete />);
    expect(await screen.findByText('queue_full')).toBeInTheDocument();
    // One Retry (the failed delivery), the expired entry says delete-only.
    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(1);
    expect(screen.getByText(/Expired — delete only/)).toBeInTheDocument();
    expect(retries[0]).toBeDisabled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/queue has drained/), { target: { value: 'queue drained' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(retryWatchDeadLetter).toHaveBeenCalledWith('dl-q', 'queue drained'));
    await waitFor(() => expect(screen.queryByText('queue_full')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    // The expired one can still be deleted.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteWatchDeadLetter).toHaveBeenCalledWith('dl-e', 'queue drained'));
  });

  it('a viewer sees the queue but cannot act; no delete without the capability', async () => {
    projectionStore.getState().hydrate(state('viewer'));
    render(<DeadLettersPanel canDelete={false} />);
    await screen.findByText('queue_full');
    fireEvent.change(screen.getByPlaceholderText(/queue has drained/), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
