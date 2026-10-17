import { Link, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/design-system/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/ui/popover';
import { navLocation } from '@/design-system/components/cambrian/nav-rail';
import { badgeCount, formatTokenRate } from '@/lib/format';
import type { ConnectionStatus, Role } from '@/ipc/types';

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; tone: string; detail: string }> = {
  live: {
    label: 'Live',
    tone: 'var(--status-live)',
    detail: 'Connected. This screen updates as the kernel reports changes.',
  },
  reconnecting: {
    label: 'Reconnecting',
    tone: 'var(--status-warn)',
    detail: 'The connection dropped. What you see is the last known state until it returns.',
  },
  down: {
    label: 'Disconnected',
    tone: 'var(--status-err)',
    detail: 'Not connected to a kernel. Nothing on screen is current.',
  },
};

/**
 * The connection, as one honest object: a word and a dot in the bar, and the
 * details — endpoint, versions, the cursor — one click away instead of always
 * printed at low contrast.
 */
function ConnectionStatusButton({
  status,
  cursor,
  endpoint,
  kernelVersion,
  contractVersion,
  role,
}: {
  status: ConnectionStatus;
  cursor: number;
  endpoint: string;
  kernelVersion: string;
  contractVersion: string;
  role: Role | null;
}) {
  const copy = CONNECTION_COPY[status];
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex h-7 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2.5 text-[12.5px] text-[var(--fg-secondary)] transition-colors',
          'hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        )}
        aria-label={`Kernel connection: ${copy.label}`}
      >
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', status === 'live' && 'cambrian-live-pulse')}
          style={{ background: copy.tone }}
        />
        <span>{copy.label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-[var(--bg-surface)] p-0">
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg-primary)]">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: copy.tone }} />
            {copy.label}
          </div>
          <p className="mt-1 text-xs text-[var(--fg-secondary)]">{copy.detail}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-xs">
          <dt className="text-[var(--fg-muted)]">Endpoint</dt>
          <dd className="truncate font-mono text-[var(--fg-primary)]">{endpoint || '—'}</dd>
          <dt className="text-[var(--fg-muted)]">Role</dt>
          <dd className="capitalize text-[var(--fg-primary)]">{role ?? '—'}</dd>
          <dt className="text-[var(--fg-muted)]">Kernel</dt>
          <dd className="font-mono text-[var(--fg-primary)]">{kernelVersion || '—'}</dd>
          <dt className="text-[var(--fg-muted)]">Contract</dt>
          <dd className="font-mono text-[var(--fg-primary)]">{contractVersion || '—'}</dd>
          {/* The cursor is the honest answer to "is this screen current?" — the
              last seq folded, so a frozen number is visible as a frozen number. */}
          <dt className="text-[var(--fg-muted)]">Event cursor</dt>
          <dd className="font-mono text-[var(--fg-primary)]">seq {cursor.toLocaleString()}</dd>
        </dl>
        <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
          <Link to="/settings" className="text-xs">
            Connection settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AlertChip({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex h-7 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-[12.5px] tint-fill tint-ring hover:no-underline"
      style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
    >
      <AlertTriangle aria-hidden="true" size={13} strokeWidth={2} className="text-[var(--status-warn)]" />
      <span className="text-[var(--fg-primary)]">{children}</span>
    </Link>
  );
}

export interface HeaderBarProps {
  connection: ConnectionStatus;
  cursor: number;
  endpoint?: string;
  kernelVersion: string;
  contractVersion: string;
  /** 0 = aligned. Non-zero means commands may be rejected; say so. */
  contractSkew: number;
  /** Tokens per hour. Not money — see `formatTokenRate`. */
  spendRateTokens: number;
  /** `pending_hitl.length`. Drives the mobile inbox badge, absent at zero. */
  needsYouCount: number;
  /** Named only when it is NOT ok — otherwise this bar stays quiet. */
  degradedBreakers: number;
  role: Role | null;
  /** Phone layout: there is no sidebar, so the bar carries brand and inbox. */
  compact?: boolean;
}

export function HeaderBar({
  connection,
  cursor,
  endpoint = '',
  kernelVersion,
  contractVersion,
  contractSkew,
  spendRateTokens,
  needsYouCount,
  degradedBreakers,
  role,
  compact,
}: HeaderBarProps) {
  const count = badgeCount(needsYouCount);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const where = navLocation(pathname);

  return (
    <header
      aria-label={role ? `Cambrian Studio, ${role}` : 'Cambrian Studio'}
      className="flex h-[var(--header-h)] flex-none items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4"
    >
      {compact ? (
        <div className="flex flex-none items-center gap-2">
          <img src="/cambrian-mark.svg" alt="" aria-hidden="true" className="size-5" />
          <span className="text-[14px] font-semibold">Cambrian Studio</span>
        </div>
      ) : (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {where?.group && (
            <>
              <span className="truncate text-[var(--fg-muted)]">{where.group}</span>
              <ChevronRight aria-hidden="true" size={14} className="flex-none text-[var(--fg-muted)]" />
            </>
          )}
          <span className="truncate font-medium text-[var(--fg-primary)]">{where?.label ?? ''}</span>
        </nav>
      )}

      <div className="ml-auto flex flex-none items-center gap-2">
        {/* A version skew is the failure that quietly breaks commands, so it is
            never only a colour: it says what will happen. */}
        {contractSkew !== 0 && (
          <AlertChip to="/settings">Version mismatch — some commands may be rejected</AlertChip>
        )}
        {degradedBreakers > 0 && (
          <AlertChip to="/cost">
            {degradedBreakers} circuit breaker{degradedBreakers === 1 ? '' : 's'} tripping
          </AlertChip>
        )}

        {!compact && (
          <span className="px-1 text-[12.5px] tabular-nums text-[var(--fg-muted)]" title="Token spend rate">
            {formatTokenRate(spendRateTokens)}
          </span>
        )}

        <ConnectionStatusButton
          status={connection}
          cursor={cursor}
          endpoint={endpoint}
          kernelVersion={kernelVersion}
          contractVersion={contractVersion}
          role={role}
        />

        {compact && (
          <Link
            to="/inbox"
            aria-label={count ? `Inbox, ${count} need you` : 'Inbox'}
            className="relative flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]"
          >
            <Inbox aria-hidden="true" size={16} strokeWidth={1.75} />
            {count && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-warn)] px-1 text-[10px] font-semibold text-[var(--bg-canvas)]">
                {count}
              </span>
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
