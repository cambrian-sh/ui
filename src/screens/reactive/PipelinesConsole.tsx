import { useMemo, useState } from "react";
import { useStore } from "zustand";
import { projectionStore } from "@/store/projection";
import { Button, EmptyState, ScrollArea } from "@/design-system/components";
import { ErrorState } from "@/design-system/components/cambrian/error-state";
import { ipc } from "@/ipc";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { cn } from "@/design-system/lib/utils";
import type {
  GraphDocument,
  PipelineMeters,
  PipelineNodeMeter,
  PipelineSummary,
  WatchConfigFull,
  WatchMetrics,
} from "@/ipc/types";
import {
  MODE_COPY,
  metricsById,
  pipelineModeOf,
} from "./pipelineModel";
import { PipelineBuilder } from "./PipelineBuilder";
import { DryRunPane } from "./DryRunPane";
import { PipelineCanvas } from "./PipelineCanvas";
import { PipelineTracePane } from "./PipelineTracePane";
import { NewPipelineDialog } from "./NewPipelineDialog";

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
  const [dryRunning, setDryRunning] = useState<PipelineSummary | null>(null);
  const [viewing, setViewing] = useState<PipelineSummary | null>(null);
  const [tracing, setTracing] = useState<PipelineSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [starter, setStarter] = useState<GraphDocument | null>(null);

  // staleTime 0 on all three: these describe what the kernel holds, and it
  // changes without this window doing anything — the studio generates a
  // pipeline, an operator arms one elsewhere. Navigating to this tab must show
  // the current set rather than whatever was true when the app launched.
  const configs = useKernelQuery(
    ["watch-configs"],
    () => ipc.listWatchConfigs(),
    { retry: 0, staleTime: 0 },
  );
  const metrics = useKernelQuery(
    ["watch-metrics"],
    () => ipc.getWatchMetrics(),
    { retry: 0, staleTime: 0 },
  );
  // Contract 0087. A separate query from the watches because they are separate
  // things: an ingress pipeline is a versioned graph, a watch is a condition and
  // its arms. An older kernel answers with an empty list rather than an error, so
  // this needs no capability branch to stay quiet.
  const pipelines = useKernelQuery(["pipelines"], () => ipc.listPipelines(), {
    retry: 0,
    staleTime: 0,
  });

  const byId = useMemo(() => metricsById(metrics.data ?? []), [metrics.data]);
  // The LIVE readings, off the feed. Absolute state per pipeline, pushed on a
  // tick — unlike `metrics`, which is read once when this tab opens and is
  // per-watch, so most pipelines have none at all.
  const projection = useStore(projectionStore);
  const live = projection.state?.pipeline_meters;
  // ONE list. It reads the pipelines, which is what the reactive plane actually
  // holds — a watch is one shape a pipeline can be written in, not a second kind
  // of thing to show beside it.
  const list = pipelines.data ?? [];
  // The stored watch records back the EDITOR only. Ids are shared (a converted
  // watch keeps its own id), so a row can still open what authored it until the
  // canvas replaces this editor.
  const editableById = useMemo(() => {
    const m = new Map<string, WatchConfigFull>();
    for (const c of configs.data ?? []) m.set(c.id, c);
    return m;
  }, [configs.data]);

  if (starter) {
    return (
      <PipelineCanvas
        starter={starter}
        pipeline={summaryFor(starter)}
        onClose={() => setStarter(null)}
        onDryRun={() => {}}
        onCreated={() => {
          setStarter(null);
          void pipelines.refetch();
        }}
      />
    );
  }

  if (tracing) {
    return (
      <PipelineTracePane pipeline={tracing} onClose={() => setTracing(null)} />
    );
  }

  if (viewing) {
    return (
      <PipelineCanvas
        pipeline={viewing}
        onClose={() => setViewing(null)}
        onDryRun={() => {
          setDryRunning(viewing);
          setViewing(null);
        }}
      />
    );
  }

  if (dryRunning) {
    return (
      <DryRunPane pipeline={dryRunning} onClose={() => setDryRunning(null)} />
    );
  }

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

  const broken = list.filter((p) => pipelineModeOf(p) === "broken").length;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
                Reactive
              </h1>
              <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                {list.length} {list.length === 1 ? "pipeline" : "pipelines"} ·{" "}
                {list.filter((p) => pipelineModeOf(p) === "armed").length} armed
              </span>
            </div>
            <p className="mt-1 max-w-[620px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
              One engine, one vocabulary. Every entry point is here — a chat
              surface, a studio ingress, a schedule — because an ingress is
              always the head of a pipeline.
              {broken > 0 && (
                <>
                  {" "}
                  <span className="text-[var(--status-err)]">
                    {broken} {broken === 1 ? "pipeline is" : "pipelines are"}{" "}
                    bound to no stream and can never fire.
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* A watch and a pipeline are the same thing written two ways, so
                importing one is a conversion rather than a new author. */}
            <Button
              size="sm"
              variant="ghost"
              disabled
              title="Stored watches are converted to pipelines at boot; importing one by hand is not wired yet"
            >
              Import a watch
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              New pipeline
            </Button>
          </div>
        </div>

        <PlaneBudget metrics={metrics.data} />

        {pipelines.error ? (
          <ErrorState
            reason={pipelines.error.message}
            whatToDo="This kernel does not run the reactive plugin, so there is no pipeline plane to read. The Plugins page says whether it could."
          />
        ) : pipelines.isLoading ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState
            title="No pipelines"
            body="Nothing is watching a stream. That is a correct deployment, not a missing step — a pipeline is how a signal becomes work without a human in the loop."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Column headers, because the row is read as a table: the
                reviewing glance and the arming decision want different
                columns of the same line. */}
            <div className="flex items-baseline gap-3 px-4 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
              <span className="flex-1">Pipeline · trigger</span>
              <span className="w-[70px]">State</span>
              <span className="w-[110px]">Can touch world</span>
              <span className="w-[150px] text-right">
                Seen · passed · in flight · failed
              </span>
            </div>
            <ul className="flex flex-col gap-2">
            {list.map((p) => {
              const editable = editableById.get(p.pipeline_id);
              return (
                <li key={`${p.pipeline_id}@${p.revision}`}>
                  <PipelineRow
                    pipeline={p}
                    metrics={byId.get(p.pipeline_id)}
                    live={live?.[p.pipeline_id]}
                    liveAvailable={live !== undefined}
                    onOpen={() => setViewing(p)}
                    onTrace={() => setTracing(p)}
                    onEdit={editable ? () => setEditing(editable) : undefined}
                    onDryRun={
                      // Only where a dry run can actually run. A shadow run
                      // replays what an ingress captured, so offering it on a
                      // schedule trigger would be a control that can only ever
                      // refuse.
                      p.trigger_type === "ingress"
                        ? () => setDryRunning(p)
                        : undefined
                    }
                  />
                </li>
              );
            })}
            </ul>
          </div>
        )}
      </div>
      {creating && (
        <NewPipelineDialog
          onCancel={() => setCreating(false)}
          onCreate={(doc) => {
            setCreating(false);
            setStarter(doc);
          }}
        />
      )}
    </ScrollArea>
  );
}

