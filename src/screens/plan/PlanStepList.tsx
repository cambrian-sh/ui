import { Badge } from '@/design-system/components/ui/badge';
import { cn } from '@/design-system/lib/utils';
import type { DispatchTrace } from '@/ipc/types';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PlanStep {
  step_id: string;
  index: number;
  query: string;
  status: PlanStepStatus;
  output_peek?: string;
  trust_score?: number;
  /** Zero-based indices this step waits on (real DAG edges). */
  depends_on?: number[];
  is_thought?: boolean;
  /** The agent that ran, or is running, this step. */
  agent?: string | null;
  /** True when an intervention is blocking this step or one it waits on. */
  needs_approval?: boolean;
  /** The capability contract this step requires (ADR-0100). */
  required_capabilities?: string[];
  dispatch?: DispatchTrace;
}

/** The status dot. Shape carries the state as well as colour. */
function StepDot({ status }: { status: PlanStepStatus }) {
  if (status === 'running') {
    return (
      <span
        aria-hidden="true"
        className="cambrian-halo size-[7px] shrink-0 rounded-full bg-[var(--accent-bg)]"
      />
    );
  }
  if (status === 'pending') {
    // A ring, not a disc: pending is an outline of a step, not a filled one.
    return (
      <span
        aria-hidden="true"
        className="size-[7px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--color-neutral-600)]"
      />
    );
  }
  const fill =
    status === 'failed'
      ? 'var(--status-err)'
      : status === 'done'
        ? 'var(--color-neutral-500)'
        : 'var(--status-idle)';
  return (
    <span
      aria-hidden="true"
      className="size-[7px] shrink-0 rounded-full"
      style={{ background: fill }}
    />
  );
}

/**
 * What this row says about itself on the right-hand side.
 *
 * A bare "pending" with no reason is the least useful thing a step row can say:
 * it states the obvious and hides the interesting part, which is *what it is
 * waiting for*. A pending step is either waiting on a dependency (name it) or
 * on a human (say so, in warn).
 *
 * This slot used to carry `{bids_count} bids`. Under capability-typed dispatch
 * (ADR-0100) nobody bids, so it carries the step's **required capability** —
 * the thing that actually decided which agent ran it.
 */
function stepMeta(step: PlanStep): { text: string; tone?: string } | null {
  if (step.needs_approval) {
    return { text: 'needs approval', tone: 'var(--status-warn)' };
  }

  // The ladder exhausted: no agent carries this capability. Say which one.
  if (step.dispatch?.resolution === 'failed') {
    return {
      text: `no agent for ${step.dispatch.unmatched_capability ?? 'this capability'}`,
      tone: 'var(--status-err)',
    };
  }

  if (step.status === 'pending') {
    const waits = step.depends_on?.filter((d) => d !== step.index) ?? [];
    if (waits.length > 0) {
      return {
        text: `waits on ${waits.map((d) => String(d).padStart(2, '0')).join(', ')}`,
      };
    }
    return null;
  }

  const capability = step.required_capabilities?.[0];
  if (capability && step.agent) return { text: `${capability} · ${step.agent}` };
  if (capability) return { text: capability };
  if (step.agent) return { text: step.agent };
  return null;
}

/**
 * The status tag, through the one badge component.
 *
 * Hand-rolling these per screen is how a design system ends up with four
 * slightly different "failed" chips, so the variants map onto the --status-*
 * tokens and nothing here invents its own colour.
 */
const STATUS_TAG: Record<
  PlanStepStatus,
  { label: string; variant: 'live' | 'warn' | 'err' | 'neutral' | 'outline' }
> = {
  pending: { label: 'pending', variant: 'neutral' },
  running: { label: 'running', variant: 'live' },
  done: { label: 'done', variant: 'neutral' },
  failed: { label: 'failed', variant: 'err' },
  skipped: { label: 'skipped', variant: 'neutral' },
};

export function PlanStepList({
  steps,
  selectedIndex,
  onSelectStep,
}: {
  steps: PlanStep[];
  selectedIndex: number | null;
  onSelectStep: (index: number) => void;
}) {
  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[var(--fg-muted)]">
        No steps in this plan.
      </div>
    );
  }

  return (
    <ol aria-label="Plan steps" className="flex flex-col">
      {steps.map((s) => {
        const isSelected = s.index === selectedIndex;
        const meta = stepMeta(s);
        const tag = STATUS_TAG[s.status];
        return (
          <li key={s.step_id}>
            <button
              type="button"
              onClick={() => onSelectStep(s.index)}
              aria-pressed={isSelected}
              className={cn(
                'cambrian-stepin flex w-full items-center gap-2.5 px-3.5 py-[9px] text-left transition-colors',
                'shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_6%,transparent)]',
                'hover:bg-[color-mix(in_srgb,var(--fg-primary)_4%,transparent)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
                isSelected &&
                  'bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] shadow-[inset_2px_0_0_var(--accent-bg)]',
              )}
            >
              <span
                className={cn(
                  'w-[22px] shrink-0 font-mono text-[10.5px]',
                  s.status === 'running'
                    ? 'text-[var(--color-accent-400)]'
                    : 'text-[var(--fg-muted)]',
                )}
              >
                {String(s.index).padStart(2, '0')}
              </span>

              <StepDot status={s.status} />

              <span
                className={cn(
                  'flex-1 truncate text-[12.5px]',
                  s.status === 'running' && 'font-medium text-[var(--fg-primary)]',
                  s.status === 'done' && 'text-[var(--fg-primary)] opacity-60',
                  s.status === 'pending' && 'text-[var(--fg-primary)] opacity-[0.42]',
                  s.status === 'failed' && 'text-[var(--status-err)]',
                  s.status === 'skipped' && 'text-[var(--fg-muted)] line-through',
                )}
              >
                {s.query}
              </span>

              {meta && (
                <span
                  className="shrink-0 truncate font-mono text-[10.5px] text-[var(--fg-muted)]"
                  style={meta.tone ? { color: meta.tone } : undefined}
                >
                  {meta.text}
                </span>
              )}

              <Badge
                variant={tag.variant}
                className={cn('shrink-0', s.status === 'pending' && 'opacity-70')}
                aria-label={`step status ${s.status}`}
              >
                {tag.label}
              </Badge>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
