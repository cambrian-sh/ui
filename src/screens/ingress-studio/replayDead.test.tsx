import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudioFailure } from '@/ipc/types';
import { queryClient } from '@/lib/queryClient';

// The delivery-failure list's Replay action (owner decision 2026-11-13,
// T-20261113-dead-evidence-outbox-items-have-no-replay-path): a button on the
// existing list, on dead letters only, hidden from a read-only (Viewer) session.

const failures = vi.fn();
const replay = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioDeliveryFailures: (...args: unknown[]) => failures(...args),
    studioReplayDeadDeliveries: (...args: unknown[]) => replay(...args),
    studioPromoteRepair: vi.fn(),
    studioShadowReprocess: vi.fn(),
    studioPreview: vi.fn().mockResolvedValue([]),
    studioGetBackfill: vi.fn().mockResolvedValue({ backfill_id: '', state: '', detail: 'never backfilled' }),
    studioListGaps: vi.fn().mockResolvedValue([]),
  },
}));

import { OperationsPane } from './OperationsPane';

function failure(over: Partial<StudioFailure>): StudioFailure {
  return {
    evidence_id: 'ev-1',
    delivery_ref: 'd-1',
    mapping_revision: 0,
    outcome: 'dead_letter',
    detail: 'not transformed after 5 attempts (outbox item 7): pins no release',
    finished_at: '2026-11-13T09:00:00Z',
    ...over,
  };
}

function pane(readOnly: boolean, onChanged = () => {}) {
  return render(
    <OperationsPane ingressId="orders" state="ARMED" status={null} readOnly={readOnly} onChanged={onChanged} />,
  );
}

describe('delivery failures: replaying dead letters', () => {
  beforeEach(() => {
    queryClient.clear();
    failures.mockReset();
    replay.mockReset();
  });

  it('offers Replay on a dead letter only, and replays that one delivery', async () => {
    failures.mockResolvedValue([
      failure({ evidence_id: 'ev-dead', delivery_ref: 'dead-1' }),
      failure({ evidence_id: 'ev-ref', delivery_ref: 'ref-1', outcome: 'refused', mapping_revision: 2, detail: 'no rule' }),
    ]);
    replay.mockResolvedValue({ ok: true, error: '', detail: 'replayed 1 dead delivery', replayed: 1 });
    const onChanged = vi.fn();
    pane(false, onChanged);

    const button = await screen.findByRole('button', { name: 'Replay dead-1' });
    expect(screen.queryByRole('button', { name: 'Replay ref-1' })).not.toBeInTheDocument();
    // One dead letter: no "replay all".
    expect(screen.queryByRole('button', { name: /Replay all/ })).not.toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => expect(replay).toHaveBeenCalledWith('orders', 'ev-dead', ''));
    expect(await screen.findByText('replayed 1 dead delivery')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    // The list is re-read so a processed delivery drops off it.
    await waitFor(() => expect(failures.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('replays every dead letter of the ingress at once when there are several', async () => {
    failures.mockResolvedValue([
      failure({ evidence_id: 'ev-a', delivery_ref: 'a' }),
      failure({ evidence_id: 'ev-b', delivery_ref: 'b' }),
    ]);
    replay.mockResolvedValue({ ok: true, error: '', detail: 'replayed 2', replayed: 2 });
    pane(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay all 2 dead' }));
    await waitFor(() => expect(replay).toHaveBeenCalledWith('orders', '', ''));
  });

  it('shows the kernel refusal in its own words', async () => {
    failures.mockResolvedValue([failure({})]);
    replay.mockResolvedValue({ ok: false, error: 'replay unavailable: no audit sink', detail: '', replayed: 0 });
    pane(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Replay d-1' }));
    expect(await screen.findByText('replay unavailable: no audit sink')).toBeInTheDocument();
  });

  it('hides Replay from a read-only session', async () => {
    failures.mockResolvedValue([failure({}), failure({ evidence_id: 'ev-2', delivery_ref: 'd-2' })]);
    pane(true);
    expect(await screen.findByText('d-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replay/ })).not.toBeInTheDocument();
  });
});
