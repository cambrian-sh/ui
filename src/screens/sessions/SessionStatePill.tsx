/* State pill — a small status indicator for SessionState.
 *
 * Maps each session state to a Cambrian design token. Used in the list row
 * and the detail header.
 */
import type { SessionState } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';

const STATE_STYLES: Record<SessionState, { dot: string; bg: string; text: string; label: string }> = {
  active: {
    dot: 'bg-[var(--state-running)]',
    bg: 'bg-[var(--state-running)]/10',
    text: 'text-[var(--state-running)]',
    label: 'Active',
  },
  paused: {
    dot: 'bg-[var(--state-paused)]',
    bg: 'bg-[var(--state-paused)]/10',
    text: 'text-[var(--state-paused)]',
    label: 'Paused',
  },
  dormant: {
    dot: 'bg-[var(--state-dormant)]',
    bg: 'bg-[var(--state-dormant)]/10',
    text: 'text-[var(--state-dormant)]',
    label: 'Dormant',
  },
  completed: {
    dot: 'bg-[var(--state-completed)]',
    bg: 'bg-[var(--state-completed)]/10',
    text: 'text-[var(--state-completed)]',
    label: 'Completed',
  },
};

export function SessionStatePill({ state, className }: { state: SessionState; className?: string }) {
  const s = STATE_STYLES[state];
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
