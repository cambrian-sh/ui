import { Clock, EyeOff, PlugZap, Share2 } from 'lucide-react';
import type { KindPushStatus, SourceCoverage } from '@/ipc/types';
import { Badge } from '@/design-system/components';
import {
  describeHorizon,
  formatAgo,
  formatCount,
  pushConsequence,
  pushFreshness,
} from './drift-format';

/**
 * Coverage — the denominator, stated before a customer measures recall against it.
 *
 * The likeliest way this product loses trust is a customer finding a message it
 * never saw and concluding detection is unreliable, when the lane was never
 * connected to that channel. So the page leads with what CANNOT be reached rather
 * than with what can, and it is a page an operator can hand to the customer.
 *
 * Two shapes of silence are kept apart throughout:
 *
 * - **No connector has reported** (`sources` empty). Coverage is process-lifetime
 *   and pushed, so this means no daemon is currently reporting — NOT that coverage
 *   is zero. Rendering stat cards of zeros here would be the same failure as
 *   rendering `available=false` as a clean bill of health on the ledger.
 * - **A record kind has never been pushed.** Not representable: `GetPushStatus` is
 *   driven off the record rows, so a kind configured but never pushed once has no
 *   rows and no entry. The list says it is not exhaustive rather than implying it.
 */
export function CoveragePane({
  sources,
  pushes,
  loaded,
}: {
  sources: readonly SourceCoverage[] | undefined;
  pushes: readonly KindPushStatus[] | undefined;
  /** Whether both reads have landed. Distinguishes "still loading" from "empty". */
  loaded: boolean;
}) {
  const hasSources = (sources?.length ?? 0) > 0;

  return (
    <div className="flex flex-col">
      <header className="flex-none px-6 py-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h1 className="text-lg tracking-[-0.01em]">What the lane can see</h1>
          <button
            type="button"
            onClick={() => copyCoverage(sources ?? [], pushes ?? [])}
            className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[var(--color-accent-400)] hover:underline"
          >
            <Share2 size={13} strokeWidth={1.75} />
            Share this with the customer
          </button>
        </div>
        <p className="text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
          Detection is only ever as good as its input. Everything on this page is a limit, not a feature — and printing
          it here is cheaper than defending a missed message later.
        </p>
      </header>

      <div className="flex flex-col gap-3.5 px-6 py-4">
        {/* Lead with what cannot be reached. */}
        <div
          className="rounded-[11px] px-4 py-4"
          style={{
            background: 'color-mix(in srgb, var(--status-warn) 7%, transparent)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--status-warn) 30%, transparent)',
          }}
        >
          <div className="mb-2.5 flex items-center gap-2.5" style={{ color: 'var(--status-warn)' }}>
            <EyeOff size={15} strokeWidth={1.75} />
            <span className="text-sm font-medium text-[var(--fg-primary)]">What this connection cannot reach</span>
          </div>

          {hasSources ? (
            <div className="flex flex-col gap-3">
              {sources!.map((c) => (
                <div key={c.source}>
                  {sources!.length > 1 && (
                    <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                      {c.source}
                    </div>
                  )}
                  {/*
                    The connector's OWN sentences, carried verbatim. Re-deriving
                    them here from the booleans would be a second place for the
                    same claim to live, and the connector is the one that knows.
                  */}
                  <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.6] text-[var(--fg-secondary)]">
                    {c.limits.length > 0 ? (
                      c.limits.map((l) => (
                        <li key={l} className="flex gap-2">
                          <span className="flex-none text-[var(--status-warn)]">·</span>
                          <span>{l}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-[var(--fg-muted)]">
                        This connector reported no limits, which is itself worth checking — every real source has at
                        least one.
                      </li>
                    )}
                  </ul>
                </div>
              ))}
              <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
                And anything after the last successful push: a record kind that has stopped pushing is a silent hole in
                detection, because every promise about it becomes unresolvable rather than wrong.
              </p>
            </div>
          ) : (
            <p className="text-[12.5px] leading-[1.6] text-[var(--fg-secondary)]">
              No connector is reporting its coverage, so this console cannot state what is reachable.{' '}
              <strong className="font-medium text-[var(--fg-primary)]">
                That is not the same as “everything is covered”
              </strong>{' '}
              — it is the absence of the statement, and it is the one thing you should not present to a customer as a
              clean answer.
            </p>
          )}
        </div>

        {/* Connected sources. */}
        <section>
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="font-mono text-[9.5px] uppercase leading-none tracking-[0.12em] text-[var(--fg-muted)]">
              Connected
            </span>
            {hasSources && (
              <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
                coverage is reported by the connector, not measured here
              </span>
            )}
          </div>

          {!hasSources ? (
            <NoConnector loaded={loaded} />
          ) : (
            <div className="flex flex-col gap-2.5">
              {sources!.map((c) => (
                <SourceCard key={c.source} coverage={c} />
              ))}
            </div>
          )}
        </section>

        {/* Last successful push per record kind. */}
        <section>
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="font-mono text-[9.5px] uppercase leading-none tracking-[0.12em] text-[var(--fg-muted)]">
              Last successful push, per record kind
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
              a stale kind is a silent hole in detection
            </span>
          </div>

          {(pushes?.length ?? 0) === 0 ? (
            <p className="rounded-[10px] bg-[var(--bg-surface)] px-4 py-3.5 text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
              {loaded
                ? 'No import has been recorded. Nothing has been pushed into the record lane, so every commitment that names an order is unresolvable by construction.'
                : 'Reading the import history…'}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-px">
                {pushes!.map((p, i) => (
                  <PushRow key={p.kind} push={p} first={i === 0} last={i === pushes!.length - 1} />
                ))}
              </ul>
              {/*
                The list is not exhaustive and must not read as though it were.
                GetPushStatus is driven off the record rows, so a kind configured
                but never pushed once has no rows and therefore no entry — the
                exact case the design wanted to draw as `invoices · never`.
              */}
              <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
                This lists kinds that have been pushed at least once. A kind configured in the exporter but never pushed
                at all has no rows here and no line above —{' '}
                <strong className="font-medium text-[var(--fg-secondary)]">
                  an absence you cannot see from this page
                </strong>
                . Confirming that needs the lane to carry its configured kinds, which it does not today.
              </p>
            </>
          )}
        </section>

        {/* The backfill warning — belongs in the interface, not the docs. */}
        <div
          className="rounded-[11px] px-4 py-3.5"
          style={{
            background: 'color-mix(in srgb, var(--accent-bg) 7%, transparent)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent-bg) 24%, transparent)',
          }}
        >
          <div className="mb-2 flex items-center gap-2.5">
            <Clock size={15} strokeWidth={1.75} className="text-[var(--color-accent-400)]" />
            <span className="text-[13.5px] font-medium">If you backfill, read this first</span>
          </div>
          <p className="text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
            Reconciliation compares a historical promise against{' '}
            <strong className="font-medium text-[var(--fg-primary)]">today&rsquo;s</strong> record, not the record as it
            stood at the time. So a backfill will raise more alerts than there were real problems — a promise that was
            accurate in May, against a date that has legitimately moved twice since, reads as drift. This is stated here
            and beside every backfill trigger, because it belongs in the interface and not in the documentation.
          </p>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ coverage }: { coverage: SourceCoverage }) {
  const horizon = describeHorizon(coverage);

  return (
    <div className="rounded-[11px] bg-[var(--bg-surface)] px-4 py-3.5">
      <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
        <span className="font-mono text-[13px] font-medium">{coverage.source}</span>
        {coverage.connector && (
          <span className="font-mono text-[11px] text-[var(--fg-muted)]">via {coverage.connector}</span>
        )}
        {/*
          The age is not decoration. Coverage is computed at daemon start, so
          rendering it without one is a claim this console cannot support.
        */}
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          reported {formatAgo(coverage.reported_at)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat
          label="Channels"
          value={formatCount(coverage.channel_count)}
          note={coverage.discovery_api ? 'invited' : 'invited · public only'}
        />
        <Stat
          label="Horizon"
          value={horizon.value}
          unit={horizon.kind === 'bounded' ? ' d' : undefined}
          note={coverage.plan_tier ? `plan tier: ${coverage.plan_tier}` : horizon.note}
          tone={horizon.kind === 'unknown' ? 'var(--status-warn)' : undefined}
        />
        <Stat
          label="Discovery API"
          value={coverage.discovery_api ? 'yes' : 'no'}
          note={coverage.discovery_api ? 'private + DMs reachable' : 'private + DMs unreachable'}
          tone={coverage.discovery_api ? undefined : 'var(--status-warn)'}
        />
      </div>

      <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">{horizon.note}</p>

      {coverage.invited_channels.length > 0 && (
        <details className="mt-2.5">
          <summary className="cursor-pointer text-[11.5px] text-[var(--fg-secondary)]">
            The {formatCount(coverage.channel_count)} channel
            {coverage.channel_count === 1 ? '' : 's'} this covers
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {coverage.invited_channels.map((ch) => (
              <Badge key={ch} variant="neutral">
                {ch}
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PushRow({ push, first, last }: { push: KindPushStatus; first: boolean; last: boolean }) {
  const freshness = pushFreshness(push.received_at);
  const consequence = pushConsequence(push.kind, freshness);
  const tone =
    freshness === 'cold' ? 'var(--status-err)' : freshness === 'stale' ? 'var(--status-warn)' : 'var(--status-live)';

  return (
    <li
      className={[
        'flex flex-wrap items-center gap-3 px-3.5 py-3',
        first ? 'rounded-t-[10px]' : '',
        last ? 'rounded-b-[10px]' : '',
      ].join(' ')}
      style={{
        background:
          freshness === 'fresh' ? 'var(--bg-surface)' : `color-mix(in srgb, ${tone} 7%, transparent)`,
        boxShadow: freshness === 'fresh' ? undefined : `inset 0 0 0 1px color-mix(in srgb, ${tone} 26%, transparent)`,
      }}
    >
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: tone }} />
      <span className="min-w-0 flex-1 font-mono text-[12.5px] leading-none">{push.kind}</span>
      <span className="flex-none font-mono text-[12px] leading-none" style={{ color: freshness === 'fresh' ? 'var(--fg-secondary)' : tone }}>
        {formatAgo(push.received_at)}
      </span>
      {/*
        The consequence, not the timestamp. "2 days ago" is a fact nobody acts
        on; "every promise about shipping dates has been unresolvable since" is.
      */}
      <span
        className="w-full text-[11.5px] leading-[1.5] sm:w-[240px] sm:text-right"
        style={{ color: consequence ? tone : 'var(--fg-muted)' }}
      >
        {consequence || `${formatCount(push.live_records)} live · ${formatCount(push.record_count)} in that push`}
      </span>
    </li>
  );
}

/**
 * No connector reporting.
 *
 * Deliberately not stat cards of zeros: coverage is pushed and process-lifetime,
 * so this says which of the two silences it is rather than presenting an absent
 * connector as a measured result.
 */
function NoConnector({ loaded }: { loaded: boolean }) {
  return (
    <div
      className="rounded-[11px] bg-[var(--bg-surface)] px-4 py-4"
      style={{ boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <PlugZap size={15} strokeWidth={1.75} className="text-[var(--fg-muted)]" />
        <span className="text-sm font-medium">{loaded ? 'No connector is reporting coverage' : 'Reading coverage…'}</span>
      </div>
      {loaded && (
        <p className="text-[12.5px] leading-[1.65] text-[var(--fg-secondary)]">
          Coverage is <strong className="font-medium text-[var(--fg-primary)]">pushed</strong> by each connector and
          held for the life of this kernel process, so an empty answer means no daemon has reported since it started —
          not that nothing is connected, and not that everything is. A connector re-reports on every reconnect, so this
          usually fills in on its own shortly after a restart.
        </p>
      )}
    </div>
  );
}

/**
 * The coverage statement, as text an operator hands to a customer.
 *
 * The limits lead. A coverage document whose first line is a channel count reads
 * as a capability claim; the same document led by what it cannot see reads as
 * what it is.
 */
function copyCoverage(sources: readonly SourceCoverage[], pushes: readonly KindPushStatus[]) {
  const lines: string[] = ['What this deployment can and cannot see', ''];

  if (sources.length === 0) {
    lines.push('No connector is currently reporting its coverage, so this deployment cannot state what it reaches.');
  }

  for (const c of sources) {
    const h = describeHorizon(c);
    lines.push(`${c.source}${c.connector ? ` (via ${c.connector})` : ''} — reported ${formatAgo(c.reported_at)}`);
    for (const l of c.limits) lines.push(`  - ${l}`);
    lines.push(`  - Channels covered: ${c.channel_count}`);
    lines.push(`  - Retention horizon: ${h.value}${h.kind === 'bounded' ? ' days' : ''} (${h.note})`);
    lines.push(`  - Discovery API: ${c.discovery_api ? 'yes' : 'no'}`);
    lines.push('');
  }

  if (pushes.length > 0) {
    lines.push('Last successful import, per record kind:');
    for (const p of pushes) {
      const consequence = pushConsequence(p.kind, pushFreshness(p.received_at));
      lines.push(`  - ${p.kind}: ${formatAgo(p.received_at)}${consequence ? ` — ${consequence}` : ''}`);
    }
    lines.push('');
    lines.push('Kinds configured in the exporter but never pushed do not appear above.');
  }

  void navigator.clipboard?.writeText(lines.join('\n'));
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
    <div className="rounded-[10px] bg-[var(--bg-canvas)] px-3.5 py-3">
      <div className="mb-1.5 font-mono text-[9.5px] uppercase leading-none tracking-[0.1em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="mb-1 text-[22px] font-medium tracking-[-0.02em]" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="text-[13px] text-[var(--fg-muted)]">{unit}</span>}
      </div>
      <div className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">{note}</div>
    </div>
  );
}
