/* Session list row — the compact representation of one session in the list.
 *
 * PRD-06 §4: "title, state pill, last activity, plan count, agent mix, cost."
 * Clicking selects the row; the detail panel renders the full header.
 */
import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { SessionSummary } from '@/ipc/types';
import { SessionStatePill } from './SessionStatePill';

interface SessionListRowProps {
  session: SessionSummary;
  selected: boolean;
  onClick: () => void;
}

export function SessionListRow({ session, selected, onClick }: SessionListRowProps) {
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
          <SessionStatePill state={session.state} />
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">
            {session.title}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <span className="font-mono">{session.session_id.slice(0, 12)}</span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(session.last_activity_at)}</span>
          {session.agent_mix.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{session.agent_mix.join(', ')}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {session.plan_count}
          </div>
          <div>plans</div>
        </div>
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            ${session.cost.toFixed(2)}
          </div>
          <div>cost</div>
        </div>
      </div>
    </button>
  );
}