/**
 * A summary for a graph that has not been stored.
 *
 * The canvas header reads a PipelineSummary, and a pipeline being drawn has no
 * stored one. Derived from the document rather than faked with zeroes: the
 * trigger and the name are real, and the counts are what the graph says.
 */
function summaryFor(doc: GraphDocument): PipelineSummary {
  const ref =
    doc.trigger.ingress ?? doc.trigger.stream_id ?? doc.trigger.cron ?? "";
  return {
    pipeline_id: doc.id,
    revision: doc.revision,
    name: doc.name ?? doc.id,
    state: "draft",
    trigger_type: doc.trigger.type,
    trigger_ref: ref,
    node_count: doc.scope.nodes.length,
    edge_count: doc.scope.edges.length,
    effect_node_count: 0,
    mapping_revision: 0,
    plan_checksum: "",
    semantics_checksum: "",
    generated: false,
    dry_run: false,
    approved: false,
  };
}

/**
 * The three plane-level numbers.
 *
 * Only the dead-letter count is real today: the hourly caps and running totals
 * for gate evaluations and plans started are not projected anywhere
 * (report.md §4.14b). Saying "unknown" is the honest rendering — a zero here
 * would read as headroom.
 */
function PlaneBudget({ metrics }: { metrics: WatchMetrics[] | undefined }) {
  const suppressed = (metrics ?? []).reduce(
    (n, m) => n + m.condition_suppressed,
    0,
  );
  const fired = (metrics ?? []).reduce((n, m) => n + m.condition_fired, 0);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <BudgetCard
        label="Gate evaluations"
        value={metrics ? String(fired + suppressed) : "unknown"}
        note={
          metrics
            ? `${fired} passed · ${suppressed} held. The hourly cap is not reported by this kernel, so there is no headroom figure.`
            : "This kernel does not report watch metrics."
        }
      />
      <BudgetCard
        label="Plans started"
        value="unknown"
        note="Plan starts draw from a plane-wide hourly budget. Neither the running total nor the cap is projected, so this cannot show a number — and a zero here would read as headroom it has not earned."
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
        "flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]",
        tone && "tint-wash tint-ring",
      )}
      style={tone ? ({ "--tint": tone } as React.CSSProperties) : undefined}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div
        className="font-mono text-[22px] leading-[1.2] tracking-[-0.02em]"
        style={{ color: tone ?? "var(--fg-primary)" }}
      >
        {value}
      </div>
      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {note}
      </p>
    </div>
  );
}

