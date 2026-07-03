/* State pill — a small status indicator for PlanStatus.
 *
 * Maps each plan status to a Cambrian design token. Used in the list row
 * and the detail header.
 */
import type { PlanStatus } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';

const STATUS_STYLES: Record<PlanStatus, { dot: string; bg: string; text: string; label: string }> = {
  forming: {
    dot: 'bg-[var(--state-running)]',
    bg: 'bg-[var(--state-running)]/10',
    text: 'text-[var(--state-running)]',
    label: 'Forming',
  },
  running: {
    dot: 'bg-[var(--state-running)]',
    bg: 'bg-[var(--state-running)]/10',
    text: 'text-[var(--state-running)]',
    label: 'Running',
  },
  paused: {
    dot: 'bg-[var(--state-paused)]',
    bg: 'bg-[var(--state-paused)]/10',
    text: 'text-[var(--state-paused)]',
    label: 'Paused',
  },
  completed: {
    dot: 'bg-[var(--state-completed)]',
    bg: 'bg-[var(--state-completed)]/10',
    text: 'text-[var(--state-completed)]',
    label: 'Completed',
  },
  failed: {
    dot: 'bg-[var(--status-err)]',
    bg: 'bg-[var(--status-err)]/10',
    text: 'text-[var(--status-err)]',
    label: 'Failed',
  },
};

export function PlanStatePill({ state, className }: { state: PlanStatus; className?: string }) {
  const s = STATUS_STYLES[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}