import { useState } from 'react';
import { Button, Input, ReasonField, useReasonGate } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { queryClient } from '@/lib/queryClient';
import { ipc } from '@/ipc';
import type { StudioAck, StudioBackfillStatus, StudioStatus } from '@/ipc/types';
import { parseRevision } from './LifecyclePane';

/** How often a running fill is re-read: the fill is a kernel background job
 *  with no feed event, so its progress is polled (the studio's idiom). */
export const BACKFILL_POLL_MS = 2_000;

/**
 * The history lane (ADR-0119): pin the transport revision fills read, start a
 * fill, watch it, cancel it — and, for a sequenced websocket, the gaps the
 * source's own counter says this deployment never made durable. Until now
 * these were reachable only from `cambrian-backfill`
 * (T-20261113-ingress-studio-console-has-no-history-lane).
 *
 * Every refusal is the kernel's: a fill needs an ARMED ingress whose pinned
 * mapping maps event time and a fillable history transport. This pane renders
 * the named refusal instead of re-implementing those checks.
 */
export function HistorySection({
  ingressId,
  status,
  readOnly,
  onChanged,
}: {
  ingressId: string;
  status: StudioStatus | null;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const fill = useKernelQuery<StudioBackfillStatus>(
    ['studio-backfill', ingressId],
    () => ipc.studioGetBackfill(ingressId),
    {
      staleTime: 0,
      refetchInterval: (q) => (q.state.data?.state === 'running' ? BACKFILL_POLL_MS : false),
    },
  );
  const gaps = useKernelQuery(['studio-gaps', ingressId], () => ipc.studioListGaps(ingressId), { staleTime: 0 });

  const laneGate = useReasonGate();
  const startGate = useReasonGate();
  const cancelGate = useReasonGate();
  const [laneRev, setLaneRev] = useState('');
  const [from, setFrom] = useState('');
  const [ack, setAck] = useState<StudioAck | null>(null);
  const setLane = useMutation(ipc.studioSetHistoryLane);
  const start = useMutation(ipc.studioStartBackfill);
  const cancel = useMutation(ipc.studioCancelBackfill);

  const after = (res: StudioAck | undefined, gate: { reset: () => void }) => {
    if (res === undefined) return;
    setAck(res);
    if (res.ok) {
      gate.reset();
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['studio-backfill', ingressId] });
    }
  };

  const armedLane = status?.armed_history_transport_revision ?? 0;
  const latestLane = status?.latest_history_transport_revision ?? 0;
  const f = fill.data;
  const running = f?.state === 'running';
  const mutationError = setLane.error ?? start.error ?? cancel.error;

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">History (backfill)</h3>
      <p className="text-[12px] text-[var(--fg-muted)]">
        The live lane carries what arrives from now on; a fill loads what the source already holds,
        through the same mapping release and classification. A fill is an action with a reason, never a
        side effect of editing a transport.
      </p>

      <p className="text-[12px] text-[var(--fg-secondary)]" data-testid="history-lane">
        {armedLane > 0
          ? `History lane: transport r${armedLane} pinned`
          : 'History lane: none pinned — fills read the live transport if it is fillable'}
        {latestLane > 0 && latestLane !== armedLane ? ` (latest saved history revision r${latestLane})` : ''}
      </p>

      <FillLine fill={f} />
      {fill.error !== null && fill.error !== undefined && (
        <p className="text-[12px] text-[var(--status-err)]">Could not read the fill: {fill.error.message}</p>
      )}

      {(gaps.data ?? []).length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[12px] font-medium text-[var(--status-warn)]">
            Sequence gaps (messages the source numbered and this deployment never stored)
          </p>
          {(gaps.data ?? []).map((g, i) => (
            <p key={i} className="text-[12px] text-[var(--fg-secondary)]">
              r{g.transport_revision}: {g.from_seq}–{g.to_seq} · detected {g.detected_at}
            </p>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
          {running ? (
            <div className="space-y-2">
              <ReasonField gate={cancelGate} id="cancel-fill-reason" note="Abandoning a half-loaded history is recorded with your reason." />
              <Button
                size="sm"
                variant="secondary"
                disabled={!cancelGate.satisfied || cancel.isLoading}
                onClick={() => void cancel.mutate(ingressId, cancelGate.reason).then((r) => after(r, cancelGate))}
              >
                Cancel fill
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="from (the source's own cursor; empty = earliest, or continue a stopped fill)"
                aria-label="Fill from cursor"
              />
              <ReasonField gate={startGate} id="start-fill-reason" note="A fill can be long and costly; the reason is recorded." />
              <Button
                size="sm"
                disabled={!startGate.satisfied || start.isLoading}
                onClick={() => void start.mutate(ingressId, from.trim(), startGate.reason).then((r) => after(r, startGate))}
              >
                Start fill
              </Button>
            </div>
          )}

          <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center gap-2">
              <Input
                value={laneRev}
                onChange={(e) => setLaneRev(e.target.value)}
                placeholder={`history transport rev (0 clears${latestLane > 0 ? `, latest ${latestLane}` : ''})`}
                aria-label="History transport revision"
              />
            </div>
            <ReasonField gate={laneGate} id="history-lane-reason" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!laneGate.satisfied || setLane.isLoading || (laneRev.trim() !== '0' && parseRevision(laneRev) === null)}
              onClick={() =>
                void setLane
                  .mutate(ingressId, laneRev.trim() === '0' ? 0 : (parseRevision(laneRev) ?? 0), laneGate.reason)
                  .then((r) => after(r, laneGate))
              }
            >
              Pin history lane
            </Button>
          </div>

          {mutationError !== null && <p className="text-[12px] text-[var(--status-err)]">{mutationError}</p>}
          {ack !== null && (
            <p role="status" className={ack.ok ? 'text-[12px] text-[var(--fg-secondary)]' : 'text-[12px] text-[var(--status-err)]'}>
              {ack.ok ? ack.detail : ack.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** One line for the latest fill: state, how far, and — when the source publishes
 *  one — of how many. A zero total is UNKNOWN, rendered as such. */
function FillLine({ fill }: { fill: StudioBackfillStatus | undefined }) {
  if (fill === undefined) return null;
  if (fill.backfill_id === '') {
    return <p className="text-[12px] text-[var(--fg-muted)]">{fill.detail || 'Never filled.'}</p>;
  }
  const of = fill.source_total > 0 ? ` of ${fill.source_total.toLocaleString()}` : ' (source publishes no total)';
  const bad = fill.state === 'failed' || fill.state === 'interrupted' || fill.state === 'cancelled';
  return (
    <div role="status" aria-live="polite" className="space-y-0.5 text-[12px]">
      <p className={bad ? 'text-[var(--status-warn)]' : 'text-[var(--fg-secondary)]'}>
        Fill {fill.backfill_id} (transport r{fill.transport_revision}): {fill.state} —{' '}
        {fill.records_done.toLocaleString()} records{of} · {fill.pages_done.toLocaleString()} pages
        {fill.cursor !== '' ? ` · cursor ${fill.cursor}` : ''}
      </p>
      {fill.caught_up_at !== '' && <p className="text-[var(--fg-muted)]">Caught up at {fill.caught_up_at}.</p>}
      {fill.detail !== '' && <p className="text-[var(--fg-muted)]">{fill.detail}</p>}
      {bad && (
        <p className="text-[var(--fg-muted)]">Starting again with an empty “from” continues from this fill’s cursor.</p>
      )}
    </div>
  );
}
