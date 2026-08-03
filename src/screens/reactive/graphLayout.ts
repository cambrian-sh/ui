import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import { Position } from "@xyflow/react";
import type {
  GraphDocument,
  GraphNode,
  GraphScope,
  GraphTermination,
  PipelineNodeMeter,
  PipelineRefusal,
} from "@/ipc/types";
import { outputPorts } from "./nodeVocabulary";

/**
 * 16a — laying the pipeline out as a GRAPH.
 *
 * The canvas used to render a topologically-sorted vertical LIST with a short
 * dashed stub between cards. Every sentence on it was right and it still failed
 * at the one thing a canvas is for: nothing connected anything, branches read as
 * footnotes stacked under the node they left, and the port pills floated in a row
 * below the card with no visible ownership. An operator could not tell what led
 * to what.
 *
 * # Why a real layout engine rather than more CSS
 *
 * The handoff's §3.4 rule — "each edge draws its own stub inside its own row,
 * never a shared connector layer" — was written after a hand-rolled SVG overlay
 * with hardcoded endpoints broke when a card grew a line of text. That rule is
 * about HARDCODED geometry, and it does not argue against a layout engine that
 * derives positions from the graph: dagre computes, it does not assume. The
 * failure mode the rule protects against cannot occur here, because nothing in
 * this file knows a pixel position it did not calculate.
 *
 * # A terminated port is a DESTINATION, not an annotation
 *
 * The single most important shape decision here. `refused` going nowhere on
 * purpose is a place an item ends up, exactly as much as the next node is, and
 * drawing it as a real terminal node is what turns three stacked footnotes into
 * three visible destinations leaving the node. It also makes the count legible
 * in the one place it means something — on the edge that carried it.
 */

export type Counts = Record<string, number>;

/** What a node in the rendered graph carries. React Flow requires a data bag. */
export type StepData = {
  kind: "step";
  node: GraphNode;
  refusals: PipelineRefusal[];
  reads: string[];
  meter: PipelineNodeMeter | undefined;
  worstInFlight: number;
  ports: string[];
  /** Ports with an outgoing edge — the rest end at a terminal node. */
  wired: Set<string>;
  /**
   * Ports terminated on purpose.
   *
   * Kept separate from `wired` because both lack an outgoing edge and they mean
   * opposite things: one is a decision the operator wrote a reason for, the
   * other is a hole. Toning them the same would paint every deliberate discard
   * as a fault.
   */
  terminated: Set<string>;
  selected: boolean;
  editing: boolean;
  /** Set while a wire is being drawn from somewhere, for the target verdict. */
  wiring: { node: string; port: string } | null;
  depth: number;
};

export type StopData = {
  kind: "stop";
  /** The termination reason, or null when the port simply goes nowhere. */
  reason: string | null;
  port: string;
  owner: string;
  count: number | undefined;
};

export type GroupData = { kind: "group"; label: string };

const CARD_W = 250;
const STOP_W = 176;
const STOP_H = 44;

/**
 * How tall a card will be.
 *
 * An estimate, deliberately. dagre needs a size before React has measured
 * anything, and a wrong-by-a-few-pixels rank gap is invisible, whereas waiting
 * for a measurement pass would make the graph jump on first paint.
 */
export function cardHeight(d: {
  hasConfigLine: boolean;
  reads: number;
  hasMeter: boolean;
  refusals: number;
}): number {
  return (
    72 +
    (d.hasConfigLine ? 20 : 16) +
    (d.reads > 0 ? 20 : 0) +
    (d.hasMeter ? 24 : 0) +
    d.refusals * 46
  );
}

export type BuildInput = {
  doc: GraphDocument;
  counts: Counts;
  reads: Map<string, string[]>;
  live: Map<string, PipelineNodeMeter>;
  refusals: PipelineRefusal[];
  worstInFlight: number;
  selected: string | null;
  editing: boolean;
  wiring: { node: string; port: string } | null;
  hasConfigLine: (n: GraphNode) => boolean;
  /** Items seen on this port since the kernel started, for the edge label. */
  recentlyMoved: Set<string>;
};

