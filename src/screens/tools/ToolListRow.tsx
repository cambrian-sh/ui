import { cn } from '@/design-system/lib/utils';
import type { ToolSummary } from '@/ipc/types';

interface ToolListRowProps {
  tool: ToolSummary;
  selected: boolean;
  onClick: () => void;
}

export function ToolListRow({ tool, selected, onClick }: ToolListRowProps) {
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
          {tool.danger && (
            <span className="inline-flex items-center rounded-full bg-[var(--status-warn)]/10 px-2 py-0.5 text-xs font-medium text-[var(--status-warn)]">
              Danger
            </span>
          )}
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">{tool.id}</span>
        </div>
        <div className="mt-0.5 truncate max-w-64 text-xs text-[var(--fg-muted)]">
          {tool.description}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {tool.granted_agent_count}
          </div>
          <div>grants</div>
        </div>
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {tool.recent_invocation_count}
          </div>
          <div>invocations</div>
        </div>
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            ${tool.last_cost.toFixed(2)}
          </div>
          <div>cost</div>
        </div>
      </div>
    </button>
  );
}
