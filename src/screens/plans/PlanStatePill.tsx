import { Badge, type BadgeProps } from '@/design-system/components';
import type { PlanStatus } from '@/ipc/types';

const STATUS: Record<PlanStatus, { variant: BadgeProps['variant']; label: string }> = {
  forming: { variant: 'live', label: 'Forming' },
  running: { variant: 'live', label: 'Running' },
  paused: { variant: 'warn', label: 'Paused' },
  completed: { variant: 'neutral', label: 'Completed' },
  failed: { variant: 'err', label: 'Failed' },
};

export function PlanStatePill({ state, className }: { state: PlanStatus; className?: string }) {
  const s = STATUS[state];
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}
