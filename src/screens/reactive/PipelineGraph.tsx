import { createContext, useContext, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/design-system/lib/utils";
import type {
  GraphDocument,
  PipelineNodeMeter,
  PipelineRefusal,
} from "@/ipc/types";
import { FAMILY_TONE, SPEC_BY_KIND, deliveryMode, portTone } from "./nodeVocabulary";
import { configSummary } from "./nodeConfig";
import { canWire } from "./pipelineEdit";
import { buildGraph, type Counts, type StepData, type StopData } from "./graphLayout";
import "@xyflow/react/dist/style.css";

/**
 * The canvas, as a graph.
 *
 * Everything the old vertical list said is still said — the family tag, the
 * delivery mode, the config line, the fields it reads, the live reading, the
 * refusal on the node it concerns. What changes is that it is now a DRAWING:
 * edges connect, branches leave the right edge and fan out, and every port pill
 * sits on the card that owns it with a handle the edge visibly attaches to.
 *
 * Handles are the reason this is worth a library. React Flow measures where each
 * handle actually landed in the DOM and routes the edge to it, so a card that
 * grows a line of text moves its own edges — the exact failure that made the
 * earlier hand-rolled connector layer untenable, solved by construction rather
 * than by a rule everybody has to remember.
 */

type Handlers = {
  onSelect: (id: string) => void;
  onPortClick: (node: string, port: string) => void;
  onTerminate: (node: string, port: string) => void;
  onUnterminate: (node: string, port: string) => void;
  onRemove: (node: string) => void;
  doc: GraphDocument | null;
};

// Passed by context rather than baked into node data: the handlers are stable
// and the data bag is rebuilt on every meter tick, so putting them in data would
// make every node re-render for a reason that has nothing to do with the node.
const HandlerContext = createContext<Handlers | null>(null);

const nodeTypes = { step: StepNode, stop: StopNode, group: GroupNode };

export function PipelineGraph({
  doc,
  counts,
  reads,
  live,
  refusals,
  worstInFlight,
  selected,
  editing,
  wiring,
  recentlyMoved,
  onSelect,
  onPortClick,
  onTerminate,
  onUnterminate,
  onRemove,
  onInteract,
}: {
  doc: GraphDocument;
  counts: Counts;
  reads: Map<string, string[]>;
  live: Map<string, PipelineNodeMeter>;
  refusals: PipelineRefusal[];
  worstInFlight: number;
  selected: string | null;
  editing: boolean;
  wiring: { node: string; port: string } | null;
  recentlyMoved: Set<string>;
  onSelect: (id: string) => void;
  onPortClick: (node: string, port: string) => void;
  onTerminate: (node: string, port: string) => void;
  onUnterminate: (node: string, port: string) => void;
  onRemove: (node: string) => void;
  /** Any pan, zoom or click — which pauses the live layer (Logs §5). */
  onInteract?: () => void;
}) {
  const { nodes, edges } = useMemo(
    () =>
      buildGraph({
        doc,
        counts,
        reads,
        live,
        refusals,
        worstInFlight,
        selected,
        editing,
        wiring,
        recentlyMoved,
        hasConfigLine: (n) => configSummary(n) !== null,
      }),
    [
      doc,
      counts,
      reads,
      live,
      refusals,
      worstInFlight,
      selected,
      editing,
      wiring,
      recentlyMoved,
    ],
  );

  const handlers = useMemo<Handlers>(
    () => ({ onSelect, onPortClick, onTerminate, onUnterminate, onRemove, doc }),
    [onSelect, onPortClick, onTerminate, onUnterminate, onRemove, doc],
  );

  return (
    <HandlerContext.Provider value={handlers}>
      <div className="h-full w-full" aria-label="pipeline graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          // fitView with padding is what fixes "two nodes in the top-left
          // eighth of a 2560px canvas": the graph is centred in whatever space
          // it has, so an idle pipeline reads as idle rather than as failed to
          // load. maxZoom keeps a two-node graph from ballooning to fill it.
          fitViewOptions={{ padding: 0.22, maxZoom: 1.15 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onMoveStart={onInteract}
          onNodeClick={(_, n) => {
            onInteract?.();
            if (n.type === "step") onSelect(n.id);
          }}
        >
          <Background gap={18} color="var(--border-subtle)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </HandlerContext.Provider>
  );
}

/* ── The card ───────────────────────────────────────────────────────────── */

function StepNode({ data }: NodeProps) {
  const d = data as unknown as StepData;
  const h = useContext(HandlerContext);
  const spec = SPEC_BY_KIND[d.node.kind];
  const family = spec?.family ?? "transform";
  const line = configSummary(d.node);

  // While a wire is being drawn, say whether THIS node can take it. A node that
  // is simply not a connection point is dimmed and says nothing — there is
  // nothing to explain about a trigger having no input.
  const verdict =
    d.wiring && d.editing && h?.doc
      ? canWire(h.doc, d.wiring.node, d.wiring.port, d.node.id)
      : null;

  return (
    <div
      className={cn(
        "relative w-[250px] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] shadow-[var(--elevation-1)]",
        d.selected && "ring-2 ring-[var(--color-accent-400)]",
        family === "effect" && "tint-wash",
        d.refusals.length > 0 && "tint-wash tint-ring",
        verdict?.kind === "not-a-target" && "opacity-40",
        verdict?.kind === "ok" && "ring-1 ring-[var(--color-accent-400)]",
      )}
      style={
        d.refusals.length > 0
          ? ({ "--tint": "var(--status-err)" } as React.CSSProperties)
          : family === "effect"
            ? ({ "--tint": "var(--status-warn)" } as React.CSSProperties)
            : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-[var(--border-strong)]"
      />

      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium">
            {d.node.name || d.node.id}
          </span>
          <span
            className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em]"
            style={{ color: FAMILY_TONE[family] }}
          >
            {family}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
            {d.node.kind}
          </span>
          {deliveryMode(d.node.kind) && (
            <span className="font-mono text-[9.5px] text-[var(--fg-muted)]">
              {deliveryMode(d.node.kind)}
            </span>
          )}
        </div>

        {/* WHAT IT DOES TO THE DATA. Without it the canvas is a list of verbs:
            it says a choice is here, not what it tests. */}
        {line ? (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
              {line.label}
            </span>
            <span
              className={cn(
                "font-mono text-[10.5px] break-all",
                line.expression
                  ? "text-[var(--color-accent-400)]"
                  : "text-[var(--fg-secondary)]",
              )}
            >
              {line.value}
            </span>
          </p>
        ) : spec ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[var(--fg-muted)]">
            {spec.lead}
          </p>
        ) : null}

        {d.reads.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
              reads
            </span>
            {d.reads.map((p) => (
              <span
                key={p}
                className="rounded-[3px] bg-[var(--bg-base)] px-1 py-0.5 font-mono text-[9.5px] text-[var(--fg-secondary)]"
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {d.meter && <LiveReading meter={d.meter} worst={d.worstInFlight} />}

        {d.refusals.map((r, i) => (
          <div
            key={i}
            className="mt-1.5 rounded-[var(--radius-md)] p-2 tint-wash tint-ring"
            style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
          >
            <span className="font-mono text-[10px] text-[var(--status-err)]">
              {r.constraint}
              {r.port && ` · ${r.port}`}
            </span>
            <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--fg-secondary)]">
              {r.message}
            </p>
          </div>
        ))}
      </div>

      {/* THE PORTS, on the card that owns them, each with the handle its edge
          attaches to. This is the fix for pills floating in a detached row: an
          operator can see which node a port belongs to without inferring it
          from vertical proximity. */}
      <div className="flex flex-col gap-[3px] border-t border-[var(--border-subtle)] px-3 py-2">
        {d.ports.map((port) => {
          // An unwired port is toned as the problem it is, so the pill, its
          // handle, the dashed edge and the red terminal it lands on all read as
          // one thing rather than as four unrelated marks.
          const unwired = !d.wired.has(port) && !d.terminated.has(port);
          const tone = portTone(port, { unwired });
          const drawing =
            d.wiring?.node === d.node.id && d.wiring.port === port;
          return (
            <div key={port} className="relative flex items-center justify-end">
              {d.editing ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    h?.onPortClick(d.node.id, port);
                  }}
                  title={`Wire ${d.node.id}.${port}`}
                  className={cn(
                    "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] tint-fill",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                    drawing && "ring-1 ring-[var(--color-accent-400)]",
                  )}
                  style={{ "--tint": tone, color: tone } as React.CSSProperties}
                >
                  {port}
                </button>
              ) : (
                <span
                  className="rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] tint-fill"
                  style={{ "--tint": tone, color: tone } as React.CSSProperties}
                >
                  {port}
                </span>
              )}
              <Handle
                type="source"
                id={port}
                position={Position.Right}
                className="!h-1.5 !w-1.5 !border-0"
                style={{
                  background: tone,
                  right: -13,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              />
            </div>
          );
        })}
      </div>

      {d.editing && d.node.kind !== "trigger" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            h?.onRemove(d.node.id);
          }}
          className="absolute -bottom-5 left-0 text-[10.5px] text-[var(--fg-muted)] hover:underline"
        >
          remove this node
        </button>
      )}
    </div>
  );
}

