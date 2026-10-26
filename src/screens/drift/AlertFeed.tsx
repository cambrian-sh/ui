import { useMemo } from 'react';
import { RefreshCw, Scale } from 'lucide-react';
import type { Alert, DriftStats } from '@/ipc/types';
import { Badge, Button } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import {
  formatAgo,
  formatCount,
  formatDelta,
  formatWhen,
  medianLatencyMs,
} from './drift-format';

/** The client-side filters the header offers. */
export type AlertFilter = 'all' | 'later' | 'moved';

/**
 * The alert feed — the product's output, made visible.
 *
 * Two things about this header are deliberate and should survive review.
 *
 * **It says "polled", not "live".** `ListAlerts` is poll-only; alerts are not on
 * the operator event feed, and putting them there is a contract bump. A pulsing
 * live dot over a poll would be a lie, so the indicator states what it is. The
 * day push lands, this element upgrades in place.
 *
 * **The filter chips are client-side.** The RPC has no filtering beyond `limit`,
 * so these narrow what is already on screen and the copy never promises
 * server-side filtering at real volume.
 */
export function AlertFeed({
  alerts,
  stats,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onOpenLedger,
  polledAt,
  pollError,
  newSinceLastLook,
}: {
  alerts: readonly Alert[];
  stats: DriftStats | undefined;
  filter: AlertFilter;
  onFilter: (f: AlertFilter) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onOpenLedger: () => void;
  /** When the last SUCCESSFUL poll landed. Does not advance on a failed refresh. */
  polledAt: Date | null;
  /**
   * Why the most recent refresh failed, if it did.
   *
   * Carried here rather than replacing the feed, because the alerts on screen are
   * still the last thing the lane actually said. What must not happen is an
   * operator reading "no new alerts" off a list that stopped refreshing — on this
   * screen, silence is a finding, so a poll that is no longer running has to say
   * so where the freshness claim is made.
   */
  pollError?: string | null;
  /** Alerts raised since this operator last opened the feed. See below. */
  newSinceLastLook: number;
}) {
  const shown = useMemo(() => applyFilter(alerts, filter), [alerts, filter]);
  const later = useMemo(() => alerts.filter((a) => a.delta_days > 0).length, [alerts]);
  const moving = useMemo(() => alerts.filter((a) => a.slip_count >= 2).length, [alerts]);
  const median = useMemo(() => medianLatencyMs(alerts), [alerts]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex flex-none flex-wrap items-center gap-3 px-5 py-3.5 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <div className="flex items-baseline gap-2.5">
          <h1 className="type-page-title">Drift</h1>
          <span className="font-mono text-[11px] text-[var(--fg-muted)]">record lane</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1"
            style={
              pollError
                ? {
                    background: 'color-mix(in srgb, var(--status-warn) 10%, transparent)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-warn) 34%, transparent)',
                  }
                : {
                    background: 'var(--bg-surface)',
                    boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
                  }
            }
          >
            <RefreshCw
              size={12}
              strokeWidth={1.75}
              style={{ color: pollError ? 'var(--status-warn)' : 'var(--fg-muted)' }}
            />
            <span
              className="font-mono text-[11px]"
              style={{ color: pollError ? 'var(--status-warn)' : 'var(--fg-secondary)' }}
            >
              {pollError
                ? polledAt
                  ? `not refreshing · last good ${formatAgo(polledAt.toISOString())}`
                  : 'not refreshing'
                : polledAt
                  ? `polled ${formatAgo(polledAt.toISOString())}`
                  : 'not polled yet'}
            </span>
          </span>
          <span
            className="text-[11.5px]"
            style={{ color: pollError ? 'var(--status-warn)' : 'var(--fg-muted)' }}
            role={pollError ? 'status' : undefined}
          >
            {pollError
              ? `refresh is failing (${pollError}) — an absence of new alerts below is not a finding right now`
              : 'no live feed for alerts yet — this is a poll, and it says so'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>
            All owners
          </FilterChip>
          <FilterChip active={filter === 'later'} onClick={() => onFilter('later')}>
            Later than promised
          </FilterChip>
          <FilterChip active={filter === 'moved'} onClick={() => onFilter('moved')}>
            Moved more than once
          </FilterChip>
          <Button variant="secondary" size="sm" onClick={onOpenLedger}>
            Open the ledger
          </Button>
        </div>
      </header>

      {/* The four stats. Four, because a fifth would be a number nobody acts on. */}
      <div className="flex flex-none items-stretch gap-5 px-5 py-3 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <Stat
          label="Raised"
          value={formatCount(alerts.length)}
          /*
            The honest substitute for unread state. Alerts have no read/handled
            field, and a UI-local acknowledge flag would be wrong the moment
            there are two operators — but "since YOU last looked" is a claim
            about this client only, so local is exactly right for it.
          */
          note={newSinceLastLook > 0 ? `${newSinceLastLook} since you last looked` : 'nothing new since you last looked'}
        />
        <Divider />
        <Stat
          label="Later than promised"
          value={formatCount(later)}
          note="the direction customers feel"
          tone="var(--status-err)"
        />
        <Divider />
        <Stat
          label="Keeps moving"
          value={formatCount(moving)}
          note="records carrying ≥2 dates"
          tone="var(--status-warn)"
        />
        <Divider />
        <Stat
          label="Detection latency"
          value={median === null ? '—' : `${median}`}
          unit={median === null ? undefined : 'ms'}
          note={median === null ? 'not reported' : 'median, arrival → alert'}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          /*
            NOT a generic empty state. An empty alert list means one of two
            completely different things and this says which, then sends the
            operator to the surface that always answers it.
          */
          <div className="px-5 py-6">
            <p className="text-[13px] leading-[1.65] text-[var(--fg-secondary)]">
              {alerts.length === 0
                ? 'No drift alerts have been raised. That is not the same as “nothing was compared” — the ledger says which of the four outcomes actually happened.'
                : 'No alert matches this filter. The others are still there; the filter is narrowing what is on screen, not what the lane found.'}
            </p>
          </div>
        )}

        <ul className="flex flex-col">
          {shown.map((alert) => (
            <li key={alert.id}>
              <AlertRow alert={alert} selected={alert.id === selectedId} onSelect={() => onSelect(alert.id)} />
            </li>
          ))}
        </ul>

        {/*
          The permanent pointer to the ledger. Present whether or not there are
          alerts, because three alerts are never the whole picture and a feed
          that shows only the three is the feed every competitor ships.
        */}
        <div className="p-5">
          <div className="rounded-[11px] bg-[var(--bg-surface)] px-4 py-3.5">
            <div className="mb-1.5 flex items-center gap-2.5">
              <Scale size={15} strokeWidth={1.75} className="text-[var(--color-accent-400)]" />
              <span className="text-[13.5px] font-medium">
                {alerts.length === 0 ? 'An empty feed is not an answer' : `${alerts.length === 1 ? 'One alert is' : `${alerts.length} alerts are`} not the whole picture`}
              </span>
              <button
                type="button"
                onClick={onOpenLedger}
                className="ml-auto text-[12px] text-[var(--color-accent-400)] hover:underline"
              >
                Open the ledger →
              </button>
            </div>
            <p className="text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
              {stats && stats.available ? (
                <>
                  In the same window the lane compared {formatCount(stats.total)} commitments, found{' '}
                  {formatCount(stats.consistent)} consistent, could not compare{' '}
                  {formatCount(stats.unresolved.reduce((n, r) => n + r.count, 0))}, and{' '}
                  <strong className="font-medium text-[var(--fg-primary)]">
                    declined to compare {formatCount(stats.refused)}
                  </strong>{' '}
                  because the answer would have crossed a closed boundary.
                </>
              ) : (
                <>
                  What was compared, what could not be, and what the lane declined to compare all live on the ledger —
                  and “we found nothing” and “we could compare nothing” are different facts.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Newest first, which is the order the RPC already returns. */
export function applyFilter(alerts: readonly Alert[], filter: AlertFilter): Alert[] {
  switch (filter) {
    case 'later':
      return alerts.filter((a) => a.delta_days > 0);
    case 'moved':
      return alerts.filter((a) => a.slip_count >= 2);
    default:
      return [...alerts];
  }
}

function AlertRow({ alert, selected, onSelect }: { alert: Alert; selected: boolean; onSelect: () => void }) {
  const later = alert.delta_days > 0;
  const tone = later ? 'var(--status-err)' : 'var(--status-warn)';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'flex w-full flex-col gap-1 px-5 py-2.5 text-left transition-colors',
        'shadow-[inset_0_-1px_0_var(--border-subtle)] hover:bg-[var(--list-row-bg-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
      )}
      style={
        selected
          ? {
              background: 'color-mix(in srgb, var(--accent-bg) 13%, transparent)',
              boxShadow: 'inset 2px 0 0 var(--accent-bg)',
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5">
        {/* The signed delta comes first: it is the most load-bearing field. */}
        <span
          className="flex-none rounded-md px-2 py-0.5 font-mono text-[11px]"
          style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
        >
          {formatDelta(alert.delta_days)}
        </span>
        <span className="font-mono text-[13.5px] font-medium leading-none">{alert.record_key}</span>
        <span className="text-[12.5px] text-[var(--fg-secondary)]">{alert.owner}</span>
        {alert.slip_count >= 2 && <Badge variant="warn">moved {alert.slip_count}×</Badge>}
        {alert.superseded && <Badge variant="neutral">superseded</Badge>}
        <span className="ml-auto flex-none font-mono text-[10.5px] text-[var(--fg-muted)]">
          {formatWhen(alert.raised_at)}
        </span>
      </div>

      <div className="truncate text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">{alert.text}</div>

      {alert.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {alert.tags.map((t) => (
            <Badge key={t} variant="neutral">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

function Stat({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="type-label mb-1.5 leading-none text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[23px] font-medium tracking-[-0.02em]" style={tone ? { color: tone } : undefined}>
          {value}
          {unit && <span className="text-[13px] text-[var(--fg-muted)]">{unit}</span>}
        </span>
        <span className="text-[11.5px] text-[var(--fg-muted)]">{note}</span>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px flex-none bg-[var(--border-subtle)]" />;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-sm px-2.5 py-1 font-mono text-[10.5px] transition-colors',
        active
          ? 'text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_36%,transparent)]'
          : 'text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:text-[var(--fg-secondary)]',
      )}
    >
      {children}
    </button>
  );
}
