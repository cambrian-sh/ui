import { useMemo } from "react";
import { Button, ScrollArea } from "@/design-system/components";
import { ipc } from "@/ipc";
import { useKernelQuery } from "@/lib/useKernelQuery";
import type {
  DuplicateEffectKey,
  PipelineDryRun,
  PipelineSummary,
  PipelineTermination,
  ShadowEffect,
} from "@/ipc/types";

/**
 * 15c — the dry run.
 *
 * It leads with the FINDING, not the totals. A collision is the one thing this
 * screen can tell an operator that nothing downstream ever will: after the fact
 * there is one record and no evidence there were ever two. Four healthy-looking
 * counts above it would bury the only line that changes what someone does next.
 */
export function DryRunPane({
  pipeline,
  onClose,
}: {
  pipeline: PipelineSummary;
  onClose: () => void;
}) {
  const run = useKernelQuery(
    ["pipeline-dry-run", pipeline.pipeline_id, pipeline.revision],
    () => ipc.dryRunPipeline(pipeline.pipeline_id, pipeline.revision),
    { retry: 0, staleTime: 0 },
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4 pb-10">
        <Header pipeline={pipeline} onClose={onClose} />

        {run.isLoading ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            Replaying captured deliveries…
          </p>
        ) : run.error ? (
          <p
            className="rounded-[var(--radius-lg)] p-3.5 text-[12.5px] tint-wash tint-ring"
            style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
          >
            {run.error.message}
          </p>
        ) : run.data ? (
          <Report report={run.data} pipeline={pipeline} />
        ) : null}

        <Backtest />
      </div>
    </ScrollArea>
  );
}

/**
 * The badge is the guarantee, stated before anything it qualifies.
 *
 * "Nothing reached the world" is what makes the rest of this page safe to read
 * at all, and the subtitle says what WAS real — because a reader who assumes the
 * whole thing was simulated will discount a finding that is not.
 */
function Header({
  pipeline,
  onClose,
}: {
  pipeline: PipelineSummary;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
            Dry run
          </h1>
          <span
            className="rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px] tint-fill"
            style={
              {
                "--tint": "var(--color-accent-700)",
                color: "var(--color-accent-400)",
              } as React.CSSProperties
            }
          >
            nothing reached the world
          </span>
        </div>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
          <span className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
            {pipeline.name || pipeline.pipeline_id}
          </span>{" "}
          — every gate, branch, aggregate and key derivation below was real. The
          one substitution is at the sink: each effect was recorded instead of
          performed.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Back to pipelines
      </Button>
    </div>
  );
}

