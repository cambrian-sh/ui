import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudioRepairStatus } from '@/ipc/types';
import { queryClient } from '@/lib/queryClient';

// PromoteRepair STARTS a kernel background job
// (T-20261112-promoterepair-runs-unbounded-and-synchronously): the console must
// follow the job through GetRepair rather than announce "promoted" because the
// RPC returned.

const promote = vi.fn();
const getRepair = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioDeliveryFailures: vi.fn().mockResolvedValue([]),
    studioReplayDeadDeliveries: vi.fn(),
    studioPromoteRepair: (...args: unknown[]) => promote(...args),
    studioGetRepair: (...args: unknown[]) => getRepair(...args),
    studioShadowReprocess: vi.fn().mockResolvedValue(JSON.stringify({ EvidenceExamined: 3, Changes: [{}] })),
    studioPreview: vi.fn().mockResolvedValue([]),
    studioGetBackfill: vi.fn().mockResolvedValue({ backfill_id: '', state: '', detail: 'never backfilled' }),
    studioListGaps: vi.fn().mockResolvedValue([]),
  },
}));

import { OperationsPane } from './OperationsPane';

function job(over: Partial<StudioRepairStatus>): StudioRepairStatus {
  return {
    ingress_id: 'orders', repair_id: 'rp-7', mapping_revision: 2, state: 'running',
    examined: 100, promoted: 100, skipped: 0, limit: 0, reason: 'fix', detail: '',
    started_at: '', updated_at: '', finished_at: '', ...over,
  };
}

describe('repair promotion is a followed background job', () => {
  beforeEach(() => {
    queryClient.clear();
    promote.mockReset();
    getRepair.mockReset();
  });

  it('shows the job running, then done, from GetRepair', async () => {
    promote.mockResolvedValue({ ok: true, error: '', detail: 'repair rp-7 started: promoting revision 2 in the background' });
    getRepair
      .mockResolvedValueOnce(job({ state: '', repair_id: '', examined: 0, promoted: 0 }))
      .mockResolvedValueOnce(job({}))
      .mockResolvedValue(job({ state: 'done', examined: 250, promoted: 248, skipped: 2, detail: 'revision 2 promoted' }));
    render(<OperationsPane ingressId="orders" state="ARMED" status={null} readOnly={false} onChanged={() => {}} />);

    fireEvent.change(screen.getByLabelText('Candidate mapping revision'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Shadow' }));
    await screen.findByRole('button', { name: 'Promote repair' });
    const reason = document.getElementById('promote-reason')!;
    fireEvent.change(reason, { target: { value: 'map the real event type' } });
    fireEvent.click(screen.getByRole('button', { name: 'Promote repair' }));

    await waitFor(() => expect(promote).toHaveBeenCalledWith('orders', 2, 'map the real event type'));
    expect(await screen.findByText(/repair rp-7 started/)).toBeInTheDocument();
    expect(await screen.findByText(/Repair rp-7 \(r2\): running/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Repair rp-7 \(r2\): done — 250 examined · 248 promoted · 2 skipped/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('names an interrupted job and how to continue it', async () => {
    promote.mockResolvedValue({ ok: true, error: '', detail: 'repair rp-8 started' });
    getRepair.mockResolvedValue(job({ repair_id: 'rp-8', state: 'interrupted', detail: 'interrupted: the kernel stopped' }));
    render(<OperationsPane ingressId="orders" state="ARMED" status={null} readOnly={false} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Candidate mapping revision'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Shadow' }));
    expect(await screen.findByText(/Repair rp-8 \(r2\): interrupted/)).toBeInTheDocument();
    expect(screen.getByText(/continues from where this job stopped/)).toBeInTheDocument();
  });
});
