import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { PythonGcReport, PythonPackageListing } from '@/ipc/types';
import { useCommandGate, formatUnixMs } from '@/lib/useCommandGate';
import { errorMessage } from '@/lib/errorMessage';

/** The capability that gates this panel (contract 0119, ENG-2012). */
export const PYTHON_PACKAGES_CAPABILITY = 'python-packages';

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/**
 * An agent's sandbox Python packages (ADR-0157 D7.10/D7.12, capability
 * `python-packages`).
 *
 * Every package beyond the shared base env is an Operator-approved, hash-pinned
 * record with an audit trail: who asked (the profile's declaration or the agent at
 * run time), who decided, each install and removal with the layer generation it
 * produced. An Operator may:
 *  - remove a package the agent asked for at run time (the agent gets a new layer
 *    generation without it; its running process keeps the old one and is replaced
 *    when idle). A declared package is removed from the profile instead;
 *  - retry the agent's package check (an install that failed after approval, or a
 *    profile edit to apply now);
 *  - clean up the env: delete generations nothing uses any more.
 */
export function PythonPackagesPanel({ agentId }: { agentId: string }) {
  const [listing, setListing] = useState<PythonPackageListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [lastPrune, setLastPrune] = useState<PythonGcReport | null>(null);
  const gate = useCommandGate('change sandbox Python packages');

  const load = useCallback(async () => {
    try {
      setListing(await ipc.listPythonPackages(agentId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setNotice(null);
    try {
      setNotice(await fn());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const why = reason.trim();
  const blocked = Boolean(gate) || why === '' || busy !== null;
  const title = gate ?? (why === '' ? 'Give a reason first' : undefined);

  if (error && !listing) {
    return <p role="alert" className="text-[12px] text-[var(--status-err)]">{error}</p>;
  }
  if (!listing) {
    return <p className="text-[12px] text-[var(--fg-muted)]">Loading packages…</p>;
  }
  const layer = listing.layers.find((l) => l.current);
  return (
    <section aria-label="Python packages" className="flex flex-col gap-3 text-[12px]">
      <div className="text-[var(--fg-muted)]">
        Layer:{' '}
        {layer ? (
          <span className="font-mono">
            {layer.dir} ({formatBytes(layer.bytes)}, on base {layer.base})
          </span>
        ) : (
          'none — the agent runs on the shared base env'
        )}
        {' · '}env {formatBytes(listing.total_bytes)} (cache {formatBytes(listing.cache_bytes)}, downloads{' '}
        {formatBytes(listing.downloads_bytes)})
      </div>
      <label className="block">
        <span className="text-[var(--fg-muted)]">Reason (recorded in the audit)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1"
          placeholder="e.g. the one-off analysis is done"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={blocked}
          title={title}
          onClick={() =>
            void run('retry', async () => {
              const ack = await ipc.retryPythonPackageInstall(agentId, why);
              return ack.generation ? `Package check done: layer ${ack.generation}.` : 'Package check done: no layer.';
            })
          }
          className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
        >
          {busy === 'retry' ? 'Checking…' : 'Retry install'}
        </button>
        <button
          type="button"
          disabled={blocked}
          title={title}
          onClick={() =>
            void run('prune', async () => {
              const rep = await ipc.prunePythonEnv(why);
              setLastPrune(rep);
              return `Cleanup removed ${rep.removed.length} item(s), freed ${formatBytes(rep.freed_bytes)}.`;
            })
          }
          className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
        >
          {busy === 'prune' ? 'Cleaning…' : 'Clean up env'}
        </button>
      </div>
      {notice && <p className="text-[var(--fg-secondary)]">{notice}</p>}
      {lastPrune && lastPrune.errors.length > 0 && (
        <p role="alert" className="text-[var(--status-warn)]">{lastPrune.errors.join('; ')}</p>
      )}
      {listing.packages.length === 0 ? (
        <p className="text-[var(--fg-muted)]">This agent has no packages beyond the shared base env.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {listing.packages.map((p) => (
            <li key={p.id} className="rounded border border-[var(--border-subtle)] p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono">
                  {p.name}=={p.version}
                  {p.extras.length > 0 && ` [${p.extras.join(', ')}]`}
                </span>
                <span className={p.state === 'approved' ? 'text-[var(--status-ok)]' : 'text-[var(--fg-muted)]'}>{p.state}</span>
              </div>
              <div className="text-[var(--fg-muted)]">
                {p.declared ? 'declared in the profile' : p.runtime ? 'requested at run time' : p.requested_by}
                {p.distributions.length > 1 && ` · with ${p.distributions.slice(1).join(', ')}`}
                {' · '}base {p.base_generation}
              </div>
              <ol aria-label={`Audit trail of ${p.name}`} className="mt-1 flex flex-col gap-0.5 text-[11px] text-[var(--fg-muted)]">
                {p.events.map((e) => (
                  <li key={e.seq}>
                    {formatUnixMs(e.at_unix_ms)} · <span className="font-medium">{e.action}</span>
                    {e.actor && ` by ${e.actor}`}
                    {e.generation && ` → ${e.generation}`}
                    {e.detail && ` — ${e.detail}`}
                  </li>
                ))}
              </ol>
              {p.state === 'approved' && p.runtime && !p.declared && (
                <button
                  type="button"
                  disabled={blocked}
                  title={title}
                  onClick={() =>
                    void run(`remove:${p.name}`, async () => {
                      const ack = await ipc.removePythonPackage(agentId, p.name, why);
                      return ack.generation
                        ? `${p.name} removed: layer ${ack.generation}.`
                        : `${p.name} removed: the agent now runs on the base env.`;
                    })
                  }
                  className="mt-1 rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                >
                  {busy === `remove:${p.name}` ? 'Removing…' : `Remove ${p.name}`}
                </button>
              )}
              {p.state === 'approved' && p.declared && (
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                  Declared in the agent&apos;s profile: remove it from python_packages there.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-[var(--status-err)]">{error}</p>}
    </section>
  );
}
