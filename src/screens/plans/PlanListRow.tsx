import { cn } from '@/design-system/lib/utils';
import { formatTokens, formatDuration } from '@/lib/format';
import { formatIdle, idleSeconds } from '@/lib/hitl';
import { sessionSubject } from '@/lib/format';
import { stepsOf, withApprovals } from '@/lib/planSteps';
import type { HITLIntervention, PlanInFlight } from '@/ipc/types';
import { PlanStatePill } from './PlanStatePill';
import { StepRail } from './StepRail';

interface PlanListRowProps {
  plan: PlanInFlight;
  selected: boolean;
  sessionTitle: string;
  /** 1–9, matching the hotkey that opens this plan. Absent past the ninth. */
  hotkeyIndex?: number;
  /** Interventions blocking this plan, if any. */
  blocking?: readonly HITLIntervention[];
  onClick: () => void;
}

/**
 * One plan, as a card.
 *
 * A row of text tells you a plan exists. What an operator scanning this screen
 * needs is: how far has it got, and if it has stopped, *why*. So the card leads
 * with the step rail and closes with a sentence naming the blockage — the two
 * things that were previously not on this screen at all.
 */
export function PlanListRow({
  plan,
  selected,
  sessionTitle,
  hotkeyIndex,
  blocking = [],
  onClick,
}: PlanListRowProps) {
  const steps = withApprovals(stepsOf(plan), blocking);
  const done = steps.filter((s) => s.status === 'done').length;
  const running = steps.find((s) => s.status === 'running');
  const failed = steps.find((s) => s.status === 'failed');

  const isRunning = plan.status === 'running' || plan.status === 'forming';
  const isBlocked = blocking.length > 0;
  const isDone = plan.status === 'completed';

  const ring = isBlocked
    ? 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-warn)_30%,transparent)]'
    : isRunning
      ? 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_24%,transparent)]'
      : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col rounded-[10px] bg-[var(--bg-surface)] p-[14px_16px] text-left transition-colors',
        ring,
        isDone && 'opacity-70',
        selected && 'bg-[var(--list-row-bg-selected)]',
        'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
      )}
    >
      <div className="mb-[11px] flex items-center gap-2.5">
        {hotkeyIndex != null && (
          <span
            className="w-3 shrink-0 font-mono text-[10px] leading-none text-[var(--fg-muted)]"
            aria-hidden="true"
          >
            {hotkeyIndex}
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            'size-[7px] shrink-0 rounded-full',
            isRunning && 'cambrian-live-pulse',
          )}
          style={{
            background: isBlocked
              ? 'var(--status-warn)'
              : plan.status === 'failed'
                ? 'var(--status-err)'
                : isRunning
                  ? 'var(--status-live)'
                  : 'var(--status-done)',
          }}
        />
        <span className="truncate text-[14.5px] font-medium leading-[1.35] text-[var(--fg-primary)]">
          {sessionSubject(plan.subject)}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-[var(--fg-muted)]">
          {plan.plan_id.slice(0, 8)}
        </span>
        <span aria-hidden="true" className="hidden text-[var(--fg-muted)] opacity-50 sm:inline">
          ·
        </span>
        <span className="hidden min-w-0 truncate text-[12px] text-[var(--fg-secondary)] sm:inline">
          {sessionTitle}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-[18px] text-[12.5px] text-[var(--fg-secondary)]">
          <span className="font-mono leading-none">{formatDuration(plan.elapsed_ms)} elapsed</span>
          {/* Tokens, never money: the kernel meters tokens, and a dollar figure
              here would be a number nobody derived (Part 2 §0). */}
          <span className="font-mono leading-none">{formatTokens(plan.cost)} tok</span>
          <PlanStatePill state={plan.status} />
        </div>
      </div>

      <StepRail steps={steps} fallbackCount={plan.step_count} className="mb-2" />

      {/* What is happening, and why it is stuck. */}
      <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
        {isBlocked
          ? `step ${blocking[0].step_id} · nothing has moved for ${formatIdle(idleSeconds(blocking[0]))} · waiting for you to decide`
          : failed
            ? `step ${String(failed.index).padStart(2, '0')} failed — the plan stopped here`
            : running
              ? `step ${done + 1} of ${steps.length || plan.step_count}${running.agent ? ` · ${running.agent}` : ''} · ${running.query}`
              : isDone
                ? `${done} of ${steps.length || plan.step_count} steps done`
                : `${done} of ${steps.length || plan.step_count} steps done · nothing running`}
      </p>
    </button>
  );
}
