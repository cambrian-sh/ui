import { Button } from '@/design-system/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/design-system/components/ui/collapsible';
import { Progress } from '@/design-system/components/ui/progress';
import { PlanStepList, type PlanStep } from '@/screens/plan/PlanStepList';
import { formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import type { PlanInFlight } from '@/ipc/types';

export interface ExecutionPlanBlockProps {
  plan: PlanInFlight;
  steps: PlanStep[];
  selectedIndex: number | null;
  onSelectStep: (index: number) => void;
  onOpenGraph?: (planId: string) => void;
  /**
   * Render the header as a collapsible trigger with the steps inside it.
   *
   * Used on mobile, where the plan is a live header pinned under the title
   * rather than a second pane: a phone has no room for a permanent step list,
   * but hiding the plan entirely loses the one thing that says the session is
   * still moving. So the header stays visible and the steps fold.
   */
  collapsible?: boolean;
  className?: string;
}

/**
 * The ExecutionPlan, rendered in the conversation.
 *
 * The console used to put the conversation in one pane and the plan in another,
 * with no relationship drawn between them — and because the plan pane was
 * permanently mounted, it said "no plan in flight" most of the time. But a plan
 * is not a separate view of a session: it is what the session *did* in response
 * to a message, and it belongs in the transcript at the point it was formed.
 *
 * "The plan is the centre of gravity" (CLAUDE.md) is satisfied better by this
 * than by a permanent aside, because here the plan is always next to the
 * instruction that caused it.
 */
export function ExecutionPlanBlock({
  plan,
  steps,
  selectedIndex,
  onSelectStep,
  onOpenGraph,
  collapsible,
  className,
}: ExecutionPlanBlockProps) {
  const total = steps.length || plan.step_count;
  const done = steps.filter((s) => s.status === 'done').length;
  const runningIndex = steps.findIndex((s) => s.status === 'running');
  // "step 3 of 6" is about where the work is, so it counts the running step
  // when there is one and falls back to how many have finished when there
  // is not — a completed plan should read "6 of 6", not "5 of 6".
  const position = runningIndex >= 0 ? runningIndex + 1 : done;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const isLive = plan.status === 'running' || plan.status === 'forming';

  const header = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'size-[7px] shrink-0 rounded-full',
          isLive ? 'cambrian-live-pulse bg-[var(--status-live)]' : 'bg-[var(--status-done)]',
        )}
      />
      <span className="type-section-title text-[var(--fg-primary)]">Plan</span>
      <span className="font-mono text-[11.5px] text-[var(--fg-muted)]">
        {plan.plan_id.slice(0, 8)}
      </span>
      <span className="text-[12px] text-[var(--fg-muted)]">
        Step {position} of {total}
      </span>
      <div className="ml-auto flex items-center gap-3">
        <Progress
          value={progress}
          tone={isLive ? 'var(--status-live)' : 'var(--fg-muted)'}
          className="w-[80px] sm:w-[120px]"
          aria-label={`Plan progress: ${done} of ${total} steps done`}
        />
        <span className="text-[12px] tabular-nums text-[var(--fg-muted)]">
          {formatTokens(plan.cost)} tok
        </span>
      </div>
    </>
  );

  const stepList = (
    <PlanStepList steps={steps} selectedIndex={selectedIndex} onSelectStep={onSelectStep} />
  );

  const shell =
    'flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--card-border)] bg-[var(--bg-surface)]';

  // Mobile: the header stays live and the steps fold. Defaults open, because a
  // collapsed plan on first paint hides the thing the operator came to watch.
  if (collapsible) {
    return (
      <Collapsible defaultOpen className={cn(shell, className)}>
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3 text-left">
          {header}
        </CollapsibleTrigger>
        <CollapsibleContent>{stepList}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className={cn(shell, className)}>
      <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
        {header}
        {onOpenGraph && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => onOpenGraph(plan.plan_id)}
          >
            Graph
          </Button>
        )}
      </div>

      {stepList}
    </div>
  );
}
