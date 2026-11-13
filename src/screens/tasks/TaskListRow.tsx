import { Button } from '@/design-system/components/ui/button';
import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import { formatTokens, sessionSubject } from '@/lib/format';
import { formatIdle, idleSeconds } from '@/lib/hitl';
import { planProgress, type RankedSession } from '@/lib/sessions';

interface TaskListRowProps {
  ranked: RankedSession;
  selected: boolean;
  onClick: () => void;
  /**
   * Card layout with 48px touch targets, for the phone.
   *
   * The desktop row puts the stats in a right-hand rail, which at 402px either
   * squeezes the subject to nothing or wraps into an unreadable stack.
   */
  compact?: boolean;
}

/** The state word each row leads with, and its tone (`2a`). */
const KICKER: Record<RankedSession['attention'], { label: string; tone: string }> = {
  waiting: { label: 'Waiting on you', tone: 'var(--status-warn)' },
  failed: { label: 'Failed', tone: 'var(--status-err)' },
  running: { label: 'Running', tone: 'var(--status-live)' },
  paused: { label: 'Paused', tone: 'var(--status-warn)' },
  dormant: { label: 'Dormant', tone: 'var(--fg-muted)' },
  pending: { label: 'Not started', tone: 'var(--fg-muted)' },
  done: { label: 'Finished', tone: 'var(--status-done)' },
};

/**
 * One task, as a row (`2a`).
 *
 * Two things this fixes. The heading used to be the raw goal — a 200-character
 * instruction clipped mid-word — with the id and the age rendered at the same
 * weight beside it, so nothing in the row was more important than anything else.
 * And a task blocked on an approval looked exactly like one running fine.
 *
 * So: the state word leads the line, the subject is short, the instruction is
 * quoted beneath it verbatim and clamped to two lines, and the row says *why* it
 * is stopped rather than only that it is.
 */
