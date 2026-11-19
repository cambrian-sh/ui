// The dead evidence-outbox items behind the holdings header's "N dead" badge
// (owner decision 2026-11-19, T-20261113-dead-outbox-items-of-non-ingress-sources-have,
// ENG-1100). Every source's items are named here; a non-ingress source's are
// replayed here (SubstrateLane.ReplayDeadOutbox: pending again, the ordinary
// consumer runs them — Operator-only, audited by the kernel). An Ingress Studio
// source's items are replayed from that ingress's delivery failures, which also
// redrive its failed pipeline tasks — one replay path per source.

import { useState } from 'react';
import { Button } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { ipc } from '@/ipc';
import type { DeadOutboxItem, DeadOutboxReplayAck } from '@/ipc/types';

export function DeadOutboxPanel({ onReplayed }: { onReplayed?: () => void }) {
  const dead = useKernelQuery(['knowledge', 'dead-outbox'], () => ipc.knowledgeDeadOutbox('', 0), {
    staleTime: 0,
  });
  const replay = useMutation(ipc.knowledgeReplayDeadOutbox);
  const [ack, setAck] = useState<DeadOutboxReplayAck | null>(null);
  const items = dead.data ?? [];
  const bySource = new Map<string, DeadOutboxItem[]>();
  for (const it of items) bySource.set(it.source_id, [...(bySource.get(it.source_id) ?? []), it]);

  const run = (sourceId: string, evidenceId: string) => {
    setAck(null);
    void replay.mutate(sourceId, evidenceId, 'replayed from the Knowledge console').then((res) => {
      if (res !== undefined) {
        setAck(res);
        if (res.ok) {
          void dead.refetch();
          onReplayed?.();
        }
      }
    });
  };

  return (
    <section
      aria-label="Dead outbox items"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
    >
      {dead.isError ? (
        <p className="text-[12px] text-[var(--status-err)]">
          Dead items could not be listed: {dead.error?.message ?? 'the substrate lane did not answer'}.
        </p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-secondary)]">{dead.isLoading ? 'Loading…' : 'No dead items.'}</p>
      ) : (
        [...bySource.entries()].map(([source, rows]) => (
          <div key={source} className="space-y-1">
            <p className="text-[12px] text-[var(--fg-primary)]">
              <span className="font-mono">{source}</span>
              <span className="ml-1 tabular-nums text-[var(--fg-muted)]">×{rows.length}</span>
              {rows[0].replay_here ? (
                rows.length > 1 && (
                  <Button
                    size="sm"
                    className="ml-2"
                    disabled={replay.isLoading}
                    onClick={() => run(source, '')}
                    aria-label={`Replay all ${rows.length} dead items of ${source}`}
                  >
                    Replay all {rows.length}
                  </Button>
                )
              ) : (
                <span className="ml-2 text-[11.5px] text-[var(--fg-muted)]">
                  an Ingress Studio ingress — replay it from the ingress's delivery failures
                </span>
              )}
            </p>
            {rows.map((d) => (
              <div key={d.outbox_id} className="flex flex-wrap items-baseline gap-x-2 pl-3 text-[12px]">
                <span className="font-mono text-[var(--fg-secondary)]">{d.evidence_id}</span>
                <span className="text-[var(--fg-muted)]">
                  {d.attempts} attempts · dead {d.dead_at}
                </span>
                <span className="text-[var(--fg-secondary)]">{d.last_error}</span>
                {d.replay_here && (
                  <Button
                    size="sm"
                    disabled={replay.isLoading}
                    onClick={() => run(source, d.evidence_id)}
                    aria-label={`Replay ${d.evidence_id}`}
                  >
                    Replay
                  </Button>
                )}
              </div>
            ))}
          </div>
        ))
      )}
      {replay.error !== null && <p className="text-[12px] text-[var(--status-err)]">{replay.error}</p>}
      {ack !== null && (
        <p
          role="status"
          className={ack.ok ? 'text-[12px] text-[var(--fg-secondary)]' : 'text-[12px] text-[var(--status-err)]'}
        >
          {ack.ok ? ack.detail : ack.error}
        </p>
      )}
      <p className="text-[11px] text-[var(--fg-muted)]">
        A dead item failed on every attempt and is not retried by itself. Fix the cause first: Replay
        runs the same work again through the ordinary consumer, and it is dead again if the cause is
        still there.
      </p>
    </section>
  );
}
