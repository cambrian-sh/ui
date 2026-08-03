import { useMemo, useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/design-system/components";
import { projectionStore } from "@/store/projection";
import { cn } from "@/design-system/lib/utils";
import type { PipelineStep } from "@/ipc/types";

/**
 * One item's whole journey, as a log.
 *
 * The flow view answers "what is moving"; this answers "what happened to THIS
 * one". They are different questions and the second is the one asked when
 * something went wrong with a specific delivery — the message that never got a
 * reply, the record that did not save.
 *
 * Ordered oldest-first, unlike the flow view.
 *
 * That inversion is deliberate. A live feed is read newest-first because the
 * interesting thing is what just happened; a single item's history is read as a
 * story, and a story runs forwards. Reading a path backwards is how you end up
 * mistaking the last step for the cause.
 */
export function ItemHistory({
  pipelineID,
  itemKey,
  onClear,
  onSelectNode,
}: {
  pipelineID: string;
  itemKey: string;
  onClear: () => void;
  /** Jump the canvas to the node a step happened at. */
  onSelectNode?: (nodeID: string) => void;
}) {
  const projection = useStore(projectionStore);
  const all = projection.state?.pipeline_steps;

  const steps = useMemo(
    () =>
      (all ?? []).filter(
        (s) => s.pipeline_id === pipelineID && s.item_key === itemKey,
      ),
    [all, pipelineID, itemKey],
  );

  const last = steps[steps.length - 1];
  // An item whose last step ROUTED is still travelling — something downstream
  // has it. One that terminated or failed is finished, and saying which spares
  // an operator waiting for a step that is never coming.
  const settled = last !== undefined && last.outcome !== "routed";
  const total = steps.reduce((n, s) => n + s.duration_ms, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium">This item</h2>
          <span className="block truncate font-mono text-[11px] text-[var(--fg-secondary)]">
            {itemKey}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Back to the node
        </Button>
      </div>

      {steps.length === 0 ? (
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Nothing recorded for this item any more. The trace keeps a bounded
          window of recent steps, so an item stops being visible once enough
          traffic has followed it — it did not vanish, it aged out.
        </p>
      ) : (
        <>
          <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
            {steps.length} {steps.length === 1 ? "step" : "steps"} · {total} ms
            total ·{" "}
            {settled ? (
              <span
                style={{
                  color:
                    last.outcome === "failed"
                      ? "var(--status-err)"
                      : "var(--fg-muted)",
                }}
              >
                {last.outcome === "failed" ? "failed" : "stopped"} at {last.node}
              </span>
            ) : (
              <span className="text-[var(--color-accent-400)]">
                last seen leaving {last.node}
              </span>
            )}
          </p>

          <ol className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
            {steps.map((s, i) => (
              <Entry
                key={`${s.node}-${s.at_unix_ms}-${i}`}
                step={s}
                index={i}
                onSelectNode={onSelectNode}
              />
            ))}
          </ol>

          {!settled && (
            <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
              The last step routed onward, so this item was still travelling when
              the trace last saw it. A step that never arrives means it is stuck
              or was dropped between nodes — the node counters say which.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Entry({
  step,
  index,
  onSelectNode,
}: {
  step: PipelineStep;
  index: number;
  onSelectNode?: (nodeID: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tone =
    step.outcome === "failed"
      ? "var(--status-err)"
      : step.outcome === "terminated"
        ? "var(--fg-muted)"
        : "var(--color-accent-400)";

  return (
    <li className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {index + 1}
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {formatClock(step.at_unix_ms)}
        </span>
        {onSelectNode ? (
          <button
            type="button"
            onClick={() => onSelectNode(step.node)}
            className="font-mono text-[11px] text-[var(--fg-primary)] hover:underline"
            title="Show this node on the canvas"
          >
            {step.node}
          </button>
        ) : (
          <span className="font-mono text-[11px]">{step.node}</span>
        )}
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
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
          {step.duration_ms} ms
        </span>
      </div>

      {step.reason !== "" && (
        <p
          className={cn(
            "px-3 pb-1.5 text-[11px] leading-[1.5]",
            step.outcome === "failed"
              ? "text-[var(--status-err)]"
              : "text-[var(--fg-secondary)]",
          )}
        >
          {step.outcome === "failed" ? step.reason : `“${step.reason}”`}
        </p>
      )}

      {step.payload !== "" && (
        <div className="px-3 pb-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-mono text-[10px] text-[var(--color-accent-400)] hover:underline"
          >
            {open ? "hide what it carried" : "what it carried"}
          </button>
          {open && (
            <>
              <pre className="mt-1 max-h-[200px] overflow-auto rounded-[var(--radius-md)] bg-[var(--bg-base)] px-2 py-1.5 font-mono text-[10px] leading-[1.5] text-[var(--fg-secondary)]">
                {step.payload}
              </pre>
              {step.payload_bytes > step.payload.length && (
                <p className="mt-0.5 text-[10px] text-[var(--status-warn)]">
                  Showing {step.payload.length} of {step.payload_bytes} bytes —
                  truncated by the kernel, so this is not the whole item.
                </p>
              )}
            </>
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
