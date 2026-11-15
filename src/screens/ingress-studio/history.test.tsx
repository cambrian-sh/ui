import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudioBackfillStatus, StudioStatus } from '@/ipc/types';
import { queryClient } from '@/lib/queryClient';

// The history lane in the console (T-20261113-ingress-studio-console-has-no-history-lane):
// pin the lane, start a fill with a reason, watch it, cancel it, see websocket gaps —
// all through the same IngressStudioAdmin RPCs cambrian-backfill uses.

const getBackfill = vi.fn();
const startBackfill = vi.fn();
const cancelBackfill = vi.fn();
const setLane = vi.fn();
const gaps = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioDeliveryFailures: vi.fn().mockResolvedValue([]),
    studioReplayDeadDeliveries: vi.fn(),
    studioPromoteRepair: vi.fn(),
    studioGetRepair: vi.fn(),
    studioShadowReprocess: vi.fn(),
    studioPreview: vi.fn().mockResolvedValue([]),
    studioGetBackfill: (...a: unknown[]) => getBackfill(...a),
    studioStartBackfill: (...a: unknown[]) => startBackfill(...a),
    studioCancelBackfill: (...a: unknown[]) => cancelBackfill(...a),
    studioSetHistoryLane: (...a: unknown[]) => setLane(...a),
    studioListGaps: (...a: unknown[]) => gaps(...a),
  },
}));

import { OperationsPane } from './OperationsPane';

function fill(over: Partial<StudioBackfillStatus>): StudioBackfillStatus {
  return {
    ingress_id: 'orders', backfill_id: 'bf_orders_1', state: 'running', mode: 'once', from: '', cursor: 'p3',
    records_done: 300, pages_done: 3, source_total: 0, transport_revision: 2, started_at: '', updated_at: '',
    caught_up_at: '', detail: '', reason: 'load history', ...over,
  };
}

const status = { armed_history_transport_revision: 2, latest_history_transport_revision: 3 } as StudioStatus;
const REASON = 'load two years of orders for the pilot';

function pane(readOnly = false) {
  return render(<OperationsPane ingressId="orders" state="ARMED" status={status} readOnly={readOnly} onChanged={() => {}} />);
}

describe('history lane in the studio', () => {
  beforeEach(() => {
    queryClient.clear();
    for (const m of [getBackfill, startBackfill, cancelBackfill, setLane, gaps]) m.mockReset();
    gaps.mockResolvedValue([]);
  });

  it('starts a fill with a reason and follows it to caught up', async () => {
    getBackfill
      .mockResolvedValueOnce(fill({ backfill_id: '', state: '', detail: 'this ingress has never been backfilled' }))
      .mockResolvedValueOnce(fill({}))
      .mockResolvedValue(fill({ state: 'caught_up', records_done: 1200, pages_done: 12, source_total: 1200, caught_up_at: '2026-11-15T10:00:00Z' }));
    startBackfill.mockResolvedValue({ ok: true, error: '', detail: 'fill bf_orders_1 started' });
    pane();
    expect(await screen.findByText('this ingress has never been backfilled')).toBeInTheDocument();
    expect(screen.getByTestId('history-lane')).toHaveTextContent('transport r2 pinned (latest saved history revision r3)');

    fireEvent.change(screen.getByLabelText('Fill from cursor'), { target: { value: ' p1 ' } });
    fireEvent.change(document.getElementById('start-fill-reason')!, { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Start fill' }));
    await waitFor(() => expect(startBackfill).toHaveBeenCalledWith('orders', 'p1', REASON));
    expect(await screen.findByText('fill bf_orders_1 started')).toBeInTheDocument();
    expect(await screen.findByText(/running — 300 records \(source publishes no total\)/)).toBeInTheDocument();
    expect(
      await screen.findByText(/caught_up — 1.?200 records of 1.?200/, undefined, { timeout: 8000 }),
    ).toBeInTheDocument();
  }, 15_000);

  it('offers cancel, not start, while a fill runs, and shows the kernel refusal verbatim', async () => {
    getBackfill.mockResolvedValue(fill({}));
    cancelBackfill.mockResolvedValue({ ok: false, error: 'backfill bf_orders_1 is already caught_up', detail: '' });
    pane();
    expect(await screen.findByRole('button', { name: 'Cancel fill' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start fill' })).not.toBeInTheDocument();
    fireEvent.change(document.getElementById('cancel-fill-reason')!, { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel fill' }));
    await waitFor(() => expect(cancelBackfill).toHaveBeenCalledWith('orders', REASON));
    expect(await screen.findByText('backfill bf_orders_1 is already caught_up')).toBeInTheDocument();
  });

  it('pins and clears the history lane', async () => {
    getBackfill.mockResolvedValue(fill({ backfill_id: '', state: '' }));
    setLane.mockResolvedValue({ ok: true, error: '', detail: 'history lane pinned' });
    pane();
    fireEvent.change(await screen.findByLabelText('History transport revision'), { target: { value: '0' } });
    fireEvent.change(document.getElementById('history-lane-reason')!, { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Pin history lane' }));
    await waitFor(() => expect(setLane).toHaveBeenCalledWith('orders', 0, REASON));
  });

  it('lists websocket sequence gaps and hides every control from a viewer', async () => {
    getBackfill.mockResolvedValue(fill({ state: 'interrupted', detail: 'interrupted: the kernel stopped' }));
    gaps.mockResolvedValue([{ transport_revision: 1, from_seq: 41, to_seq: 57, detected_at: '2026-11-15T09:00:00Z' }]);
    pane(true);
    expect(await screen.findByText(/r1: 41–57/)).toBeInTheDocument();
    expect(screen.getByText(/continues from this fill’s cursor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start fill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin history lane' })).not.toBeInTheDocument();
  });
});