/* ── Where a branch ends ────────────────────────────────────────────────── */

/**
 * A terminal: either a port terminated on purpose, or one that goes nowhere.
 *
 * Drawn as a node rather than as a note under the card because that is what it
 * IS — a place items end up. Three of them beside a node read as three
 * destinations, which is the shape of the decision; three notes stacked under it
 * read as commentary, which is not.
 */
function StopNode({ data }: NodeProps) {
  const d = data as unknown as StopData;
  const h = useContext(HandlerContext);
  const dead = d.reason === null;

  return (
    <div
      className={cn(
        "w-[176px] rounded-[var(--radius-md)] border border-dashed px-2.5 py-1.5",
        dead
          ? "border-[var(--status-err)] tint-wash"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface)]/60",
      )}
      style={
        dead ? ({ "--tint": "var(--status-err)" } as React.CSSProperties) : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-[var(--border-strong)]"
      />
      {dead ? (
        <>
          {/* NAMED. A terminal that does not say which port it ends is a
              dead end you have to trace an edge backwards to identify. */}
          <span className="font-mono text-[10px] text-[var(--status-err)]">
            {d.port} · goes nowhere
          </span>
          <div className="mt-0.5 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                h?.onPortClick(d.owner, d.port);
              }}
              className="text-[10.5px] text-[var(--color-accent-400)] hover:underline"
            >
              Wire it
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                h?.onTerminate(d.owner, d.port);
              }}
              className="text-[10.5px] text-[var(--fg-secondary)] hover:underline"
            >
              Terminate it with a reason
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">
              {d.port} · terminated
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--fg-muted)]">
              {d.count ?? 0}
            </span>
          </div>
          <p className="text-[11px] leading-[1.45] text-[var(--fg-secondary)]">
            “{d.reason}”
          </p>
          {/* The wording is load-bearing: it is what the run summary and the dry
              run will say about these items. */}
          <p className="text-[9.5px] leading-[1.4] text-[var(--fg-muted)]">
            {d.count !== undefined
              ? "discarded on purpose — this wording is what the run summary says"
              : "this wording is what the run summary will say"}
          </p>
        </>
      )}
    </div>
  );
}

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as { label: string };
  return (
    <div className="h-full w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)]/40">
      <span className="absolute -top-4 left-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
        {d.label}
      </span>
    </div>
  );
}

