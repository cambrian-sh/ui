import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { projectionStore } from "@/store/projection";
import { cn } from "@/design-system/lib/utils";
import type { PipelineStep } from "@/ipc/types";

/**
 * 16a — the flow rail: sixty seconds of wall clock along the bottom of the canvas.
 *
 * # Why this and not only animated edges
 *
 * A dot travelling a wire is worth building and it is the smaller half. It makes
 * topology legible at a glance, but it only says something WHILE traffic is
 * arriving — and most pipelines are idle most of the time. On a quiet kernel an
 * animated canvas is a blank canvas, which is the failure this rail exists to fix:
 * a mostly-empty screen tells an operator the app failed to load, when in fact
 * the pipeline is fine and simply idle.
 *
 * So traffic and silence get THE SAME REAL ESTATE. Every arrival is a mark placed
 * by its time; the gap since the last one is drawn as a span, at whatever width
 * it has earned. Idle becomes a shape rather than the word "idle" — a pipeline
 * that has gone quiet looks obviously quiet, and one being hammered looks it
 * before you read a single number.
 *
 * # Two rules inherited from Logs §5
 *
 * Motion pauses BECAUSE YOU SCROLLED or selected a node — never because you found
 * a toggle. A canvas that animates under a cursor is unusable.
 *
 * And it never drops what it held while paused. It says how far behind you are
 * AND WHETHER ANY OF IT MATTERS, which is the half that makes catching up a
 * decision instead of a reflex: one signal that took an error port is worth
 * interrupting for, forty-one that took the happy path are not.
 */

/** The rail's span. Sixty seconds is what a person can hold in their head. */
export const WINDOW_MS = 60_000;

/** How often the rail advances. Marks move a pixel a second; this is not a poll. */
const TICK_MS = 1000;

