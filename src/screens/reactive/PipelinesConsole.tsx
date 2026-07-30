import { useMemo, useState } from 'react';
import { Button, EmptyState, ScrollArea } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { cn } from '@/design-system/lib/utils';
import type { WatchConfigFull, WatchMetrics } from '@/ipc/types';
import {
  emptyPipeline,
  MODE_COPY,
  metricsById,
  pipelineMode,
} from './pipelineModel';
import { PipelineBuilder } from './PipelineBuilder';

/**
 * Pipelines — the reactive plane.
 *
 * The budget cards sit **above** the list on purpose: a storm is the failure
 * mode of this whole plane, and it is not a per-pipeline concern. Shedding is a
 * defence, not an error, and the copy says so — otherwise an operator reads a
 * non-zero shed count as something to fix.
 */
export function PipelinesConsole() {
  const [editing, setEditing] = useState<WatchConfigFull | null>(null);

  const configs = useKernelQuery(['watch-configs'], () => ipc.listWatchConfigs(), {
    retry: 0,
  });
  const metrics = useKernelQuery(['watch-metrics'], () => ipc.getWatchMetrics(), { retry: 0 });
  const deadLetters = useKernelQuery(
    ['watch-dead-letters'],
    () => ipc.listWatchDeadLetters(50),
    { retry: 0 },
  );

  const byId = useMemo(() => metricsById(metrics.data ?? []), [metrics.data]);
  const list = configs.data ?? [];

  if (editing) {
    return (
      <PipelineBuilder
        config={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void configs.refetch();
        }}
      />
    );
  }

  const broken = list.filter((c) => pipelineMode(c) === 'broken').length;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
              Pipelines
            </h1>
            <p className="mt-1 max-w-[620px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
              A signal arrives, a gate decides, an arm acts. Nothing here polls — every
              counter folds from the reactive plane.
              {broken > 0 && (
                <>
                  {' '}
                  <span className="text-[var(--status-err)]">
                    {broken} {broken === 1 ? 'pipeline is' : 'pipelines are'} bound to no
                    stream and can never fire.
                  </span>
                </>
              )}
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(emptyPipeline())}>
            New pipeline
          </Button>
        </div>

        <PlaneBudget deadLetterCount={deadLetters.data?.length ?? null} metrics={metrics.data} />

        {configs.error ? (
          <ErrorState
            reason={configs.error.message}
            whatToDo="This kernel does not run the reactive plugin, so there is no pipeline plane to read. The Plugins page says whether it could."
          />
        ) : configs.isLoading ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState
            title="No pipelines"
            body="Nothing is watching a stream. That is a correct deployment, not a missing step — a pipeline is how a signal becomes work without a human in the loop."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <li key={c.id}>
                <PipelineRow
                  config={c}
                  metrics={byId.get(c.id)}
                  onOpen={() => setEditing(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * The three plane-level numbers.
 *
 * Only the dead-letter count is real today: the hourly caps and running totals
 * for gate evaluations and plans started are not projected anywhere
 * (report.md §4.14b). Saying "unknown" is the honest rendering — a zero here
 * would read as headroom.
 */
function PlaneBudget({
  deadLetterCount,
  metrics,
}: {
  deadLetterCount: number | null;
  metrics: WatchMetrics[] | undefined;
}) {
  const suppressed = (metrics ?? []).reduce((n, m) => n + m.condition_suppressed, 0);
  const fired = (metrics ?? []).reduce((n, m) => n + m.condition_fired, 0);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <BudgetCard
        label="Gate evaluations"
        value={metrics ? String(fired + suppressed) : 'unknown'}
        note={
          metrics
            ? `${fired} passed · ${suppressed} held. The hourly cap is not reported by this kernel, so there is no headroom figure.`
            : 'This kernel does not report watch metrics.'
        }
      />
      <BudgetCard
        label="Dead letters"
        value={deadLetterCount == null ? 'unknown' : String(deadLetterCount)}
        tone={deadLetterCount ? 'var(--status-warn)' : undefined}
        note={
          deadLetterCount
            ? 'Actions that could not be delivered. None were silently dropped — but this contract has no retry RPC, so replaying one is not something the console can do yet.'
            : 'Nothing failed delivery.'
        }
      />
      <BudgetCard
        label="Shed at intake"
        value="unknown"
        note="Rate limits held — not an error, a defence. The plane-level shed counter is not projected yet, so this cannot show a number rather than showing zero."
      />
    </div>
  );
}

function BudgetCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]',
        tone && 'tint-wash tint-ring',
      )}
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div
        className="font-mono text-[22px] leading-[1.2] tracking-[-0.02em]"
        style={{ color: tone ?? 'var(--fg-primary)' }}
      >
        {value}
      </div>
      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">{note}</p>
    </div>
  );
}