/**
 * One node's live reading, and whether it is the queue.
 *
 * Marked as the bottleneck only when it holds the most items AND holds more than
 * one: on a pipeline where every node has one item in flight, calling the first
 * of them a bottleneck would be noise dressed as a finding.
 */
export function LiveReading({
  meter,
  worst,
}: {
  meter: PipelineNodeMeter;
  worst: number;
}) {
  const bottleneck = meter.in_flight > 1 && meter.in_flight === worst;
  return (
    <div
      className={cn(
        "mt-1.5 rounded-[var(--radius-md)] px-1.5 py-1",
        bottleneck && "tint-wash",
      )}
      style={
        bottleneck
          ? ({ "--tint": "var(--status-warn)" } as React.CSSProperties)
          : undefined
      }
    >
      {/* PUNCTUATED. "now idle 2 seen ~4172 ms" was four facts run together as
          one unreadable string; separators are what make it four facts. */}
      <div className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10.5px]">
        <span className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
          now
        </span>
        {meter.in_flight > 0 ? (
          <span
            style={{
              color: bottleneck
                ? "var(--status-warn)"
                : "var(--color-accent-400)",
            }}
          >
            {meter.in_flight} in flight
          </span>
        ) : (
          <span className="text-[var(--fg-muted)]">idle</span>
        )}
        <Sep />
        <span className="text-[var(--fg-muted)]">{meter.entered} seen</span>
        {meter.mean_latency_ms > 0 && (
          <>
            <Sep />
            <span className="text-[var(--fg-muted)]">
              {meter.mean_latency_ms} ms avg
            </span>
          </>
        )}
        {meter.failed > 0 && (
          <>
            <Sep />
            <span className="text-[var(--status-err)]">
              {meter.failed} failed
            </span>
          </>
        )}
      </div>
      {bottleneck && (
        <span className="text-[10px] leading-[1.4] text-[var(--status-warn)]">
          Most items are waiting here.
        </span>
      )}
    </div>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-[var(--border-strong)]">
      ·
    </span>
  );
}