/**
 * One pipeline, as a row.
 *
 * The column order is the reviewing order: what it is, what state it is in, and
 * **how much it can do to you**. Node count says how complicated a pipeline is;
 * effect count says how much of the world it can reach, and that is the number
 * worth checking before arming — so it sits beside the state rather than on a
 * detail page nobody opens first (handoff 6.1).
 */
function PipelineRow({
  pipeline,
  metrics,
  live,
  liveAvailable,
  onOpen,
  onDryRun,
  onEdit,
  onTrace,
}: {
  pipeline: PipelineSummary;
  metrics: WatchMetrics | undefined;
  /** The live reading, when one has arrived for this pipeline. */
  live: PipelineMeters | undefined;
  /** Whether this kernel publishes live readings at all. */
  liveAvailable: boolean;
  // Undefined when this pipeline has no captured deliveries to replay.
  onDryRun?: () => void;
  // Undefined when nothing authored this row is editable in the legacy editor.
  // The canvas opens either way — reading a graph never depended on being able
  // to edit it.
  onEdit?: () => void;
  // What actually came through, and what the kernel said about it. Offered on
  // every row: the question "what did it receive" does not depend on the
  // pipeline being editable, or even on it working.
  onTrace?: () => void;
  // Undefined when nothing authored this row is editable here — a pipeline whose
  // body lives inside a daemon, for instance. The row stays readable; it just
  // does not pretend to open something.
  onOpen?: () => void;
}) {
  const mode = pipelineModeOf(pipeline);
  const copy = MODE_COPY[mode];
  const broken = mode === "broken" || mode === "orphaned";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-[var(--bg-surface)] shadow-[var(--elevation-1)]",
        broken && "tint-wash tint-ring",
      )}
      style={
        broken
          ? ({ "--tint": "var(--status-err)" } as React.CSSProperties)
          : undefined
      }
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={cn(
          "flex w-full flex-col gap-2 p-[14px_16px] text-left transition-colors",
          onOpen && "hover:brightness-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        )}
      >
        {/* The row IS the table: four columns, aligned with the headers above.
            A header that names a column the row does not have is worse than no
            header — it promises an alignment the eye then fails to find. */}
        <div className="flex items-start gap-3">
          {/* 1 — what it is, and what starts it. */}
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                mode === "armed" && "cambrian-live-pulse",
              )}
              style={{ background: copy.tone }}
            />
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-medium">
                {pipeline.name || pipeline.pipeline_id}
              </span>
              <span className="block truncate font-mono text-[10.5px] text-[var(--fg-muted)]">
                {triggerLine(pipeline)}
              </span>
            </div>
          </div>

          {/* 2 — state. */}
          <span
            className="w-[70px] shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: copy.tone }}
          >
            {copy.label}
          </span>

          {/* 3 — reach. Its own column because node count says how complicated a
              pipeline is, and effect count says how much it can do to you. */}
          <span className="w-[110px] shrink-0">
            <TouchesWorld count={pipeline.effect_node_count} />
          </span>

          {/* 4 — the funnel. */}
          <span className="w-[150px] shrink-0 text-right">
            <Counters
              metrics={metrics}
              live={live}
              liveAvailable={liveAvailable}
            />
          </span>
        </div>

        {/* broken is not paused. Paused is a decision; broken is an accident,
            and from every other screen the two look identical. */}
        {broken && (
          <>
            <p className="text-[11.5px] leading-[1.5] text-[var(--status-err)]">
              {mode === "orphaned" ? (
                <>
                  Armed for{" "}
                  <span className="font-mono text-[11px]">
                    {pipeline.trigger_ref}
                  </span>
                  , which is no longer registered — the entry organ is gone, so
                  nothing will ever arrive.
                </>
              ) : (
                "Bound to no stream — it can never fire."
              )}
            </p>
            <span
              className="w-fit rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] tint-fill text-[var(--status-err)]"
              style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
            >
              looks like coverage, provides none
            </span>
          </>
        )}

        <Sparkline metrics={metrics} />
        {!metrics && (
          <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
            {copy.why}
          </p>
        )}
      </button>

      <div className="flex flex-wrap gap-4 border-t border-[var(--border-subtle)] px-4 py-1.5">
        {onDryRun && (
          <button
            type="button"
            onClick={onDryRun}
            className="text-[11.5px] text-[var(--color-accent-400)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Dry run — see what it would do, before it does it
          </button>
        )}
        {onTrace && (
          <button
            type="button"
            onClick={onTrace}
            className="text-[11.5px] text-[var(--color-accent-400)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            What came through — deliveries and log
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-[11.5px] text-[var(--fg-muted)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Open the legacy editor
          </button>
        )}
      </div>

      {/* Paused released the daemon. Taught here rather than hidden: an operator
          weighing whether to leave something paused needs to know it costs
          nothing to. */}
      {mode === "paused" && (
        <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          Paused. Daemon references are counted, so pausing released this
          pipeline’s daemon — keeping it paused costs nothing.
        </p>
      )}

      {/* Armed, and its entry organ is switched off.
          The graph is armed either way, so the store alone cannot tell these
          apart — and "armed" over a stopped bot is the most confusing shape of
          "looks like coverage, provides none", because the coverage was real
          yesterday. */}
      {pipeline.entry_live === false && mode !== "orphaned" && (
        <p
          className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11.5px] tint-wash"
          style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            Armed, but nothing is feeding it — the daemon for{" "}
            <span className="font-mono text-[11px]">{pipeline.trigger_ref}</span>{" "}
            is not running.
          </span>{" "}
          <span className="text-[var(--fg-muted)]">
            The graph is still armed; the entry organ is switched off. Turn it
            back on where it was turned off — its own plugin panel.
          </span>
        </p>
      )}

      {/* Published is not live, and the row says which. A published revision is
          inspectable — it exists, it compiles, it has been reviewed — and it is
          doing nothing until someone arms it. */}
      {mode === "published" && (
        <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          — · inspectable, not live. Published means reviewed and ready; arming
          is a separate act.
        </p>
      )}

      {/* The dry-run ribbon lives under the row it belongs to, never as a
          checkbox in a settings pane (handoff 6.3). */}
      {mode === "dry_run" && (
        <p
          className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11.5px] tint-wash"
          style={{ "--tint": "var(--accent-bg)" } as React.CSSProperties}
        >
          <span className="text-[var(--color-accent-400)]">
            Revision {pipeline.revision} is in dry run: it has decided{" "}
            {metrics ? metrics.dry_run_would_fire : 0} times and acted zero
            times.
          </span>{" "}
          <span className="text-[var(--fg-muted)]">
            Every gate and branch is real; no arm runs.
          </span>
          {onDryRun && (
            <>
              {" "}
              <button
                type="button"
                onClick={onDryRun}
                className="text-[11.5px] text-[var(--color-accent-400)] hover:underline"
              >
                See what it would have done
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * How much of the world this pipeline can reach.
 *
 * Rendered even at zero, because “this pipeline changes nothing” is a fact worth
 * seeing rather than an absence to infer (handoff 2.2).
 */
function TouchesWorld({ count }: { count: number }) {
  if (count === 0) {
    // A zero is content: "this pipeline changes nothing" is a fact worth
    // seeing rather than an absence to infer.
    return (
      <span className="font-mono text-[10px] text-[var(--fg-muted)]">
        0 effects
      </span>
    );
  }
  return (
    <span
      className="rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] tint-fill"
      style={
        {
          "--tint": "var(--status-warn)",
          color: "var(--status-warn)",
        } as React.CSSProperties
      }
    >
      {count} {count === 1 ? "effect" : "effects"}
    </span>
  );
}

/**
 * seen · passed · held · dead.
 *
 * A dead-letter count is red at one, not at some threshold: the first one is the
 * one worth looking at.
 */
function Counters({
  metrics,
  live,
  liveAvailable,
}: {
  metrics: WatchMetrics | undefined;
  live: PipelineMeters | undefined;
  liveAvailable: boolean;
}) {
  // The live reading wins. It is pushed, it is current, and it exists for every
  // pipeline rather than only for the ones that used to be watches.
  if (live) {
    const total = (pick: (n: PipelineNodeMeter) => number) =>
      live.nodes.reduce((sum, n) => sum + pick(n), 0);
    const inFlight = total((n) => n.in_flight);
    const failed = total((n) => n.failed);
    return (
      <span className="font-mono text-[11px] text-[var(--fg-muted)]">
        {`${total((n) => n.entered)} · ${total((n) => n.passed_on)} · `}
        <span
          className={inFlight > 0 ? "text-[var(--color-accent-400)]" : undefined}
          title="in flight right now"
        >
          {inFlight}
        </span>
        {" · "}
        <span className={failed > 0 ? "text-[var(--status-err)]" : undefined}>
          {failed}
        </span>
      </span>
    );
  }

  // No metrics is NOT four zeros. This kernel reports counters per watch, and a
  // pipeline that never was a watch has none — printing "0 · 0 · 0 · 0" would
  // claim it has seen nothing, which is a different and much more alarming
  // statement than "nobody is counting this one".
  if (!metrics) {
    return (
      <span
        className="font-mono text-[11px] text-[var(--fg-muted)]"
        title={
          liveAvailable
            ? "Nothing has run through this pipeline since the kernel started"
            : "This kernel publishes no live readings, and reports counters per watch — this pipeline has none"
        }
      >
        {liveAvailable ? "nothing yet" : "not counted"}
      </span>
    );
  }
  return (
    <span className="font-mono text-[11px] text-[var(--fg-muted)]">
      {/* One string, not four interpolations: the counters are read as a
          sequence, and splitting them across text nodes makes them
          unaddressable to anything that reads the rendered output. */}
      {`${metrics.signals_seen} · ${metrics.condition_fired} · ${metrics.condition_suppressed} · `}
      <span
        className={
          metrics.dead_lettered > 0 ? "text-[var(--status-err)]" : undefined
        }
      >
        {metrics.dead_lettered}
      </span>
      {metrics.action_failed > 0 && (
        <span className="text-[var(--status-err)]">
          {" "}
          · {metrics.action_failed} failed
        </span>
      )}
    </span>
  );
}

/**
 * What starts this pipeline, in the shape the trigger actually takes.
 *
 * `stream · ingress.comms.* · r1` reads as three unlabelled facts; the design
 * writes `ingress: USGS earthquakes · rev 7` because the KIND of trigger
 * changes what the reference means.
 */
function triggerLine(p: PipelineSummary): string {
  const ref = p.trigger_ref;
  const rev = `rev ${p.revision}`;
  switch (p.trigger_type) {
    case "ingress":
      return ref ? `ingress: ${ref} · ${rev}` : `ingress: unbound · ${rev}`;
    case "schedule":
      return ref ? `cron: ${ref} · ${rev}` : `cron: unset · ${rev}`;
    case "stream":
      return ref ? `stream: ${ref} · ${rev}` : `stream: unbound · ${rev}`;
    case "manual":
      return `manual · ${rev}`;
    default:
      return ref ? `${p.trigger_type}: ${ref} · ${rev}` : `${p.trigger_type} · ${rev}`;
  }
}

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
      <span
        style={{ width: `${pct(succeeded)}%`, background: "var(--accent-bg)" }}
      />
      <span
        style={{ width: `${pct(failed)}%`, background: "var(--status-err)" }}
      />
      <span
        style={{
          width: `${pct(metrics.condition_suppressed)}%`,
          background: "var(--color-neutral-600)",
        }}
      />
    </div>
  );
}
