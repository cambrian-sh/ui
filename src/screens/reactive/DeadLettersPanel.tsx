import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { WatchDeadLetter } from '@/ipc/types';
import { useCommandGate, formatUnixMs } from '@/lib/useCommandGate';
import { errorMessage } from '@/lib/errorMessage';

/**
 * The reactive dead-letter queue (capability `watch-deadletter`; ENG-1654, owner
 * decision 2026-11-20, option C).
 *
 * A dead letter is a signal a watch never acted on. Two kinds, and the copy says
 * which is which:
 *  - a FAILED DELIVERY (shed at a full queue or an exhausted budget, or refused by
 *    the runtime): Retry replays it to its own watch under its recorded
 *    idempotency key, so something that in fact already ran is not run twice;
 *  - an EXPIRED signal (it outlived its time-to-live before it could run): delete
 *    only — replaying it would act on a world that has moved on.
 * The kernel decides which is which (`retryable`); this panel never guesses from
 * the reason text.
 */
export function DeadLettersPanel({ canDelete }: { canDelete: boolean }) {
  const [entries, setEntries] = useState<WatchDeadLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const gate = useCommandGate('act on a dead letter');

  const load = useCallback(async () => {
    try {
      setEntries(await ipc.listWatchDeadLetters(100));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, what: 'retry' | 'delete') => {
    setBusy(`${what}:${id}`);
    try {
      if (what === 'retry') await ipc.retryWatchDeadLetter(id, reason.trim());
      else await ipc.deleteWatchDeadLetter(id, reason.trim());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !entries) {
    return <p role="alert" className="text-[12px] text-[var(--status-err)]">{error}</p>;
  }
  if (!entries) return null;

  const reasonMissing = reason.trim() === '';
  const blocked = Boolean(gate) || reasonMissing;
  return (
    <section aria-label="Dead letters" className="flex flex-col gap-2 text-[12px]">
      <h2 className="type-section-title text-[var(--fg-primary)]">Dead letters</h2>
      <p className="max-w-[640px] text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
        Signals a pipeline never acted on. A failed delivery (a full queue, an exhausted
        budget, a refused run) can be retried: it is replayed to its own pipeline under its
        recorded key, so anything that in fact already ran is not run twice. An expired
        signal outlived its time-to-live and can only be deleted.
      </p>
      {entries.length === 0 ? (
        <p className="text-[var(--fg-muted)]">None.</p>
      ) : (
        <>
          <label className="block">
            <span className="text-[var(--fg-muted)]">Reason (recorded in the audit)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1"
              placeholder="e.g. the queue has drained"
            />
          </label>
          <ul className="flex flex-col gap-2">
            {entries.map((d) => (
              <li key={d.id} className="rounded border border-[var(--border-subtle)] p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono">{d.watch_id}</span>
                  <span className="text-[var(--fg-muted)]">{formatUnixMs(d.failed_at_unix_ms)}</span>
                </div>
                <div className="text-[var(--status-err)]">{d.reason || 'no reason recorded'}</div>
                <div className="truncate font-mono text-[var(--fg-secondary)]" title={d.signal_raw_text}>
                  {d.signal_stream_id} · {d.signal_raw_text}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {d.retryable ? (
                    <button
                      type="button"
                      onClick={() => void act(d.id, 'retry')}
                      disabled={blocked || busy !== null}
                      title={gate ?? (reasonMissing ? 'Give a reason first' : undefined)}
                      className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                    >
                      {busy === `retry:${d.id}` ? 'Retrying…' : 'Retry'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      Expired — delete only; it is not replayed.
                    </span>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void act(d.id, 'delete')}
                      disabled={blocked || busy !== null}
                      title={gate ?? (reasonMissing ? 'Give a reason first' : undefined)}
                      className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                    >
                      {busy === `delete:${d.id}` ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert" className="text-[var(--status-err)]">{error}</p>}
    </section>
  );
}
