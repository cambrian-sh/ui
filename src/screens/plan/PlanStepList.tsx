/* Step-list mode (PRD-04 §5) — the canonical accessible representation.
 *
 * The list is the source of truth for keyboard nav (`j`/`k` move the
 * selection, `Enter` opens the detail). A virtualised variant ships in
 * a follow-on; V1 uses a simple list (a 200-step plan is the worst case
 * the operator observes in V1, and the per-row height is small enough
 * that a flat list renders in < 16 ms on commodity hardware).
 */
import { cn } from '@/design-system/lib/utils';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PlanStep {
  step_id: string;
  index: number;
  query: string;
  status: PlanStepStatus;
  bids_count: number;
  output_peek?: string;
  trust_score?: number;
}

const ROW_CLASS: Record<PlanStepStatus, string> = {
  pending: 'text-[var(--fg-muted)]',
  running: 'text-[var(--fg-primary)] font-medium',
  done: 'text-[var(--fg-muted)]',
  failed: 'text-[var(--status-err)]',
  skipped: 'text-[var(--fg-muted)] line-through',
};

const STATUS_PILL: Record<PlanStepStatus, string> = {
  pending: 'bg-[var(--status-muted)] text-[var(--fg-on-accent)]',
  running: 'bg-[var(--status-pulse)] text-[var(--fg-on-accent)]',
  done: 'bg-[var(--status-ok)] text-[var(--fg-on-accent)]',
  failed: 'bg-[var(--status-err)] text-[var(--fg-on-accent)]',
  skipped: 'bg-[var(--status-muted)] text-[var(--fg-on-accent)]',
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
        return (
          <li key={s.step_id}>
            <button
              type="button"
              onClick={() => onSelectStep(s.index)}
              aria-pressed={isSelected}
              className={cn(
                'flex w-full items-start gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left text-xs hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                isSelected && 'bg-[var(--bg-elevated)]',
                ROW_CLASS[s.status],
              )}
            >
              <span className="font-mono text-[10px] w-6 shrink-0 text-[var(--fg-muted)]">
                {String(s.index).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate">{s.query}</span>
              {s.bids_count > 0 && (
                <span className="font-mono text-[10px] text-[var(--fg-muted)] shrink-0">
                  {s.bids_count} bid{s.bids_count === 1 ? '' : 's'}
                </span>
              )}
              <span
                className={cn(
                  'rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide shrink-0',
                  STATUS_PILL[s.status],
                )}
                aria-label={`step status ${s.status}`}
              >
                {s.status}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
