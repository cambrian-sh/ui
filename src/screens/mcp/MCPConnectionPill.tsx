import { cn } from '@/design-system/lib/utils';

interface MCPConnectionPillProps {
  state: string;
}

const STATE_STYLES: Record<string, { bg: string; text: string }> = {
  Up: { bg: 'bg-[var(--status-ok)]/10', text: 'text-[var(--status-ok)]' },
  Reconnecting: { bg: 'bg-[var(--status-warn)]/10', text: 'text-[var(--status-warn)]' },
  Down: { bg: 'bg-[var(--status-err)]/10', text: 'text-[var(--status-err)]' },
};

export function MCPConnectionPill({ state }: MCPConnectionPillProps) {
  const style = STATE_STYLES[state] ?? STATE_STYLES.Down;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        style.bg,
        style.text,
      )}
    >
      {state}
    </span>
  );
}
