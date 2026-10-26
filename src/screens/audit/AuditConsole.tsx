import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from '@/design-system/components';
import { AuditList } from '@/design-system/components/cambrian/audit-list';
import { Inspector } from '@/components/InspectorSlot';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import type { AuditEntry } from '@/ipc/types';

type StatusFilter = 'all' | 'denied' | 'failed' | 'mine';

/** CSV, quoted properly — a reason is free text and will contain commas. */
function toCsv(entries: AuditEntry[]): string {
  const head = [
    'timestamp',
    'actor_id',
    'actor_role',
    'target_kind',
    'target_id',
    'action_type',
    'status',
    'reason',
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [
      e.timestamp,
      e.actor_id,
      e.actor_role,
      e.target_kind,
      e.target_id,
      e.action_type,
      e.status,
      e.reason,
    ]
      .map(escape)
      .join(','),
  );
  return [head.join(','), ...rows].join('\n');
}

/**
 * The audit tail.
 *
 * Two changes carry this screen: the columns are a real grid (see AUDIT_GRID),
 * and the two statuses that mean *something did not happen* — denied and
 * failed — tint their row rather than relying on a pill the eye has to find.
 */
export function AuditConsole() {
  const projection = useStore(projectionStore);
  const entries = projection.state?.audit_tail ?? [];
  const currentActor = projection.state?.role ?? null;

  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: entries.length,
      denied: entries.filter((e) => e.status === 'denied').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      mine: entries.filter((e) => e.actor_role === currentActor).length,
    }),
    [entries, currentActor],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (status === 'denied' && e.status !== 'denied') return false;
      if (status === 'failed' && e.status !== 'failed') return false;
      if (status === 'mine' && e.actor_role !== currentActor) return false;
      if (q) {
        const hay =
          `${e.actor_id} ${e.target_kind} ${e.target_id} ${e.action_type} ${e.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, status, search, currentActor]);

  const selected = filtered.find((e) => e.entry_id === selectedId) ?? null;

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cambrian-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none px-[18px] pb-3 pt-4">
        <h1 className="type-page-title">Audit</h1>
        <p className="type-page-description mt-1">
          Every mutating action, with the reason its actor gave. New entries arrive on the
          feed and prepend — nothing here polls.
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="Audit filters"
        className="flex flex-none flex-wrap items-center gap-2 px-[18px] pb-3"
      >
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(v) => v && setStatus(v as StatusFilter)}
          aria-label="Filter audit entries"
        >
          <ToggleGroupItem value="all" aria-label="Everything">
            Everything
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">{counts.all}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="denied" aria-label="Denied">
            Denied
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">{counts.denied}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="failed" aria-label="Failed">
            Failed
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">{counts.failed}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="mine" aria-label="Mine">
            Mine
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">{counts.mine}</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actor, target, action or reason…"
          aria-label="Search audit entries"
          className="w-[280px]"
        />

        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          Export CSV
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AuditList
          entries={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyTitle={entries.length === 0 ? 'No audit entries yet' : 'Nothing matches these filters'}
          emptyBody={
            entries.length === 0
              ? 'Mutations fold into the tail as they happen. An empty tail means nothing has been changed, not that recording is off.'
              : 'Widen the filters to see more entries.'
          }
        />
      </div>

      {selected && (
        <Inspector label="Audit entry detail">
          <AuditDetail entry={selected} />
        </Inspector>
      )}
    </div>
  );
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const summary =
    entry.status === 'denied'
      ? `${entry.actor_id} tried to ${entry.action_type} ${entry.target_kind}:${entry.target_id}, and policy refused it. Nothing changed.`
      : entry.status === 'failed'
        ? `${entry.actor_id} ran ${entry.action_type} on ${entry.target_kind}:${entry.target_id} and it failed. The change may be partial — check the payload.`
        : `${entry.actor_id} ran ${entry.action_type} on ${entry.target_kind}:${entry.target_id}. It was applied.`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[13px] leading-[1.55] text-[var(--fg-primary)]">{summary}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
        <Row label="Actor" value={`${entry.actor_id} (${entry.actor_role})`} />
        <Row label="Entry" value={entry.entry_id} />
        <Row label="Timestamp" value={entry.timestamp} />
        <Row label="Kind" value={entry.kind} />
      </dl>

      <div>
        <div className="type-label mb-1 text-[var(--fg-muted)]">
          Reason
        </div>
        <p className="border-l border-[var(--border-strong)] pl-2.5 text-[12.5px] leading-[1.55] text-[var(--fg-primary)] opacity-80">
          {entry.reason || '— no reason recorded'}
        </p>
      </div>

      {(entry.before || entry.after) && (
        <div className="flex flex-col gap-2">
          {entry.before && <Payload label="Before" value={entry.before} />}
          {entry.after && <Payload label="After" value={entry.after} />}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="type-label text-[var(--fg-muted)]">
        {label}
      </dt>
      <dd className="truncate font-mono text-[11.5px] text-[var(--fg-primary)]">{value}</dd>
    </>
  );
}

function Payload({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <div className="type-label mb-1 text-[var(--fg-muted)]">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-md bg-[var(--bg-canvas)] p-2 font-mono text-[10.5px] leading-[1.5] text-[var(--fg-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