function Report({
  report,
  pipeline,
}: {
  report: PipelineDryRun;
  pipeline: PipelineSummary;
}) {
  const saves = useMemo(
    () => report.effects.filter((e) => isSave(e.kind)),
    [report.effects],
  );
  const notifies = useMemo(
    () => report.effects.filter((e) => !isSave(e.kind)),
    [report.effects],
  );
  const discarded = report.terminations.reduce((n, t) => n + t.count, 0);

  // A refusal is the whole answer. Rendering counts beside it would show four
  // zeros, and four zeros read as "this pipeline would do nothing" — the
  // opposite of "we have nothing to run it against".
  if (report.refused !== "") {
    return (
      <div
        className="rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
        style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
      >
        <h2 className="text-[13px] font-medium text-[var(--status-warn)]">
          There is nothing to dry-run yet
        </h2>
        <p className="mt-1 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
          {report.refused}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* What ran, and what it cost to run. An operator deciding whether to
          replay more deliveries is deciding on this number. */}
      <p className="font-mono text-[11px] text-[var(--fg-muted)]">
        Dry run · {report.samples}{" "}
        {report.samples === 1 ? "item" : "items"} · r{pipeline.revision} ·{" "}
        {formatElapsed(report.elapsed_ms)}
      </p>

      <Collisions duplicates={report.duplicates} totalEffects={report.effects.length} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Count label="Would save" value={saves.length} />
        <Count label="Would notify" value={notifies.length} />
        <Count label="Discarded" value={discarded} />
        <Count
          label="Failed"
          value={report.failures.length}
          tone={report.failures.length > 0 ? "var(--status-err)" : undefined}
        />
      </div>
      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        Over {report.samples}{" "}
        {report.samples === 1 ? "captured delivery" : "captured deliveries"}.
        There is no “unrouted” count: the compiler refuses a graph with an unwired
        port, so an item reaching nowhere at all cannot happen.
      </p>

      <Discards terminations={report.terminations} />
      <Ledger effects={report.effects} />

      {report.failures.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-[var(--status-err)]">
            What failed
          </h2>
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
            {report.failures.map((f, i) => (
              <li
                key={`${f.node}-${f.item_key}-${i}`}
                className="flex flex-col gap-0.5 px-3.5 py-2"
              >
                <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                  {f.node} · {f.item_key}
                </span>
                <span className="text-[12px] text-[var(--fg-secondary)]">
                  {f.err}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The finding, first.
 *
 * Two effects deriving one key means the second write silently replaces the
 * first. This is the reason a dry run earns a screen: after the fact there is one
 * record and no evidence there were ever two. Both resolutions are offered
 * because either can be right — last-write-wins is a legitimate design, and the
 * only wrong outcome is arriving at it by accident.
 */
function Collisions({
  duplicates,
  totalEffects,
}: {
  duplicates: DuplicateEffectKey[];
  totalEffects: number;
}) {
  if (duplicates.length === 0) {
    // A zero is content. "No collisions" is the single most reassuring line on
    // this page and is worth stating, because its absence would leave an
    // operator unsure whether the check ran.
    return (
      <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h2 className="text-[13px] font-medium">No key collisions</h2>
        <p className="mt-1 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
          Every effect derived a distinct key, so no write would replace another.
          This is the check that cannot be made after the fact.
        </p>
      </div>
    );
  }

  const lost = duplicates.reduce((n, d) => n + (d.count - 1), 0);
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
      style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
    >
      <div>
        <h2 className="text-[13px] font-medium text-[var(--status-err)]">
          {duplicates.length === 1
            ? "One key is used by more than one write"
            : `${duplicates.length} keys are used by more than one write`}
        </h2>
        <p className="mt-1 max-w-[640px] text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
          {lost} {lost === 1 ? "record would be" : "records would be"} silently
          replaced. After the fact there is one record and no evidence there were
          ever two — which is why this is checked here and not later.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-surface)]">
        {duplicates.map((d) => (
          <li
            key={d.effect_key}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2"
          >
            <span className="font-mono text-[11px] break-all">
              {d.effect_key}
            </span>
            <span className="font-mono text-[10.5px] text-[var(--status-err)]">
              {d.count} writes
            </span>
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              {d.nodes.join(", ")}
            </span>
          </li>
        ))}
        {/* The keys that behaved. Without them the colliding rows have no
            denominator, and three collisions reads the same whether the run
            produced four keys or four hundred. */}
        {cleanKeys(duplicates, totalEffects) > 0 && (
          <li className="flex flex-wrap items-baseline gap-x-3 px-3.5 py-2">
            <span className="font-mono text-[11px] text-[var(--fg-muted)]">
              {cleanKeys(duplicates, totalEffects)} other keys
            </span>
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              1 write each
            </span>
          </li>
        )}
      </ul>

      <div className="flex flex-col gap-1 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
        <span className="text-[11px] text-[var(--fg-muted)]">
          Two ways to resolve it
        </span>
        <span>
          <span className="text-[var(--fg-primary)]">
            Add something that separates them
          </span>{" "}
          — the event id, usually — so each item keeps its own record.
        </span>
        <span>
          <span className="text-[var(--fg-primary)]">
            Keep last-write-wins
          </span>{" "}
          if collapsing is what you meant. Then this is a correct pipeline and
          the count above is the update rate, not a loss.
        </span>
      </div>
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]"
      style={tone ? ({ color: tone } as React.CSSProperties) : undefined}
    >
      <span className="text-[11px] text-[var(--fg-muted)]">{label}</span>
      <span className="font-mono text-[22px] leading-none tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * The discards, in the operator's own words.
 *
 * "3 skipped, because 'under the reporting threshold'" is a sentence an operator
 * can check. "47 of 52" is one they have to trust. That difference is the whole
 * reason the language refuses an unnamed discard at parse time.
 */
function Discards({ terminations }: { terminations: PipelineTermination[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium">What it threw away</h2>
      {terminations.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          Nothing. Every item that arrived reached an effect.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
          {terminations.map((t) => (
            <li
              key={`${t.node}.${t.port}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3.5 py-2"
            >
              <span className="font-mono text-[12px] tabular-nums">
                {t.count}
              </span>
              <span className="text-[12px] text-[var(--fg-secondary)]">
                {t.count === 1 ? "item took" : "items took"} “{t.reason}”
              </span>
              <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
                {t.node}.{t.port}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The effect ledger, in two columns that never merge.
 *
 * Declared and carried out are kept apart because that is what later
 * distinguishes "the save happened and the task failed" from "neither happened"
 * — a distinction no single status field can express, and the first thing asked
 * for at 2 a.m.
 */
function Ledger({ effects }: { effects: ShadowEffect[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium">The effect ledger</h2>
          <p className="text-[10.5px] text-[var(--fg-muted)]">
            what it decided, not which attempt carried it
          </p>
        </div>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          <span className="text-[var(--fg-secondary)]">
            {effects.length} declared
          </span>{" "}
          · 0 carried out
        </span>
      </div>
      {effects.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          No effect would have been performed.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
          {effects.map((e, i) => (
            <li
              key={`${e.node}-${e.effect_key}-${i}`}
              className="flex flex-col gap-0.5 px-3.5 py-2"
            >
              <span className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                <span className="text-[var(--fg-primary)]">{e.node}</span>
                <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                  {e.summary}
                </span>
              </span>
              <span className="font-mono text-[10.5px] break-all text-[var(--fg-muted)]">
                {e.effect_key}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Backtest is a different question, and saying so stops the two being used
 * interchangeably — the mistake that makes a dry run look like proof about the
 * past, or a backtest like proof about the present.
 */
function Backtest() {
  return (
    <p className="max-w-[640px] text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
      A dry run asks what this would do to what is arriving now. A{" "}
      <span className="text-[var(--fg-secondary)]">backtest</span> asks a
      different question — it replays journaled history to argue for a change.
      Neither ever executes an arm.
    </p>
  );
}

/**
 * Saves and notifications are counted apart because they fail differently: a
 * save that did not happen is missing knowledge, and a notification that did not
 * happen is a person who was not told.
 */
function isSave(kind: string): boolean {
  return kind === "save_to_memory" || kind === "ingest";
}

/** How many effect keys were used exactly once. */
function cleanKeys(duplicates: DuplicateEffectKey[], totalEffects: number): number {
  const colliding = duplicates.reduce((n, d) => n + d.count, 0);
  return Math.max(0, totalEffects - colliding);
}

/**
 * Elapsed, at the precision the number is worth.
 *
 * Sub-second runs read in milliseconds because the interesting comparison is
 * with the next run; anything longer reads in seconds, because at that scale
 * nobody is counting milliseconds.
 */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
