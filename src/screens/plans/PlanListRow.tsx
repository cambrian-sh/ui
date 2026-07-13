
import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { PlanInFlight } from '@/ipc/types';
import { PlanStatePill } from './PlanStatePill';

interface PlanListRowProps {
  plan: PlanInFlight;
  selected: boolean;
  sessionTitle: string;
  onClick: () => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export function PlanListRow({ plan, selected, sessionTitle, onClick }: PlanListRowProps) {
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
          <PlanStatePill state={plan.status} />
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {plan.subject}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span className="font-mono">{plan.plan_id.slice(0, 12)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate max-w-[160px]" title={sessionTitle}>
            {sessionTitle}
          </span>
          <span aria-hidden="true">·</span>
          <span>{plan.step_count} step{plan.step_count === 1 ? '' : 's'}</span>
          {plan.active_agent && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[120px]">{plan.active_agent}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{relativeTime(plan.started_at)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {formatElapsed(plan.elapsed_ms)}
          </div>
          <div>elapsed</div>
        </div>
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            ${plan.cost.toFixed(3)}
          </div>
          <div>cost</div>
        </div>
      </div>
    </button>
  );
}
