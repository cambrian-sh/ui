import { cn } from '@/design-system/lib/utils';
import type { LogLevel, LogRecord } from '@/ipc/types';

const TONE: Record<LogLevel, string> = {
  debug: 'var(--fg-muted)',
  info: 'var(--fg-secondary)',
  warn: 'var(--status-warn)',
  error: 'var(--status-err)',
};

function clockOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  // Milliseconds matter when ordering three records inside the same second.
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * One record, as a row (`13a` §3.4).
 *
 * Attributes render dimmer than the message so the line reads as a sentence with
 * its evidence attached, rather than as a wall of key=value. A warn or error row
 * is tinted — at this density a pill alone is something the eye has to hunt for.
 */
export function LogRow({
  record,
  selected,
  onClick,
}: {
  record: LogRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const tone = TONE[record.level];
  const alarming = record.level === 'warn' || record.level === 'error';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-baseline gap-3 px-4 py-1 text-left font-mono text-[11.5px] leading-[1.55]',
        'hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        alarming && 'tint-wash',
        selected && 'bg-[var(--list-row-bg-selected)] shadow-[inset_3px_0_0_var(--color-accent-400)]',
      )}
      style={alarming ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <span className="flex-none tabular-nums text-[10.5px] text-[var(--fg-muted)]">
        {clockOf(record.at_unix_ms)}
      </span>
      <span
        className="type-label flex-none"
        style={{ color: tone, width: 44 }}
      >
        {record.level}
      </span>
      <span
        className="flex-none truncate text-[10.5px] text-[var(--color-accent-400)]"
        style={{ width: 96 }}
      >
        {record.component}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[var(--fg-primary)]">{record.message}</span>
        {record.attrs.map((a) => (
          <span key={a.key} className="ml-2 text-[var(--fg-muted)]">
            {a.key}=<span className="text-[var(--fg-secondary)]">{a.value}</span>
          </span>
        ))}
        {/* Never let a clipped value read as the whole one. */}
        {record.truncated && (
          <span className="ml-2 text-[10px] text-[var(--status-warn)]">clipped</span>
        )}
      </span>
    </button>
  );
}
