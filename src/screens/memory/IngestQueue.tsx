import type { IngestRow, IngestStatus } from './useIngestQueue';
import { cn } from '@/design-system/lib/utils';
import { describeIngest } from './ingestProgress';

const STATUS_MARK: Record<IngestStatus, string> = {
  queued: '·',
  parsing: '⠋',
  indexed: '✓',
  accepted: '·',
  embedding: '⠋',
  searchable: '✓',
  failed: '✗',
};

const STATUS_CLASS: Record<IngestStatus, string> = {
  queued: 'text-[var(--fg-muted)]',
  parsing: 'text-[var(--status-live)]',
  indexed: 'text-[var(--status-ok)]',
  accepted: 'text-[var(--status-live)]',
  embedding: 'text-[var(--status-live)]',
  searchable: 'text-[var(--status-ok)]',
  failed: 'text-[var(--status-err)]',
};

function detail(row: IngestRow): string {
  switch (row.status) {
    case 'queued':
      return 'queued';
    case 'parsing':
      return 'parsing…';
    // Contract 0111 (ingest-status): a large upload embedded in the background.
    case 'accepted':
    case 'embedding':
      return row.ingest ? describeIngest(row.ingest) : row.status;
    case 'indexed':
    case 'searchable': {
      // ADR-0138 B1.1: an exact duplicate wrote nothing — say so, and name the copy.
      if (row.duplicate_of) return `duplicate of ${row.duplicate_of} · nothing written`;
      const word = row.status;
      if (row.version !== null && row.version > 1) return `${word} · replaced the earlier version (v${row.version})`;
      return row.chunks === null
        ? word
        : `${word} · ${row.chunks} chunk${row.chunks === 1 ? '' : 's'}`;
    }
    case 'failed':
      return row.error ?? 'failed';
  }
}

export function IngestQueue({ rows }: { rows: IngestRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-1 text-[12.5px] text-[var(--fg-muted)]">
        Nothing ingested yet this session.
      </p>
    );
  }

  return (
    <ul aria-label="Ingest queue" aria-live="polite" className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.local_id} className="flex items-start gap-2 text-[13px]">
          <span
            aria-hidden="true"
            className={cn('shrink-0 font-mono', STATUS_CLASS[row.status])}
          >
            {STATUS_MARK[row.status]}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[var(--fg-primary)]" title={row.label}>
              {row.label}
            </span>
            <span className={cn('text-[12px]', STATUS_CLASS[row.status])}>
              {detail(row)}
              {row.deduped && (
                <span
                  className="ml-1 text-[var(--fg-muted)]"
                  title="The kernel replayed this command_id. Not a duplicate document."
                >
                  · replayed command
                </span>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
