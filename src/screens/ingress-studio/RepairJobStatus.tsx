import { useKernelQuery } from '@/lib/useKernelQuery';
import { ipc } from '@/ipc';
import type { StudioRepairStatus } from '@/ipc/types';

/** How often a running repair is re-read. The job is a kernel-side background
 *  task with no feed event, so its progress is polled (the studio's idiom for
 *  request/response reads: IngressStudioConsole, OperationsPane). */
export const REPAIR_POLL_MS = 1_500;

/**
 * The progress of the ingress's latest repair promotion job.
 *
 * PromoteRepair only STARTS the job: the kernel pages the preserved deliveries
 * in the background (T-20261112-promoterepair-runs-unbounded-and-synchronously),
 * so "promoted" is something this line reports when the job says so, never
 * something the console assumes because the RPC returned.
 */
export function RepairJobStatus({ ingressId }: { ingressId: string }) {
  const q = useKernelQuery<StudioRepairStatus>(
    ['studio-repair', ingressId],
    () => ipc.studioGetRepair(ingressId),
    {
      staleTime: 0,
      // Poll only while the job runs; a finished job does not change.
      refetchInterval: (query) => (query.state.data?.state === 'running' ? REPAIR_POLL_MS : false),
    },
  );
  const s = q.data;
  if (q.error !== null && q.error !== undefined) {
    return (
      <p role="status" className="text-[12px] text-[var(--status-err)]">
        Could not read the repair job: {String(q.error.message ?? q.error)}
      </p>
    );
  }
  if (s === undefined || s.state === '') {
    return null;
  }
  const failed = s.state === 'failed' || s.state === 'interrupted';
  const counts = `${s.examined.toLocaleString()} examined · ${s.promoted.toLocaleString()} promoted${
    s.skipped > 0 ? ` · ${s.skipped.toLocaleString()} skipped (deleted at the source)` : ''
  }`;
  return (
    <div role="status" aria-live="polite" className="space-y-0.5 text-[12px]">
      <p className={failed ? 'text-[var(--status-err)]' : 'text-[var(--fg-secondary)]'}>
        Repair {s.repair_id} (r{s.mapping_revision}): {s.state} — {counts}
      </p>
      {s.state !== 'running' && s.detail !== '' && (
        <p className="text-[var(--fg-muted)]">{s.detail}</p>
      )}
      {failed && (
        <p className="text-[var(--fg-muted)]">
          Promoting the same revision again continues from where this job stopped.
        </p>
      )}
    </div>
  );
}