export function TaskListRow({ ranked, selected, onClick, compact }: TaskListRowProps) {
  const { session, attention, blocking, plans } = ranked;
  const waiting = attention === 'waiting';
  const kicker = KICKER[attention];

  const runningPlan = plans.find((p) => p.status === 'running' || p.status === 'forming');
  const progress = runningPlan ? planProgress(runningPlan) : null;
  const totalSteps = runningPlan?.steps?.length ?? 0;

  return (
    <div
      className={cn(
        'flex w-full transition-colors',
        compact
          ? 'mx-3 my-1 flex-col gap-2 rounded-[var(--radius-xl)] p-[13px_14px] shadow-[var(--elevation-1)]'
          : 'items-start gap-[18px] px-[var(--page-gutter)] py-3.5 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_7%,transparent)]',
        waiting &&
          'tint-wash shadow-[inset_3px_0_0_var(--status-warn),inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_7%,transparent)]',
        // A failure is tinted for the same reason a waiting row is: a pill alone
        // is not enough at this density, and this is the row an operator most
        // needs to find.
        attention === 'failed' &&
          'tint-wash shadow-[inset_3px_0_0_var(--status-err),inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_7%,transparent)]',
        (attention === 'dormant' || attention === 'done') && 'opacity-70',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
      style={
        waiting
          ? ({ '--tint': 'var(--status-warn)' } as React.CSSProperties)
          : attention === 'failed'
            ? ({ '--tint': 'var(--status-err)' } as React.CSSProperties)
            : undefined
      }
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-current={selected ? 'true' : undefined}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
      >
        {/* State, subject and id on ONE line. The state is a word rather than a
            bare dot: a colour alone asks the operator to remember a legend. */}
        <div className="mb-[5px] flex items-center gap-[9px]">
          <span
            className="type-status inline-flex flex-none items-center gap-1.5 leading-none"
            style={{ color: kicker.tone }}
          >
            {attention === 'running' && (
              <span
                aria-hidden="true"
                className="cambrian-live-pulse size-1.5 rounded-full"
                style={{ background: kicker.tone }}
              />
            )}
            {kicker.label}
          </span>
          <span className="min-w-0 truncate text-[14.5px] font-medium leading-[1.35]">
            {sessionSubject(session.title)}
          </span>
          <span className="flex-none font-mono text-[11px] leading-none text-[var(--fg-muted)]">
            {session.session_id.slice(0, 12)}
          </span>
        </div>

        {/* The instruction verbatim. Clamped, not truncated: two lines of the real
            wording beat one line of a sentence that stops mid-word. */}
        {/* Only when it says more than the subject above it already does. */}
        {session.title && sessionSubject(session.title) !== session.title.trim() && (
          <p className="mb-1.5 line-clamp-2 max-w-[640px] text-[13px] leading-[1.5] text-[var(--fg-secondary)]">
            “{session.title}”
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {session.agent_mix.map((a, i) => (
            <span
              key={a}
              // The lead agent reads first; the rest are quieter. Neutral, not
              // blue: blue on this screen means a link.
              className={cn(
                'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-[2px] font-mono text-[11px] leading-none',
                i === 0 ? 'text-[var(--fg-primary)]' : 'text-[var(--fg-muted)]',
              )}
            >
              {a}
            </span>
          ))}

          {/* Why it is stopped, not just that it is. */}
          {waiting && blocking && (
            <span className="text-[12.5px] text-[var(--status-warn)]">
              Step {blocking.step_id} needs your approval · waiting {formatIdle(idleSeconds(blocking))}
            </span>
          )}

          {attention === 'running' && runningPlan && (
            <span className="text-[12.5px] text-[var(--fg-muted)]">
              {totalSteps > 0
                ? `Step ${runningPlan.step_count} of ${totalSteps}`
                : `Step ${runningPlan.step_count}`}{' '}
              · {relativeTime(session.last_activity_at)}
              {progress != null && ` · ${progress}%`}
            </span>
          )}

          {attention === 'paused' && (
            // The design quotes the operator's own pause reason back to them.
            // `SessionSummaryOp` carries none, so the row says WHEN rather than
            // inventing WHY — a fabricated reason in an audit-adjacent list is
            // worse than an absent one.
            <span className="text-[12.5px] text-[var(--fg-muted)]">
              You paused it {relativeTime(session.last_activity_at)} — the reason is not reported
            </span>
          )}

          {attention === 'failed' && (
            <span className="text-[12.5px] text-[var(--status-err)]">
              A plan failed {relativeTime(session.last_activity_at)} — nothing is running
            </span>
          )}

          {attention === 'done' && (
            <span className="text-[12.5px] text-[var(--fg-muted)]">
              {session.state === 'completed'
                ? `Finished ${relativeTime(session.last_activity_at)}`
                : // Nothing closes a task on its own — only the operator's
                  // Complete command does — so a task whose work is over sits
                  // here open. Saying that beats calling it idle.
                  `Work finished ${relativeTime(session.last_activity_at)} — the task is still open`}
            </span>
          )}

          {attention === 'dormant' && (
            // Not neglected — asleep on purpose. Saying which is the difference
            // between an operator poking it and leaving it alone.
            <span className="text-[12.5px] text-[var(--fg-muted)]">
              Dormant since {relativeTime(session.last_activity_at)} — it wakes on its next bid,
              not on a timer
            </span>
          )}

          {attention === 'pending' && (
            // Not "quiet" — nothing was ever created for it. That is worth
            // seeing: it usually means the planner produced nothing.
            <span className="text-[12.5px] text-[var(--fg-muted)]">
              No plan has been created — opened {relativeTime(session.created_at)}
            </span>
          )}
        </div>
      </button>

      <div
        className={cn(
          'flex items-center gap-[22px]',
          compact ? 'w-full justify-between' : 'flex-none',
        )}
      >
        <Stat
          value={String(session.plan_count)}
          label={session.plan_count === 1 ? 'plan' : 'plans'}
        />
        {/* Tokens, never money: the kernel meters tokens, and a dollar figure here
            would be a number nobody derived (Part 2 §0). */}
        <Stat value={formatTokens(session.cost)} label="tokens" />
        {waiting && (
          <Button size="sm" onClick={onClick} className={compact ? 'min-h-12 px-4' : 'text-[12px]'}>
            Review
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <div className="text-[14px] font-medium leading-[1.3] tabular-nums">{value}</div>
      <div className="text-[11.5px] text-[var(--fg-muted)]">{label}</div>
    </div>
  );
}
