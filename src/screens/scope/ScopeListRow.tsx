import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { ScopeSummary } from '@/ipc/types';

interface ScopeListRowProps {
  scope: ScopeSummary;
  selected: boolean;
  onClick: () => void;
}

export function ScopeListRow({ scope, selected, onClick }: ScopeListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-left transition-colors',
        'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {scope.agent_id}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span className="truncate max-w-48">{scope.effective_scope_summary}</span>
          <span aria-hidden="true">·</span>
          <span>Last change: {relativeTime(scope.last_scope_change_at)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {scope.default_write_tags.length}
          </div>
          <div>write tags</div>
        </div>
      </div>
    </button>
  );
}
