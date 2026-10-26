import { useMemo } from 'react';
import { ChevronRight, Plug, X } from 'lucide-react';
import type { DriftStats, Refusal } from '@/ipc/types';
import { Badge } from '@/design-system/components';
import { describeReason, formatCount } from './drift-format';

/**
 * The outcome ledger — what the lane did with every commitment it saw.
 *
 * This is the differentiated surface. Every competitor can show "here is what we
 * found"; almost none can show "here is what we REFUSED to answer, and why". It
 * is not a dashboard you visit when curious — it is the surface that always says
 * which of the four outcomes happened, which is why the feed carries a permanent
 * card pointing at it.
 *
 * Two invariants override any design preference here:
 *
 * 1. **Silence has two meanings.** "No drift found" and "nothing could be
 *    compared" are different facts, kept apart by the backend the whole way
 *    through. A UI that renders an empty list for both throws that away at the
 *    last step, which is where every other product in this category loses the
 *    argument. So there is no empty state on this page.
 *
 * 2. **`available=false` is never a tally of zeros.** A deployment with no
 *    reconciler and a deployment with nothing wrong produce identical numbers.
 *    When `available` is false the not-configured card is the ENTIRE page — the
 *    four outcome cards, the reason list and the refusals do not render at all.
 *    Not a banner above zeros.
 */
