import { useMemo, useState } from "react";
import { useStore } from "zustand";
import { projectionStore } from "@/store/projection";
import { cn } from "@/design-system/lib/utils";
import type { PipelineStep } from "@/ipc/types";

/**
 * The flow view: what went where, item by item, live.
 *
 * The counters answer "how much, how fast, where is it piling up". This answers
 * the question they cannot: which branch THIS delivery took, and what it
 * carried. An operator watching a graph needs both — the counts to spot a queue,
 * the steps to see the one item that went somewhere unexpected.
 *
 * Grouped by ITEM rather than listed by time. A flat time-ordered list of steps
 * from several concurrent items reads as noise; the same steps grouped by the
 * item they belong to read as a path through the graph, which is what an
 * operator is actually trying to follow.
 */
export function StepFlow({
  pipelineID,
  nodeID = null,
  onSelectItem,
  selectedItem = null,
  seen = null,
}: {
  pipelineID: string;
  /** When set, only steps at this node — the per-step log for one node. */
  nodeID?: string | null;
  /** Selecting an item opens its whole journey, wherever the panel lives. */
  onSelectItem?: (itemKey: string) => void;
  selectedItem?: string | null;
  /**
   * How many items the COUNTERS have seen, when that is known.
   *
   * Passed in so the empty state can explain the discrepancy an operator
   * otherwise reads as a bug: the counters accumulate from when the kernel
   * started, the trace holds only what has moved since this console connected.
   * "3 seen" beside an empty trace looks broken until something says why.
   */
  seen?: number | null;
}) {
  const projection = useStore(projectionStore);
  const all = projection.state?.pipeline_steps;
  const [open, setOpen] = useState<string | null>(null);

  const steps = useMemo(
    () =>
      (all ?? []).filter(
        (s) => s.pipeline_id === pipelineID && (nodeID === null || s.node === nodeID),
      ),
    [all, pipelineID, nodeID],
  );

  // Newest item first — an operator watching live cares about what just
  // happened, and scrolling to the bottom for it is the wrong default.
  const byItem = useMemo(() => {
    const m = new Map<string, PipelineStep[]>();
    for (const s of steps) {
      m.set(s.item_key, [...(m.get(s.item_key) ?? []), s]);
    }
    return [...m.entries()].reverse();
  }, [steps]);

  const skipped = useMemo(
    () => steps.reduce((n, s) => n + s.dropped, 0),
    [steps],
  );

  if (all === undefined) {
    return (
      <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
        This kernel does not publish a step trace, so there is nothing to follow.
        That is a fact about the build, not about the traffic.
      </p>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Nothing has moved through {nodeID ? "this node" : "this pipeline"} since
          this console connected. The trace is live-only — it shows motion as it
          happens and never replays, so an empty view means "not right now", not
          "never".
        </p>
        {seen !== null && seen !== undefined && seen > 0 && (
          <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
            The counters say{" "}
            <span className="text-[var(--fg-secondary)]">
              {seen} {seen === 1 ? "item" : "items"}
            </span>{" "}
            went through. Those accumulate from when the KERNEL started; this
            trace begins when the console connects, so the two disagree until new
            traffic arrives. Send something through and it will appear here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {skipped > 0 && (
        <p
          className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] leading-[1.5] tint-wash"
          style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            {skipped} steps are not shown.
          </span>{" "}
          <span className="text-[var(--fg-muted)]">
            The kernel caps how many it sends per second so a busy pipeline
            cannot drown the plane. What you see is a sample of the traffic, not
            all of it — which is why the number is here rather than hidden.
          </span>
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {byItem.map(([itemKey, path]) => (
          <li
            key={itemKey}
            className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)] shadow-[var(--elevation-1)]"
          >
            {/* The header selects the item. A path shown here is necessarily
                partial — it is filtered to this pipeline, and to one node when
                the inspector renders it — so following an item properly means
                opening its own log. */}
            <button
              type="button"
              onClick={() => onSelectItem?.(itemKey)}
              disabled={onSelectItem === undefined}
              className={cn(
                "flex w-full flex-wrap items-baseline gap-x-2 border-b border-[var(--border-subtle)] px-3 py-1.5 text-left",
                onSelectItem !== undefined && "hover:brightness-110",
                selectedItem === itemKey && "tint-wash",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              )}
              style={
                selectedItem === itemKey
                  ? ({ "--tint": "var(--accent-bg)" } as React.CSSProperties)
                  : undefined
              }
            >
              <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                {formatClock(path[path.length - 1].at_unix_ms)}
              </span>
              <span className="font-mono text-[11px] text-[var(--fg-secondary)]">
                {itemKey}
              </span>
              <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
                {path.length} {path.length === 1 ? "step" : "steps"}
                {onSelectItem !== undefined && " · follow"}
              </span>
            </button>

            <ol className="flex flex-col">
              {path.map((s, i) => (
                <Step
                  key={`${s.node}-${s.at_unix_ms}-${i}`}
                  step={s}
                  last={i === path.length - 1}
                  open={open === `${itemKey}-${i}`}
                  onToggle={() =>
                    setOpen(open === `${itemKey}-${i}` ? null : `${itemKey}-${i}`)
                  }
                />
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One hop.
 *
 * The port is the whole point — "it reached the save" and "it took `false` and
 * stopped" are the two answers an operator is choosing between, and a row that
 * showed only the node name would answer neither.
 */
function Step({
  step,
  last,
  open,
  onToggle,
}: {
  step: PipelineStep;
  last: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const tone =
    step.outcome === "failed"
      ? "var(--status-err)"
      : step.outcome === "terminated"
        ? "var(--fg-muted)"
        : "var(--color-accent-400)";

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        disabled={step.payload === ""}
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left",
          step.payload !== "" && "hover:brightness-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        )}
      >
        <span aria-hidden="true" className="font-mono text-[10px] text-[var(--fg-muted)]">
          {last ? "└" : "├"}
        </span>
        <span className="font-mono text-[11px]">{step.node}</span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {step.kind}
        </span>
        {step.port !== "" && (
          <span className="font-mono text-[10.5px]" style={{ color: tone }}>
            → {step.port}
          </span>
        )}
        {step.outcome === "failed" && (
          <span className="font-mono text-[10.5px] text-[var(--status-err)]">
            failed
          </span>
        )}
        {step.reason !== "" && (
          <span className="text-[11px] text-[var(--fg-secondary)]">
            “{step.reason}”
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
          {step.duration_ms} ms
          {step.payload !== "" && (open ? " · hide" : " · payload")}
        </span>
      </button>

      {open && step.payload !== "" && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
          <pre className="max-h-[240px] overflow-auto px-3 py-2 font-mono text-[10.5px] leading-[1.5] text-[var(--fg-secondary)]">
            {step.payload}
          </pre>
          {step.payload_bytes > step.payload.length && (
            <p className="px-3 pb-2 text-[10px] text-[var(--status-warn)]">
              Showing {step.payload.length} of {step.payload_bytes} bytes — the
              kernel truncates the preview, so this is not the whole item.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function formatClock(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString();
}
