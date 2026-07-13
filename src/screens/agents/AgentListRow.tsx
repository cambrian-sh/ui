
import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { AgentSummary } from '@/ipc/types';
import { AgentTraitPill } from './AgentTraitPill';

interface AgentListRowProps {
  agent: AgentSummary;
  selected: boolean;
  onClick: () => void;
}

export function AgentListRow({ agent, selected, onClick }: AgentListRowProps) {
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
          <AgentTraitPill trait={agent.trait} />
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {agent.id}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span className="truncate max-w-48">{agent.scope_summary}</span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(agent.last_activity_at)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {(agent.trust_score * 100).toFixed(0)}
          </div>
          <div>score</div>
        </div>
        <div>
          <div className="text-sm text-[var(--fg-secondary)]">{agent.last_state}</div>
          <div>state</div>
        </div>
      </div>
    </button>
  );
}
