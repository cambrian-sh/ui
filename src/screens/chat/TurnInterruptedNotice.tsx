import { cn } from '@/design-system/lib/utils';

/**
 * A turn that ended without a reply (ENG-2145).
 *
 * When a chat turn fails — the provider failed, the worker was killed, the kernel
 * restarted, a timeout — the kernel appends one message with role `interruption`
 * whose content is the plain sentence the person was told (core ENG-2124,
 * `domain.MessageRoleInterruption`). It is not something the assistant said, so it
 * is not drawn as a reply: it is a muted notice on the turn, centred in the
 * column, with the kernel's own sentence.
 */
export function TurnInterruptedNotice({
  text,
  timestamp,
  className,
}: {
  text: string;
  timestamp: string;
  className?: string;
}) {
  const at = new Date(timestamp);
  const time = Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div
      role="note"
      aria-label="This turn did not complete"
      className={cn(
        'mx-auto flex max-w-[90%] items-baseline gap-2 rounded-[var(--radius-md,6px)] border border-dashed',
        'border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--fg-muted)]',
        className,
      )}
    >
      <span className="shrink-0 font-medium text-[var(--fg-secondary)]">Turn did not complete</span>
      <span className="min-w-0">{text}</span>
      {time && <span className="ml-auto shrink-0 font-mono text-[10px]">{time}</span>}
    </div>
  );
}