export function buildGraph(input: BuildInput): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  // LEFT TO RIGHT. The brief's shape: branches leave a node's right edge and fan
  // out, rather than stacking underneath it as a list of notes.
  g.setGraph({ rankdir: "LR", nodesep: 22, ranksep: 72, marginx: 24, marginy: 24 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const parentOf = new Map<string, string>();

  walk(input.doc.scope, null, 0);

  function walk(scope: GraphScope, groupID: string | null, depth: number) {
    const terminations = new Map<string, GraphTermination>();
    for (const t of scope.terminations ?? []) {
      terminations.set(`${t.node}.${t.port}`, t);
    }

    for (const node of scope.nodes) {
      const ports = outputPorts(node);
      const wired = new Set(
        scope.edges.filter((e) => e.from === node.id).map((e) => e.from_port),
      );
      const nodeRefusals = input.refusals.filter((r) => r.node === node.id);
      const nodeReads = input.reads.get(node.id) ?? [];
      const meter = input.live.get(node.id);

      const h = cardHeight({
        hasConfigLine: input.hasConfigLine(node),
        reads: nodeReads.length,
        hasMeter: meter !== undefined,
        refusals: nodeRefusals.length,
      });
      g.setNode(node.id, { width: CARD_W, height: h });
      if (groupID) {
        g.setParent(node.id, groupID);
        parentOf.set(node.id, groupID);
      }

      nodes.push({
        id: node.id,
        type: "step",
        position: { x: 0, y: 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          kind: "step",
          node,
          refusals: nodeRefusals,
          reads: nodeReads,
          meter,
          worstInFlight: input.worstInFlight,
          ports,
          wired,
          terminated: new Set(
            ports.filter((p) => terminations.has(`${node.id}.${p}`)),
          ),
          selected: input.selected === node.id,
          editing: input.editing,
          wiring: input.wiring,
          depth,
        } satisfies StepData,
      });

      // Every port that does NOT continue into another node gets a terminal of
      // its own, so the fan is complete: an operator counts destinations, not
      // ports-minus-footnotes.
      for (const port of ports) {
        if (wired.has(port)) continue;
        const t = terminations.get(`${node.id}.${port}`);
        const id = `stop:${node.id}.${port}`;
        g.setNode(id, { width: STOP_W, height: STOP_H });
        if (groupID) {
          g.setParent(id, groupID);
          parentOf.set(id, groupID);
        }
        g.setEdge(node.id, id);
        nodes.push({
          id,
          type: "stop",
          position: { x: 0, y: 0 },
          targetPosition: Position.Left,
          data: {
            kind: "stop",
            reason: t ? t.reason : null,
            port,
            owner: node.id,
            count: input.counts[`${node.id}.${port}`],
          } satisfies StopData,
        });
        edges.push(
          portEdge(node.id, port, id, input, {
            terminated: t !== undefined,
            dead: t === undefined,
          }),
        );
      }

      if (node.body) {
        const gid = `group:${node.id}`;
        g.setNode(gid, { width: 10, height: 10 });
        if (groupID) g.setParent(gid, groupID);
        nodes.push({
          id: gid,
          type: "group",
          position: { x: 0, y: 0 },
          data: { kind: "group", label: "body · runs once per iteration" } satisfies GroupData,
          style: { zIndex: -1 },
        });
        walk(node.body, gid, depth + 1);
      }
    }

    for (const e of scope.edges) {
      g.setEdge(e.from, e.to);
      edges.push(portEdge(e.from, e.from_port, e.to, input, {}));
    }
  }

  dagre.layout(g);

  // dagre reports centres in absolute space; React Flow wants top-left, and a
  // child's position relative to its group.
  const abs = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of nodes) {
    const d = g.node(n.id);
    if (!d) continue;
    abs.set(n.id, { x: d.x - d.width / 2, y: d.y - d.height / 2, w: d.width, h: d.height });
  }

  for (const n of nodes) {
    const a = abs.get(n.id);
    if (!a) continue;
    const parent = parentOf.get(n.id);
    const p = parent ? abs.get(parent) : undefined;
    n.position = p ? { x: a.x - p.x, y: a.y - p.y } : { x: a.x, y: a.y };
    if (parent) {
      n.parentId = parent;
      n.extent = "parent";
    }
    if (n.type === "group") {
      n.style = { ...n.style, width: a.w, height: a.h };
    }
  }

  return { nodes, edges };
}

function portEdge(
  from: string,
  port: string,
  to: string,
  input: BuildInput,
  opts: { terminated?: boolean; dead?: boolean },
): Edge {
  const n = input.counts[`${from}.${port}`];
  const key = `${from}.${port}`;
  return {
    id: `${from}.${port}->${to}`,
    source: from,
    sourceHandle: port,
    target: to,
    type: "smoothstep",
    // Animated ONLY where something actually moved. An animated edge with no
    // traffic on it is the same lie as a pulsing dot on an idle pipeline — and
    // it is the lie that makes people stop trusting the whole view.
    animated: input.recentlyMoved.has(key),
    label: n !== undefined ? `${port} · ${n}` : port,
    data: { port, terminated: opts.terminated === true, dead: opts.dead === true },
    style: {
      stroke: opts.dead
        ? "var(--status-err)"
        : opts.terminated
          ? "var(--border-strong)"
          : "var(--border-strong)",
      strokeWidth: 1,
      strokeDasharray: opts.terminated || opts.dead ? "4 3" : undefined,
    },
    labelStyle: {
      fill: "var(--fg-muted)",
      fontSize: 9.5,
      fontFamily: "var(--font-mono, ui-monospace)",
    },
    labelBgStyle: { fill: "var(--bg-base)" },
    labelBgPadding: [3, 1] as [number, number],
  };
}

/**
 * Ports that have carried something recently, for edge animation.
 *
 * Recency is deliberately short: the question an animated edge answers is "is
 * this moving NOW", and an edge still animating a minute after the last item
 * would answer a different one.
 */
export function recentlyMovedPorts(
  steps: { pipeline_id: string; node: string; port: string; at_unix_ms: number }[],
  pipelineID: string,
  now: number,
  windowMs = 8000,
): Set<string> {
  const s = new Set<string>();
  for (const st of steps) {
    if (st.pipeline_id !== pipelineID) continue;
    if (st.port === "") continue;
    if (now - st.at_unix_ms > windowMs) continue;
    s.add(`${st.node}.${st.port}`);
  }
  return s;
}