export function FlowRail({
  pipelineID,
  entryNodeID,
  paused = false,
  pausedReason = "",
  onResume,
}: {
  pipelineID: string;
  /**
   * The node an item ARRIVES at — the graph's entry.
   *
   * Arrivals are counted here rather than "any step", because one item crossing
   * five nodes is one arrival and five steps. A rail that marked steps would
   * report a three-node pipeline as three times busier than a one-node pipeline
   * carrying identical traffic.
   */
  entryNodeID: string | null;
  paused?: boolean;
  pausedReason?: string;
  onResume?: () => void;
}) {
  const projection = useStore(projectionStore);
  const all = projection.state?.pipeline_steps;

  const [now, setNow] = useState(() => Date.now());
  // What `now` was when the pause began. Everything after it is held, counted,
  // and reported — never dropped, and never silently folded into the view.
  const frozenAt = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      if (frozenAt.current === null) frozenAt.current = Date.now();
      return;
    }
    frozenAt.current = null;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [paused]);

  const steps = useMemo(
    () => (all ?? []).filter((s) => s.pipeline_id === pipelineID),
    [all, pipelineID],
  );

  const arrivals = useMemo(
    () => arrivalsIn(steps, entryNodeID),
    [steps, entryNodeID],
  );

  // While paused the rail shows the window as it stood, so the shape under the
  // cursor does not move. The held arrivals are reported instead.
  const edge = paused && frozenAt.current !== null ? frozenAt.current : now;
  const visible = useMemo(
    () => arrivals.filter((a) => a.at >= edge - WINDOW_MS && a.at <= edge),
    [arrivals, edge],
  );
  const held = useMemo(
    () => (paused ? arrivals.filter((a) => a.at > edge) : []),
    [arrivals, paused, edge],
  );
  const heldErrors = held.filter((a) => a.bad).length;

  const last = arrivals.length > 0 ? arrivals[arrivals.length - 1].at : null;
  const quietFor = last === null ? null : Math.max(0, edge - last);

  if (all === undefined) {
    return (
      <Shell>
        <p className="px-3 text-[10.5px] text-[var(--fg-muted)]">
          This kernel does not publish a step trace, so there is no flow to draw.
          That is a fact about the build, not about the traffic.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 px-3 pt-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
          flow · last 60s
        </span>
        <LiveDot paused={paused} moving={visible.length > 0} />
        <span className="font-mono text-[10px] text-[var(--fg-secondary)]">
          {visible.length === 0
            ? "nothing arrived"
            : `${visible.length} ${visible.length === 1 ? "arrival" : "arrivals"}`}
        </span>
        {/* The gap, as a number as well as a shape. The shape is what you see
            first; the number is what you quote to somebody else. */}
        {quietFor !== null && quietFor > 2000 && (
          <span className="font-mono text-[10px] text-[var(--fg-muted)]">
            quiet for {formatGap(quietFor)}
          </span>
        )}
        {last === null && (
          <span className="font-mono text-[10px] text-[var(--fg-muted)]">
            nothing since this console connected
          </span>
        )}
      </div>

      <Track
        arrivals={visible}
        edge={edge}
        quietFor={quietFor}
        paused={paused}
      />

      {/* Logs §5: say that pausing holds rather than drops, and say whether the
          backlog is worth returning for. */}
      {paused && (
        <div className="flex flex-wrap items-baseline gap-x-2 px-3 pb-1.5">
          <span className="font-mono text-[10px] text-[var(--status-warn)]">
            paused{pausedReason && ` — ${pausedReason}`}
          </span>
          <span className="font-mono text-[10px] text-[var(--fg-muted)]">
            held, not dropped
          </span>
          {held.length > 0 && (
            <>
              <span className="font-mono text-[10px] text-[var(--fg-secondary)]">
                {held.length} new
              </span>
              <span
                className="font-mono text-[10px]"
                style={{
                  color:
                    heldErrors > 0 ? "var(--status-err)" : "var(--fg-muted)",
                }}
              >
                {heldErrors > 0
                  ? `${heldErrors} took an error port`
                  : "none took an error port"}
              </span>
            </>
          )}
          {onResume && (
            <button
              type="button"
              onClick={onResume}
              className="ml-auto text-[10.5px] text-[var(--color-accent-400)] hover:underline"
            >
              resume
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
      {children}
    </div>
  );
}

/**
 * The track itself.
 *
 * Positions are percentages of the window, so the rail is resolution-independent
 * and needs no measurement — the same layout-driven-geometry rule the canvas
 * follows, for the same reason: nothing here can be broken by a container
 * changing size.
 */
function Track({
  arrivals,
  edge,
  quietFor,
  paused,
}: {
  arrivals: Arrival[];
  edge: number;
  quietFor: number | null;
  paused: boolean;
}) {
  // The silence, at full width when it fills the window. This is the whole
  // point of the rail: an operator should be able to SEE that nothing has
  // happened for a minute without reading a word.
  const gapPct =
    quietFor === null
      ? 100
      : Math.min(100, (quietFor / WINDOW_MS) * 100);

  return (
    <div className="relative mx-3 my-1.5 h-[26px] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-surface)]">
      {gapPct > 1 && (
        <div
          className="absolute inset-y-0 right-0 border-l border-dashed border-[var(--border-subtle)]"
          style={{
            width: `${gapPct}%`,
            background:
              "repeating-linear-gradient(135deg, transparent 0 5px, var(--bg-base) 5px 6px)",
          }}
          title={`no arrivals for ${quietFor === null ? "the whole window" : formatGap(quietFor)}`}
        />
      )}

      {arrivals.map((a) => {
        const pct = ((a.at - (edge - WINDOW_MS)) / WINDOW_MS) * 100;
        return (
          <span
            key={a.key}
            aria-hidden="true"
            className={cn(
              "absolute top-[3px] bottom-[3px] w-[2px] rounded-full",
              !paused && "flow-mark",
            )}
            style={{
              left: `${Math.max(0, Math.min(100, pct))}%`,
              background: a.bad
                ? "var(--status-err)"
                : "var(--color-accent-400)",
            }}
          />
        );
      })}

      {/* The now edge. Without it the right-hand end reads as "the data stops
          here" rather than "this is the present moment". */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-px bg-[var(--fg-muted)]"
      />

      <span className="absolute bottom-[1px] left-1 font-mono text-[8.5px] text-[var(--fg-muted)]">
        −60s
      </span>
      <span className="absolute right-1.5 bottom-[1px] font-mono text-[8.5px] text-[var(--fg-muted)]">
        now
      </span>
    </div>
  );
}

/**
 * The live indicator.
 *
 * Pulses only while something is actually arriving. A dot that pulses on an idle
 * pipeline is the same lie as an animated edge with nothing on it.
 */
function LiveDot({ paused, moving }: { paused: boolean; moving: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        !paused && moving && "flow-pulse",
      )}
      style={{
        background: paused
          ? "var(--status-warn)"
          : moving
            ? "var(--color-accent-400)"
            : "var(--fg-muted)",
      }}
    />
  );
}

/* ── The data ───────────────────────────────────────────────────────────── */

export type Arrival = { key: string; at: number; bad: boolean };

/**
 * One mark per item that ARRIVED, not per step it took.
 *
 * `bad` is true when the item took an error port anywhere, which is what makes
 * the paused pill's "whether any of it matters" answerable. Note this is per
 * ARRIVAL, so an item that failed three nodes downstream still colours the mark
 * at its entry — that is the correct attribution: the arrival is what went wrong.
 */
export function arrivalsIn(
  steps: PipelineStep[],
  entryNodeID: string | null,
): Arrival[] {
  const bad = new Set<string>();
  for (const s of steps) {
    if (s.outcome === "failed" || s.port === "error" || s.port === "refused") {
      bad.add(s.item_key);
    }
  }

  // Entry steps when the entry node is known. Otherwise the first step seen for
  // each item, which is the same thing whenever a trace is complete and degrades
  // honestly when it is not.
  const marks: Arrival[] = [];
  if (entryNodeID !== null) {
    for (const s of steps) {
      if (s.node !== entryNodeID) continue;
      marks.push({
        key: `${s.item_key}-${s.at_unix_ms}`,
        at: s.at_unix_ms,
        bad: bad.has(s.item_key),
      });
    }
  } else {
    const seen = new Set<string>();
    for (const s of steps) {
      if (seen.has(s.item_key)) continue;
      seen.add(s.item_key);
      marks.push({
        key: `${s.item_key}-${s.at_unix_ms}`,
        at: s.at_unix_ms,
        bad: bad.has(s.item_key),
      });
    }
  }
  return marks.sort((a, b) => a.at - b.at);
}

export function formatGap(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest === 0 ? `${m}m` : `${m}m ${rest}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
