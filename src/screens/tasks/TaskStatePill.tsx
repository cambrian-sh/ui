import { Badge, type BadgeProps } from '@/design-system/components';
import type { SessionState } from '@/ipc/types';

const STATE: Record<SessionState, { variant: BadgeProps['variant']; label: string }> = {
  active: { variant: 'live', label: 'Active' },
  paused: { variant: 'warn', label: 'Paused' },
  dormant: { variant: 'neutral', label: 'Dormant' },
  completed: { variant: 'neutral', label: 'Completed' },
};

export function TaskStatePill({ state, className }: { state: SessionState; className?: string }) {
  const s = STATE[state];
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}
