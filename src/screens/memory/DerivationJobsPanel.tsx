import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { DeadDerivation, DerivationJournal } from '@/ipc/types';
import { useCommandGate, formatUnixMs, ago } from '@/lib/useCommandGate';
import { errorMessage } from '@/lib/errorMessage';
import { cn } from '@/design-system/lib/utils';

/**
 * The derivation journal (contract 0113, ENG-2139).
 *
 * Every ingest records durable jobs — fact extraction, KG triplets, background
 * embedding (ENG-2122/2143) — and the kernel re-drives them after a failure or a
 * restart. A job that used up its attempts is DEAD: it is never retried on its own,
 * so an operator needs to see it, with the error, and requeue it once the cause is
 * fixed. Identifiers and counts only; no document content reaches this panel.
 */
export function DerivationJobsPanel() {
  const [journal, setJournal] = useState<DerivationJournal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const gate = useCommandGate('requeue a job');

  const load = useCallback(async () => {
    try {
      setJournal(await ipc.getDerivationJournal(100));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requeue = async (d: DeadDerivation) => {
    const key = `${d.kind}:${d.document_id}`;
    setBusy(key);
    try {
      await ipc.requeueDerivationJob(d.kind, d.document_id, d.content_digest, reason.trim());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !journal) {
    return <p role="alert" className="text-xs text-[var(--color-status-err)]">{error}</p>;
  }
  if (!journal) return <p className="text-xs text-[var(--fg-muted)]">Loading the job journal…</p>;

  const reasonMissing = reason.trim() === '';
  return (
    <div className="space-y-4 text-xs">
      <section aria-label="Job backlog">
        <h3 className="mb-1 text-[13px] font-medium">Backlog</h3>
        {journal.kinds.length === 0 ? (
          <p className="text-[var(--fg-muted)]">No jobs waiting: every ingest's derivations are done.</p>
        ) : (
          <table className="w-full">
            <thead className="text-left text-[var(--fg-muted)]">
              <tr>
                <th className="font-normal">Kind</th>
                <th className="font-normal">Pending</th>
                <th className="font-normal">Retrying</th>
                <th className="font-normal">Dead</th>
                <th className="font-normal">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {journal.kinds.map((k) => (
                <tr key={k.kind}>
                  <td className="font-mono">{k.kind}</td>
                  <td>{k.pending}</td>
                  <td>{k.retrying}</td>
                  <td className={cn(k.dead > 0 && 'font-medium text-[var(--color-status-err)]')}>{k.dead}</td>
                  <td title={formatUnixMs(k.oldest_unix_ms)}>{k.oldest_unix_ms ? ago(k.oldest_unix_ms) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[var(--fg-muted)]">
          Since start: {journal.recorded} recorded · {journal.completed} completed · {journal.failed} failed
          attempts · {journal.died} died · {journal.recovered} recovered
        </p>
      </section>

      <section aria-label="Dead jobs">
        <h3 className="mb-1 text-[13px] font-medium">Dead jobs</h3>
        {journal.dead.length === 0 ? (
          <p className="text-[var(--fg-muted)]">None.</p>
        ) : (
          <>
            <label className="mb-2 block">
              <span className="text-[var(--fg-muted)]">Reason for a requeue (recorded in the audit)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1"
                placeholder="e.g. the model provider is back"
              />
            </label>
            <ul className="space-y-2">
              {journal.dead.map((d) => {
                const key = `${d.kind}:${d.document_id}`;
                return (
                  <li key={key} className="rounded border border-[var(--border-subtle)] p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono">{d.kind}</span>
                      <span className="text-[var(--fg-muted)]">
                        {d.attempts} attempts · died {formatUnixMs(d.dead_at_unix_ms)}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[var(--fg-secondary)]" title={d.document_id}>
                      {d.document_id}
                    </div>
                    <div className="text-[var(--color-status-err)]">{d.last_error || 'no error recorded'}</div>
                    <button
                      type="button"
                      onClick={() => void requeue(d)}
                      disabled={Boolean(gate) || reasonMissing || busy === key}
                      title={gate ?? (reasonMissing ? 'Give a reason first' : undefined)}
                      className="mt-1 rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                    >
                      {busy === key ? 'Requeueing…' : 'Requeue'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {error && <p role="alert" className="mt-2 text-[var(--color-status-err)]">{error}</p>}
      </section>
    </div>
  );
}
