import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { WatchConfigSummary } from '@/ipc/types';

interface WatchListRowProps {
  config: WatchConfigSummary;
  selected: boolean;
  onClick: () => void;
}

export function WatchListRow({ config, selected, onClick }: WatchListRowProps) {
  const statusColor =
    config.last_fire_status === 'ok'
      ? 'var(--status-ok)'
      : config.last_fire_status === 'error'
        ? 'var(--status-err)'
        : 'var(--status-warn)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-left transition-colors',
        'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: statusColor }}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {config.id}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span className="truncate max-w-48">
            {config.target_streams.length > 0 ? config.target_streams.join(', ') : 'No streams'}
          </span>
          {config.last_fire_at && (
            <>
              <span aria-hidden="true">·</span>
              <span>{relativeTime(config.last_fire_at)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {config.error_count}
          </div>
          <div>errors</div>
        </div>
      </div>
    </button>
  );
}
