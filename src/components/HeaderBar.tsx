import { Link } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { cn } from '@/design-system/lib/utils';
import { badgeCount, formatTokenRate } from '@/lib/format';
import type { ConnectionStatus, Role } from '@/ipc/types';

/**
 * The connection, as one object rather than eight identical dots.
 *
 * The old status strip drew connection, kernel, LTM, plans, queue, breaker,
 * spend and backlog as eight dots of the same size and shape, so "everything is
 * fine" and "something is burning" were the same picture. Its contents moved to
 * where each one is actually read: connection and cursor here, plans onto the
 * rail, spend into this bar, breaker into Cost & Energy — and back up here only
 * when it stops being `ok`.
 */
function ConnectionPill({
  status,
  cursor,
}: {
  status: ConnectionStatus;
  cursor: number;
}) {
  const tone =
    status === 'live'
      ? 'var(--status-live)'
      : status === 'reconnecting'
        ? 'var(--status-warn)'
        : 'var(--status-err)';

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-[11px] py-[5px] tint-fill tint-ring"
      style={{ '--tint': tone } as React.CSSProperties}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-[7px] shrink-0 rounded-full',
          status === 'live' && 'cambrian-live-pulse',
        )}
        style={{ background: tone }}
      />
      <span className="font-mono text-[11px]" style={{ color: tone }}>
        {status}
        {/* The cursor is the honest answer to "is this screen current?" — it is
            the last seq folded, so a frozen number is visible as a frozen number. */}
        {status === 'live' && (
          <span className="text-[var(--fg-muted)]">
            {' · seq '}
            {cursor.toLocaleString()}
          </span>
        )}
      </span>
    </div>
  );
}

export interface HeaderBarProps {
  connection: ConnectionStatus;
  cursor: number;
  kernelVersion: string;
  contractVersion: string;
  /** 0 = aligned. Non-zero means commands may be rejected; say so. */
  contractSkew: number;
  /** Tokens per hour. Not money — see `formatTokenRate`. */
  spendRateTokens: number;
  /** `pending_hitl.length`. Drives the badge, which is absent at zero. */
  needsYouCount: number;
  /** Named only when it is NOT ok — otherwise this bar stays quiet. */
  degradedBreakers: number;
  role: Role | null;
  compact?: boolean;
  /**
   * Sign out of the kernel (contract 0099 `Logout`). Absent = no sign-out
   * control: the Shell passes it only when the kernel advertises `logout`.
   */
  onSignOut?: () => void;
}

export function HeaderBar({
  connection,
  cursor,
  kernelVersion,
  contractVersion,
  contractSkew,
  spendRateTokens,
  needsYouCount,
  degradedBreakers,
  role,
  compact,
  onSignOut,
}: HeaderBarProps) {
  const count = badgeCount(needsYouCount);

  return (
    <header
      className="flex h-[var(--header-h)] flex-none items-center gap-4 bg-[var(--bg-surface)] pl-4 pr-3.5 shadow-[inset_0_-1px_0_var(--border-subtle)]"
    >
      {/* Fixed width so the brand block lines up with the rail beneath it. */}
      <div
        className="flex flex-none items-center gap-2"
        style={{ width: compact ? undefined : 'var(--nav-rail-w)' }}
      >
        <span
          aria-hidden="true"
          className="size-4 flex-none rounded-full shadow-[inset_0_0_0_1.6px_var(--accent-bg)]"
        />
        <span className="text-[14px] font-medium tracking-[-0.01em]">Cambrian</span>
      </div>

      <ConnectionPill status={connection} cursor={cursor} />

      {!compact && (
        <span className="truncate font-mono text-[11px] text-[color-mix(in_srgb,var(--fg-muted)_40%,transparent)]">
          kernel {kernelVersion || '—'} · contract {contractVersion || '—'}
        </span>
      )}

      {/* A version skew is the failure that quietly breaks commands, so it is
          never only a colour: it says what will happen. */}
      {contractSkew !== 0 && (
        <Link
          to="/settings"
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] tint-fill tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">contract skew — some commands may be rejected</span>
        </Link>
      )}

      {degradedBreakers > 0 && (
        <Link
          to="/cost"
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] tint-fill tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            {degradedBreakers} breaker{degradedBreakers === 1 ? '' : 's'} tripping
          </span>
        </Link>
      )}

      <div className="ml-auto flex flex-none items-center gap-3">
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {formatTokenRate(spendRateTokens)}
        </span>

        <Link
          to="/inbox"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] transition-colors',
            'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
            count
              ? 'border-[color-mix(in_srgb,var(--status-warn)_40%,transparent)] text-[var(--fg-primary)]'
              : 'border-[var(--button-secondary-border)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
          )}
        >
          <Inbox aria-hidden="true" size={15} strokeWidth={1.75} />
          <span>Inbox</span>
          {/* Never a zero badge: it advertises an empty queue as though it were work. */}
          {count && (
            <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] bg-[var(--status-warn)] px-1 font-mono text-[10.5px] font-semibold text-[var(--bg-canvas)]">
              {count}
            </span>
          )}
        </Link>

        {role && (
          <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            {role}
          </span>
        )}

        {role && onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-sm px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