function PipelineRow({
  config,
  metrics,
  onOpen,
}: {
  config: WatchConfigFull;
  metrics: WatchMetrics | undefined;
  onOpen: () => void;
}) {
  const mode = pipelineMode(config);
  const copy = MODE_COPY[mode];
  const tinted = mode === 'broken' || mode === 'paused';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-[14px_16px] text-left transition-colors',
        'shadow-[var(--elevation-1)] hover:brightness-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        tinted && 'tint-wash tint-ring',
      )}
      style={tinted ? ({ '--tint': copy.tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', mode === 'armed' && 'cambrian-live-pulse')}
          style={{ background: copy.tone }}
        />
        <span className="truncate text-[14px] font-medium">{config.name || config.id}</span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.1em]"
          style={{ color: copy.tone }}
        >
          {copy.label}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          {config.source_type}
          {config.source_stream_id && ` · ${config.source_stream_id}`}
        </span>
      </div>

      <Sparkline metrics={metrics} />
      {/* The shape is what says whether it is getting WORSE, and this kernel
          reports totals rather than a per-fire series. Saying so beats a bar an
          operator would read as a trend. */}
      {metrics && metrics.signals_seen > 0 && (
        <span className="text-[10.5px] text-[var(--fg-muted)]">
          totals since this watch was armed — no per-fire history is reported, so this is a
          proportion, not a trend
        </span>
      )}

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {mode === 'broken' || mode === 'paused' ? (
          <span style={{ color: copy.tone }}>{copy.why}</span>
        ) : metrics ? (
          <>
            {metrics.signals_seen} signals seen · {metrics.condition_fired} passed the gate ·{' '}
            {metrics.condition_suppressed} held
            {metrics.action_failed > 0 && (
              <span style={{ color: 'var(--status-err)' }}>
                {' '}
                · {metrics.action_failed} acted and failed
              </span>
            )}
            {metrics.dead_lettered > 0 && (
              <span className="text-[var(--status-warn)]">
                {' '}
                · {metrics.dead_lettered} dead-lettered
              </span>
            )}
          </>
        ) : (
          copy.why
        )}
      </p>

      {/* Dry run gets a persistent ribbon, not a checkbox somewhere in settings:
          "it has decided N times and acted zero times" is the whole point. */}
      {mode === 'dry_run' && metrics && (
        <p
          className="rounded-md p-2 text-[11.5px] tint-wash"
          style={{ '--tint': 'var(--accent-bg)' } as React.CSSProperties}
        >
          <span className="text-[var(--color-accent-400)]">
            It has decided {metrics.dry_run_would_fire} times and acted zero times.
          </span>{' '}
          <span className="text-[var(--fg-muted)]">
            Dry run evaluates for real and records would-fires without running any arm.
          </span>
        </p>
      )}
    </button>
  );
}

/** Signals seen vs fired vs held, as three proportional bars. */
/**
 * What this watch has done with the signals it saw (`3d`).
 *
 * The design asks for a twenty-bar FIRE HISTORY — accent for ok, err for
 * failures — because "an error count without a shape tells you a number; a shape
 * tells you whether it is getting worse."
 *
 * That shape cannot be drawn honestly: `WatchMetrics` carries aggregate counts
 * and no per-fire record, so twenty bars derived from them would be an invented
 * trend. A fabricated trend in an operations console is worse than no trend —
 * it is the one thing an operator would act on. So this stays a PROPORTION of
 * what actually happened, and the missing history is named below rather than
 * faked. Restoring the design needs a per-fire series on the wire.
 *
 * Failures do get their own segment: `action_failed` is on the wire, it is the
 * band an operator most needs to see, and it was being left out of the bar
 * entirely — a watch failing every action looked identical to one succeeding.
 */
function Sparkline({ metrics }: { metrics: WatchMetrics | undefined }) {
  if (!metrics || metrics.signals_seen === 0) return null;
  const seen = metrics.signals_seen;
  const pct = (n: number) => (n / seen) * 100;
  // Failures are counted inside condition_fired (the gate passed, the action
  // then failed), so the succeeded band is the remainder rather than the whole.
  const failed = Math.min(metrics.action_failed, metrics.condition_fired);
  const succeeded = metrics.condition_fired - failed;

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]"
      role="img"
      aria-label={
        `${succeeded} fired and acted, ${failed} fired but the action failed, ` +
        `${metrics.condition_suppressed} held, of ${seen} signals`
      }
    >
      <span style={{ width: `${pct(succeeded)}%`, background: 'var(--accent-bg)' }} />
      <span style={{ width: `${pct(failed)}%`, background: 'var(--status-err)' }} />
      <span style={{ width: `${pct(metrics.condition_suppressed)}%`, background: 'var(--color-neutral-600)' }} />
    </div>
  );
}
