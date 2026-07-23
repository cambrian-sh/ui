import type { IngestRow, IngestStatus } from './useIngestQueue';
import { cn } from '@/design-system/lib/utils';

const STATUS_MARK: Record<IngestStatus, string> = {
  queued: '·',
  parsing: '⠋',
  indexed: '✓',
  failed: '✗',
};

const STATUS_CLASS: Record<IngestStatus, string> = {
  queued: 'text-[var(--fg-muted)]',
  parsing: 'text-[var(--status-pulse)]',
  indexed: 'text-[var(--status-ok)]',
  failed: 'text-[var(--status-err)]',
};

function detail(row: IngestRow): string {
  switch (row.status) {
    case 'queued':
      return 'queued';
    case 'parsing':
      return 'parsing…';
    case 'indexed':
      return row.chunks === null
        ? 'indexed'
        : `indexed · ${row.chunks} chunk${row.chunks === 1 ? '' : 's'}`;
    case 'failed':
      return row.error ?? 'failed';
  }
}

export function IngestQueue({ rows }: { rows: IngestRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-1 py-2 text-[11px] text-[var(--fg-muted)]">
        Nothing ingested yet this session.
      </p>
    );
  }

  return (
    <ul aria-label="Ingest queue" className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.local_id} className="flex items-start gap-2 text-[11px]">
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
            <span className={cn('font-mono text-[10px]', STATUS_CLASS[row.status])}>
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