export function OutcomeLedger({
  stats,
  refusals,
  onFilterReason,
}: {
  stats: DriftStats;
  refusals: readonly Refusal[];
  /** Drill into one unresolved reason. */
  onFilterReason?: (reason: string) => void;
}) {
  const unresolvedTotal = useMemo(
    () => stats.unresolved.reduce((n, r) => n + r.count, 0),
    [stats.unresolved],
  );

  // Invariant 2. The whole page, not a banner.
  if (!stats.available) return <NotConfigured />;

  const bar = proportions(stats.consistent, stats.drift, unresolvedTotal, stats.refused);

  return (
    <div className="flex flex-col">
      <header className="flex-none px-6 py-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h1 className="type-page-title">
            What the lane did with {formatCount(stats.total)} commitment{stats.total === 1 ? '' : 's'}
          </h1>
          <span className="ml-auto font-mono text-[11px] text-[var(--fg-muted)]">since this kernel started</span>
        </div>
        <p className="text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
          Four outcomes, and none of them is an empty list. This page exists so that “we found nothing” and “we could
          compare nothing” can never look the same.
        </p>
      </header>

      <div className="flex flex-col gap-4 px-6 py-4">
        {/* The four outcomes. */}
        <div className="grid flex-none grid-cols-2 gap-2.5 xl:grid-cols-4">
          <OutcomeCard
            tone="idle"
            label="consistent"
            value={stats.consistent}
            note="Compared, and they agree. Nothing to do."
          />
          <OutcomeCard tone="err" label="drift" value={stats.drift} ringed>
            Compared, and they disagree. <strong className="font-medium text-[var(--fg-primary)]">Act on these.</strong>
          </OutcomeCard>
          <OutcomeCard tone="warn" label="unresolved" value={unresolvedTotal} ringed>
            Could not be compared. {stats.unresolved.length === 1 ? 'One' : `${stats.unresolved.length} different`}{' '}
            problem{stats.unresolved.length === 1 ? '' : 's'} — see below.
          </OutcomeCard>
          {/*
            `refused` takes the ACCENT, never the error tone. It is the product
            declining to cross a classification boundary, which is the thing
            being sold — styling it as a fault would invite someone to "fix" it.
          */}
          <OutcomeCard tone="live" label="refused" value={stats.refused} ringed>
            <strong className="font-medium text-[var(--fg-primary)]">Working as intended.</strong> Not an error — do not
            “fix”.
          </OutcomeCard>
        </div>

        {/* Proportion, as this deployment's own shape. */}
        <div>
          <div
            className="flex h-3 flex-none overflow-hidden rounded-md"
            role="img"
            aria-label={`${formatCount(stats.consistent)} consistent, ${formatCount(stats.drift)} drift, ${formatCount(unresolvedTotal)} unresolved, ${formatCount(stats.refused)} refused`}
          >
            <Segment pct={bar.consistent} color="var(--color-neutral-800)" />
            <Segment pct={bar.drift} color="var(--status-err)" />
            <Segment pct={bar.unresolved} color="var(--status-warn)" />
            <Segment pct={bar.refused} color="var(--color-accent-700)" />
          </div>
          {/*
            The benchmark figure and this deployment's figures are kept apart on
            purpose. One is the harness; the other is the install, and a page
            that blurs them is quoting someone else's precision as its own.
          */}
          <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
            Precision on the planted-contradiction benchmark was 0.889, with zero false alerts across 136 noise
            messages. The bar above is this deployment; that figure is the harness — worth keeping distinct.
          </p>
        </div>

        {/* The unresolved reasons, separated and owner-labelled. */}
        <section className="flex-none">
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="type-label leading-none text-[var(--fg-muted)]">
              The {formatCount(unresolvedTotal)} unresolved, by reason
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
              different owners, different weeks — never one grey chip
            </span>
          </div>

          {stats.unresolved.length === 0 ? (
            <p className="rounded-[10px] bg-[var(--bg-surface)] px-4 py-3.5 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
              Every commitment the lane saw could be compared. That is a real finding, not an empty list — it means the
              export reached each order that was promised against.
            </p>
          ) : (
            <ul className="flex flex-col gap-px">
              {stats.unresolved.map((row, i) => {
                const copy = describeReason(row.reason);
                const first = i === 0;
                const last = i === stats.unresolved.length - 1;
                return (
                  <li key={row.reason}>
                    <button
                      type="button"
                      onClick={() => onFilterReason?.(row.reason)}
                      disabled={!onFilterReason}
                      className={[
                        'flex w-full items-start gap-3 bg-[var(--bg-surface)] px-4 py-3 text-left',
                        'transition-colors hover:bg-[var(--bg-elevated)] disabled:hover:bg-[var(--bg-surface)]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
                        first ? 'rounded-t-[10px]' : '',
                        last ? 'rounded-b-[10px]' : '',
                      ].join(' ')}
                    >
                      <span
                        className="w-11 flex-none text-right font-mono text-[17px] leading-tight"
                        style={{ color: copy.known ? 'var(--status-warn)' : 'var(--fg-secondary)' }}
                      >
                        {formatCount(row.count)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12.5px] leading-none text-[var(--fg-primary)]">
                            {row.reason}
                          </span>
                          <Badge variant={copy.known ? 'neutral' : 'warn'}>{copy.owner}</Badge>
                        </span>
                        <span className="block text-[12px] leading-[1.55] text-[var(--fg-secondary)]">
                          {copy.sentence}
                        </span>
                      </span>
                      {onFilterReason && (
                        <ChevronRight size={13} strokeWidth={1.75} className="mt-1 flex-none text-[var(--fg-muted)]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            The line that earns the whole section. Two reasons at the same count
            are completely different work — one is an integration ticket this
            week, the other is a naming decision.
          */}
          {stats.unresolved.length > 1 && (
            <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
              {tiedReasonSentence(stats.unresolved)} Summing them into “{formatCount(unresolvedTotal)} unresolved”
              destroys the only actionable part of this page.
            </p>
          )}

          {/*
            A stated gap rather than a dead row. `GetDriftStats` returns COUNTS
            keyed by reason and nothing else — there is no RPC that lists the
            commitments behind a count — so a reason cannot be opened into the 41
            records it stands for. Saying so beats a chevron that does nothing.
          */}
          {!onFilterReason && stats.unresolved.length > 0 && (
            <p className="mt-1.5 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
              These counts cannot be opened into the commitments behind them: the lane reports the tally by reason and
              has no RPC that lists the underlying rows. Knowing which 41 orders the export never carried needs that
              call.
            </p>
          )}
        </section>

        {/* Refusals, in the same frame — not a debug panel. */}
        <section className="flex-none">
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="type-label leading-none text-[var(--fg-muted)]">
              The {formatCount(stats.refused)} refusal{stats.refused === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--color-accent-400)]">this is the product working</span>
          </div>

          <div
            className="rounded-[11px] px-4 py-3.5"
            style={{
              background: 'color-mix(in srgb, var(--accent-bg) 7%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-bg) 26%, transparent)',
            }}
          >
            <p className="mb-3 text-[12.5px] leading-[1.65] text-[var(--fg-secondary)]">
              {stats.refused === 0 ? (
                <>
                  Nothing was declined in this window. When something is, it appears here rather than in a debug panel —
                  a comparison the lane <strong className="font-medium text-[var(--fg-primary)]">declined</strong>{' '}
                  because the alert would have carried material across a closed classification boundary.
                </>
              ) : (
                <>
                  {formatCount(stats.refused)} comparison{stats.refused === 1 ? ' was' : 's were'} possible and{' '}
                  <strong className="font-medium text-[var(--fg-primary)]">declined</strong>, because the alert would
                  have carried material across a closed classification boundary. Almost nobody else in this category can
                  show you this list — which is exactly why it belongs on the page.
                </>
              )}
            </p>

            {refusals.length > 0 && <RefusalGroups refusals={refusals} />}

            <p className="mt-3 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
              If any of these should have produced an alert, the fix is a scope rule, not a setting here — and that is
              the honest answer rather than a toggle that quietly widens a boundary somebody drew on purpose.
            </p>
          </div>
        </section>

        {/* The process-lifetime caveat, stated on the page rather than in a doc. */}
        <div
          className="flex-none rounded-[11px] px-4 py-3"
          style={{
            background: 'color-mix(in srgb, var(--status-warn) 6%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-warn) 24%, transparent)',
          }}
        >
          <p className="text-[11.5px] leading-[1.65] text-[var(--fg-secondary)]">
            <strong className="font-medium text-[var(--fg-primary)]">
              These four counts are process-lifetime, not durable.
            </strong>{' '}
            They reset when the kernel restarts, while the lane keeps reporting itself as available — so this page is a
            window on the current process, not a trend, and it says so rather than implying a history it does not have.
            The alerts themselves are durable; the tally is not.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Refusals grouped by the boundary tag pair they could not cross.
 *
 * Grouped rather than listed because the actionable unit is the BOUNDARY, not
 * the individual refusal: four refusals across one tag pair is one policy
 * conversation, and four across four pairs is four.
 */
function RefusalGroups({ refusals }: { refusals: readonly Refusal[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, { boundary: string[]; reason: string; count: number }>();
    for (const r of refusals) {
      const key = [...r.boundary].sort().join(' × ') || '(unnamed boundary)';
      const existing = by.get(key);
      if (existing) existing.count += 1;
      else by.set(key, { boundary: r.boundary, reason: r.reason, count: 1 });
    }
    return [...by.values()].sort((a, b) => b.count - a.count);
  }, [refusals]);

  return (
    <ul className="flex flex-col gap-px">
      {groups.map((g, i) => (
        <li
          key={g.boundary.join('|') || i}
          className={[
            'flex items-center gap-3 bg-[var(--bg-canvas)] px-3.5 py-2.5',
            i === 0 ? 'rounded-t-[9px]' : '',
            i === groups.length - 1 ? 'rounded-b-[9px]' : '',
          ].join(' ')}
        >
          <span className="w-5 flex-none font-mono text-[16px] leading-none text-[var(--color-accent-400)]">
            {g.count}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              {g.boundary.length > 0 ? (
                g.boundary.map((t, j) => (
                  <span key={t} className="flex items-center gap-1.5">
                    {j > 0 && <X size={10} strokeWidth={2} className="text-[var(--fg-muted)]" />}
                    <Badge variant="neutral">{t}</Badge>
                  </span>
                ))
              ) : (
                <Badge variant="warn">boundary not named</Badge>
              )}
            </div>
            <div className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">{g.reason}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * `available = false` — the whole page.
 *
 * Nothing is being compared here, which is NOT "nothing was found". An operator
 * must never be able to read "0 issues" off a product that was never switched on.
 */
export function NotConfigured() {
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <header>
        <h1 className="type-page-title mb-1">Drift</h1>
        <p className="type-page-description">
          The state this page must never render as zeros.
        </p>
      </header>

      <div
        className="rounded-[11px] bg-[var(--bg-surface)] px-5 py-4"
        style={{ boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <Plug size={16} strokeWidth={1.75} className="text-[var(--fg-muted)]" />
          <span className="text-sm font-medium">No reconciler in this deployment</span>
          <Badge variant="neutral" className="ml-auto">
            available = false
          </Badge>
        </div>
        <p className="mb-3 text-[12.5px] leading-[1.65] text-[var(--fg-secondary)]">
          Nothing is being compared here —{' '}
          <strong className="font-medium text-[var(--fg-primary)]">not “nothing was found”</strong>. The four outcome
          cards, the reasons and the refusals are all absent from this page rather than showing zeroes, because a tally
          of zeros beside an absent detector is the one thing this field exists to prevent.
        </p>
        <p className="text-[11.5px] leading-[1.65] text-[var(--fg-muted)]">
          A reconciler needs a record store — the lane reports itself unavailable when this deployment has no Postgres
          behind it. That is a complete configuration, not a missing piece.
        </p>
      </div>
    </div>
  );
}

/** Which reasons are tied, named in the sentence rather than described abstractly. */
function tiedReasonSentence(rows: readonly { reason: string; count: number }[]): string {
  const byCount = new Map<number, string[]>();
  for (const r of rows) byCount.set(r.count, [...(byCount.get(r.count) ?? []), r.reason]);
  const tie = [...byCount.entries()].find(([, names]) => names.length > 1);
  if (tie) {
    const [count, names] = tie;
    return `${names[0]} and ${names[1]} are the same number — ${formatCount(count)} each — and completely different work.`;
  }
  return 'Two reasons at the same count would be the same number and completely different work.';
}

function proportions(consistent: number, drift: number, unresolved: number, refused: number) {
  const total = consistent + drift + unresolved + refused;
  if (total <= 0) return { consistent: 0, drift: 0, unresolved: 0, refused: 0 };
  const pct = (n: number) => (n / total) * 100;
  return {
    consistent: pct(consistent),
    drift: pct(drift),
    unresolved: pct(unresolved),
    refused: pct(refused),
  };
}

function Segment({ pct, color }: { pct: number; color: string }) {
  if (pct <= 0) return null;
  return <div style={{ width: `${pct}%`, background: color }} className="h-full" />;
}

function OutcomeCard({
  tone,
  label,
  value,
  note,
  ringed,
  children,
}: {
  tone: 'idle' | 'err' | 'warn' | 'live';
  label: string;
  value: number;
  note?: string;
  ringed?: boolean;
  children?: React.ReactNode;
}) {
  const v = tone === 'idle' ? 'var(--status-idle)' : `var(--status-${tone})`;
  const labelColour = tone === 'live' ? 'var(--color-accent-400)' : tone === 'idle' ? 'var(--fg-muted)' : v;
  return (
    <div
      className="rounded-[11px] px-4 py-3.5"
      style={
        ringed
          ? {
              background: `color-mix(in srgb, ${v} 8%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${v} 30%, transparent)`,
            }
          : { background: 'var(--bg-surface)' }
      }
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: v }} />
        <span
          className="type-label leading-none"
          style={{ color: labelColour }}
        >
          {label}
        </span>
      </div>
      <div className="mb-1 text-[25px] font-medium tracking-[-0.02em]">{formatCount(value)}</div>
      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">{children ?? note}</p>
    </div>
  );
}
