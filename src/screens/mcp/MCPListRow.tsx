import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { MCPServerSummary } from '@/ipc/types';
import { MCPConnectionPill } from './MCPConnectionPill';

interface MCPListRowProps {
  server: MCPServerSummary;
  selected: boolean;
  onClick: () => void;
}

export function MCPListRow({ server, selected, onClick }: MCPListRowProps) {
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
          <MCPConnectionPill state={server.connection_state} />
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {server.id}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span>Last health check: {relativeTime(server.last_health_check_at)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {server.tool_count}
          </div>
          <div>tools</div>
        </div>
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            ${server.default_price.toFixed(2)}
          </div>
          <div>price</div>
        </div>
      </div>
    </button>
  );
}
