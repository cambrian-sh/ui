import { useMemo } from 'react';
import { Layers, OctagonAlert } from 'lucide-react';
import type { RetentionRunEvent } from '@/ipc/types';
import {
  consecutiveBounded,
  consecutiveFailures,
  formatTime,
  mergeRetentionRuns,
  summariseDeletions,
} from './drift-format';

/**
 * Retention & erasure — one panel, both sources.
 *
 * `RetentionRunOp` is source-agnostic by design (the record compactor and the
 * reactive-journal GC publish the same shape), so this reads `source` rather than
 * assuming one. An operator asking "what was deleted and when" gets one answer
 * instead of two half-answers.
 *
 * Two states dominate, and the counts are secondary to both:
 *
 * - **`error` non-empty** — retention has STOPPED HAPPENING. Data that should
 *   have been erased is still on disk. Failed passes are published precisely so
 *   this cannot be silent, so it is the loudest thing on the page.
 * - **`bounded` on every tick** — a capacity warning, not a status line. One
 *   bounded pass is normal; twelve in a row means the cap is smaller than the
 *   arrival rate and the backlog grows no matter how often it runs.
 */
export function RetentionPane({
  fedRuns,
  backfilledRuns,
  hasFeed,
}: {
  /** Runs folded from the operator feed. `undefined` = this core cannot report them. */
  fedRuns: readonly RetentionRunEvent[] | undefined;
  /** Runs read from the record lane's own plane, backfilling a cold connect. */
  backfilledRuns: readonly RetentionRunEvent[] | undefined;
  /** Whether the kernel advertises `retention-feed`. */
  hasFeed: boolean;
}) {
  const runs = useMemo(
    () => mergeRetentionRuns(fedRuns, backfilledRuns),
    [fedRuns, backfilledRuns],
  );

  const failing = consecutiveFailures(runs);
  const bounded = consecutiveBounded(runs);
  const latestFailure = runs.find((r) => r.error);

  return (
    <div className="flex flex-col">
      <header className="flex-none px-6 py-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h1 className="text-lg tracking-[-0.01em]">Retention</h1>
          <span className="font-mono text-[11px] text-[var(--fg-muted)]">
            {sourceLine(runs)}
          </span>
        </div>
        <p className="text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
          An audit product that deletes silently is not auditable. Every pass is published, including the ones that
          failed — this page is where that becomes visible.
        </p>
      </header>

      <div className="flex flex-col gap-3.5 px-6 py-4">
        {/*
          `undefined` is not `[]`. A core that cannot report retention and a
          kernel that has run no pass are different facts, and only the second one
          is evidence about deletion.
        */}
        {!hasFeed && (
          <Panel tone="warn">
            <PanelHead tone="warn" icon={<OctagonAlert size={15} strokeWidth={1.75} />}>
              This kernel does not publish retention passes
            </PanelHead>
            <p className="text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
              The <code className="font-mono text-[11.5px]">retention-feed</code> capability is absent, so nothing here
              can tell you whether erasure is happening. That is a gap in what this console can see, not a statement
              that no data was deleted — and the two must not be read as the same thing.
            </p>
          </Panel>
        )}

        {/* The loudest thing on the page, when it applies. */}
        {latestFailure && (
          <Panel tone="err" strong>
            <PanelHead tone="err" icon={<OctagonAlert size={16} strokeWidth={1.75} />}>
              Retention has stopped happening
              <span className="ml-auto font-mono text-[10.5px] font-normal text-[var(--fg-muted)]">
                {latestFailure.source} · {failing > 1 ? `${failing} passes ago` : 'last pass'}
              </span>
            </PanelHead>
            <p className="mb-2.5 text-[12.5px] leading-[1.65] text-[var(--fg-primary)]">
              {failing > 1
                ? `The last ${failing} ${latestFailure.source} passes returned an error and deleted nothing.`
                : `The last ${latestFailure.source} pass returned an error and deleted nothing.`}{' '}
              Data that should have been erased is still on disk, and it will stay there until this clears.
            </p>
            <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[9px] bg-[var(--bg-canvas)] px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-[var(--status-err)]">
              {latestFailure.error}
            </pre>
            <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
              {/*
                No "Run a pass now" button: the record lane's plane exposes no
                RPC that triggers one, and a control that did nothing would be
                worse here than no control at all.
              */}
              Failed passes are published on purpose, so this cannot be silent. Triggering a pass from here needs an RPC
              the lane does not serve — the cadence is a compile-time default with no config loader behind it.
            </p>
          </Panel>
        )}

        {/* A run of bounded passes, drawn as a shape rather than a number. */}
        {bounded >= 2 && (
          <Panel tone="warn">
            <PanelHead tone="warn" icon={<Layers size={15} strokeWidth={1.75} />}>
              The backlog is not draining
              <span className="ml-auto font-mono text-[10.5px] font-normal text-[var(--status-warn)]">
                bounded on {bounded} of the last {Math.min(runs.length, 12)}
              </span>
            </PanelHead>
            <BoundedBars runs={runs.slice(0, 12)} />
            <p className="text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
              Every one of these passes hit its batch cap, which means{' '}
              <strong className="font-medium text-[var(--fg-primary)]">more always remained</strong>. One bounded pass is
              normal; a run of them is a capacity warning — the cap is smaller than the rate of arrival, so the backlog
              grows no matter how often this runs.{' '}
              <span className="text-[var(--fg-muted)]">
                Cadence and batch size are compile-time defaults today; no config loader wires them, so this cannot be
                tuned from here yet.
              </span>
            </p>
          </Panel>
        )}

        {/* Recent passes. */}
        <section>
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="font-mono text-[9.5px] uppercase leading-none tracking-[0.12em] text-[var(--fg-muted)]">
              Recent passes
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
              one panel, both sources — the event is source-agnostic by design
            </span>
          </div>

          {runs.length === 0 ? (
            <p className="rounded-[10px] bg-[var(--bg-surface)] px-4 py-3.5 text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
              {hasFeed
                ? 'No retention pass has been published since this console connected. Passes are hourly, so this is the expected state shortly after a restart — it is not a statement that nothing has ever been deleted.'
                : 'Nothing to show, because this kernel does not publish retention passes at all.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-px">
              {runs.slice(0, 20).map((run, i) => (
                <RunRow key={`${run.source}:${run.run_id}`} run={run} first={i === 0} last={i === Math.min(runs.length, 20) - 1} />
              ))}
            </ul>
          )}
        </section>

        <div className="rounded-[11px] bg-[var(--bg-surface)] px-4 py-3">
          <p className="text-[11.5px] leading-[1.65] text-[var(--fg-muted)]">
            A row here is one <span className="font-mono">RetentionRunOp</span> off the operator feed, gated on{' '}
            <span className="font-mono">retention-feed</span>, merged with the record lane's own{' '}
            <span className="font-mono">ListRetentionRuns</span> so a pass from before this console connected is still
            visible. The panel reads <span className="font-mono">source</span> rather than assuming one, so record
            compaction and journal GC share a surface.
          </p>
        </div>
      </div>
    </div>
  );
}

function RunRow({ run, first, last }: { run: RetentionRunEvent; first: boolean; last: boolean }) {
  const failed = Boolean(run.error);
  const dot = failed ? 'var(--status-err)' : run.bounded ? 'var(--status-warn)' : 'var(--status-live)';
  const summary = summariseDeletions(run);

  return (
    <li
      className={[
        'flex items-center gap-3 px-3.5 py-3',
        first ? 'rounded-t-[10px]' : '',
        last ? 'rounded-b-[10px]' : '',
      ].join(' ')}
      style={{
        background: failed
          ? 'color-mix(in srgb, var(--status-err) 7%, transparent)'
          : 'var(--bg-surface)',
      }}
    >
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: dot }} />
      <span className="w-[118px] flex-none truncate font-mono text-[11.5px] leading-none text-[var(--fg-secondary)]">
        {run.source}
      </span>
      <span className="flex-none font-mono text-[11px] leading-none text-[var(--fg-muted)]">
        {formatTime(run.started_at)}
      </span>
      <span className="min-w-0 flex-1 text-[12px]">
        {failed ? (
          <span className="text-[var(--status-err)]">failed — nothing deleted</span>
        ) : (
          <span className="text-[var(--fg-secondary)]">
            {/*
              An empty `deleted` means the pass ran and removed nothing — a
              normal outcome, and stated as one rather than left blank.
            */}
            {summary || 'ran, removed nothing'}
            {run.bounded && <span className="text-[var(--status-warn)]"> · capped, more remains</span>}
          </span>
        )}
      </span>
      <span className="flex-none font-mono text-[10.5px] leading-none text-[var(--fg-muted)]">
        run {run.run_id}
      </span>
    </li>
  );
}

