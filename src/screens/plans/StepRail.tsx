import { cn } from '@/design-system/lib/utils';
import type { PlanStep } from '@/screens/plan/PlanStepList';

export interface StepRailProps {
  steps: PlanStep[];
  /** Total steps, for a plan whose DAG has not arrived yet. */
  fallbackCount?: number;
  className?: string;
}

/**
 * A plan's shape, as one segment per step.
 *
 * An error count tells you a number; a shape tells you where the plan is and
 * whether it is stuck near the start or nearly done. This is how progress is
 * read from the list without opening anything, which is the whole point of a
 * "plans in flight" screen.
 */
export function StepRail({ steps, fallbackCount = 0, className }: StepRailProps) {
  // Nothing to draw from: a snapshot-only plan has a count but no graph. Render
  // the count as inert segments rather than an empty bar, which would read as a
  // plan that has not started.
  const cells: (PlanStep | null)[] =
    steps.length > 0 ? steps : Array.from({ length: fallbackCount }, () => null);

  if (cells.length === 0) return null;

  const done = steps.filter((s) => s.status === 'done').length;

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="img"
      aria-label={
        steps.length > 0
          ? `${done} of ${steps.length} steps done`
          : `${fallbackCount} steps, progress not yet reported`
      }
    >
      {cells.map((step, i) => (
        <span
          key={step?.step_id ?? i}
          className={cn(
            'h-1.5 flex-1 rounded-[3px]',
            step?.status === 'running' && 'cambrian-live-fade',
          )}
          style={{ background: segmentColour(step) }}
        />
      ))}
    </div>
  );
}

function segmentColour(step: PlanStep | null): string {
  if (!step) return 'color-mix(in srgb, var(--fg-primary) 10%, transparent)';
  if (step.needs_approval) {
    return 'color-mix(in srgb, var(--status-warn) 55%, transparent)';
  }
  switch (step.status) {
    case 'done':
      return 'var(--color-neutral-500)';
    case 'running':
      return 'var(--status-live)';
    case 'failed':
      return 'var(--status-err)';
    case 'skipped':
      return 'color-mix(in srgb, var(--fg-primary) 14%, transparent)';
    default:
      return 'color-mix(in srgb, var(--fg-primary) 10%, transparent)';
  }
}
