/* Audit read-only list (PRD-07 + UI-016 + UI-IMPL-13).
 *
 * Reads the audit_tail from the projection store (the fold from the
 * kernel's operator_audit log). Filter by actor / status; detail pane
 * shows the entry's before/after diff and the reason. The CSV/JSON
 * export (UI-016) and the deep-link back to target land in UI-IMPL-21.
 */
import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import type { AuditEntry } from '@/ipc/types';
import { AuditList } from '@/design-system/components/cambrian/audit-list';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';

function AuditExplorer() {
  const projection = useStore(projectionStore);
  const entries = projection.state?.audit_tail ?? [];
  const [actorFilter, setActorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AuditEntry['status']>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (actorFilter && !e.actor_id.toLowerCase().includes(actorFilter.toLowerCase())) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }, [entries, actorFilter, statusFilter]);

  const selected = filtered.find((e) => e.entry_id === selectedId) ?? null;

  const reset = () => {
    setActorFilter('');
    setStatusFilter('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Audit</h1>
        <p className="text-xs text-[var(--fg-muted)]">
          Every mutating action is recorded. The tail is the most recent
          {entries.length === 0 ? ' (empty in V1 until the kernel folds events)' : ` ${entries.length} entries`}.
          CSV/JSON export lands in UI-IMPL-21.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filter</CardTitle>
          <CardDescription>Actor + status. More filters (time, target_kind, action_type) land in UI-IMPL-21.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Actor contains…"
            aria-label="Actor filter"
            className="flex-1 rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Status filter"
            className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <option value="">All statuses</option>
            <option value="applied">applied</option>
            <option value="failed">failed</option>
            <option value="denied">denied</option>
          </select>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
          >
            Reset
          </button>
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-y-auto rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <AuditList
            entries={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            emptyTitle="No audit entries"
            emptyBody="The audit tail is empty in V1. Mutations will fold into the tail as they happen."
          />
        </div>
        <div className="overflow-y-auto">
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-mono break-all">{selected.entry_id}</CardTitle>
                <CardDescription>
                  {selected.action_type} · {selected.target_kind}:{selected.target_id} · {selected.status}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Actor</div>
                  <p className="font-mono text-[11px] text-[var(--fg-primary)]">{selected.actor_id} ({selected.actor_role})</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Timestamp</div>
                  <p className="font-mono text-[11px] text-[var(--fg-primary)]">{selected.timestamp}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Reason</div>
                  <p className="text-[11px] text-[var(--fg-primary)] whitespace-pre-wrap break-words">{selected.reason || '—'}</p>
                </div>
                {selected.before && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Before</div>
                    <pre className="rounded-sm bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-secondary)] overflow-x-auto">
                      {JSON.stringify(selected.before, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.after && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">After</div>
                    <pre className="rounded-sm bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-secondary)] overflow-x-auto">
                      {JSON.stringify(selected.after, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">No entry selected</CardTitle>
                <CardDescription>Select an entry to see the reason, actor, and before/after diff.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/audit')({
  component: AuditExplorer,
});