/** Twelve full-height bars: a run of bounded passes reads as a shape, not a number. */
function BoundedBars({ runs }: { runs: readonly RetentionRunEvent[] }) {
  const ordered = [...runs].reverse();
  return (
    <div className="mb-2.5 flex h-[26px] items-end gap-[3px]" aria-hidden>
      {ordered.map((r) => (
        <span
          key={`${r.source}:${r.run_id}`}
          className="h-full flex-1 rounded-[1px]"
          style={{
            background: r.error
              ? 'var(--status-err)'
              : r.bounded
                ? 'color-mix(in srgb, var(--status-warn) 55%, transparent)'
                : 'var(--color-neutral-800)',
          }}
        />
      ))}
    </div>
  );
}

function sourceLine(runs: readonly RetentionRunEvent[]): string {
  const sources = [...new Set(runs.map((r) => r.source))].filter(Boolean);
  if (sources.length === 0) return 'records · reactive journal';
  return sources.join(' · ');
}

function Panel({
  tone,
  strong,
  children,
}: {
  tone: 'err' | 'warn';
  strong?: boolean;
  children: React.ReactNode;
}) {
  const v = `var(--status-${tone})`;
  return (
    <div
      className="rounded-[11px] px-4 py-4"
      style={{
        background: `color-mix(in srgb, ${v} ${strong ? 8 : 7}%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${v} ${strong ? 34 : 30}%, transparent)`,
      }}
      role={tone === 'err' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

function PanelHead({
  tone,
  icon,
  children,
}: {
  tone: 'err' | 'warn';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5" style={{ color: `var(--status-${tone})` }}>
      {icon}
      <span className="flex flex-1 items-center gap-2.5 text-[14px] font-medium text-[var(--fg-primary)]">
        {children}
      </span>
    </div>
  );
}
