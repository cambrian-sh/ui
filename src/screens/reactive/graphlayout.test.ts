import { describe, it, expect } from "vitest";
import type { GraphDocument } from "@/ipc/types";
import { buildGraph, recentlyMovedPorts, type BuildInput } from "./graphLayout";

const GRAPH: GraphDocument = {
  trigger: { type: "ingress", ref: "usgs" },
  scope: {
    nodes: [
      { id: "t", kind: "trigger", name: "quake arrives", config: {} },
      { id: "gate", kind: "choice", name: "large enough?", config: { when: "mag > 4.5" } },
      { id: "save", kind: "remember", name: "save the quake", config: {} },
    ],
    edges: [
      { from: "t", from_port: "out", to: "gate" },
      { from: "gate", from_port: "true", to: "save" },
    ],
    terminations: [
      { node: "gate", port: "false", reason: "under the reporting threshold" },
    ],
  },
} as never;

function input(over: Partial<BuildInput> = {}): BuildInput {
  return {
    doc: GRAPH,
    counts: {},
    reads: new Map(),
    live: new Map(),
    refusals: [],
    worstInFlight: 0,
    selected: null,
    editing: false,
    wiring: null,
    recentlyMoved: new Set(),
    hasConfigLine: () => true,
    ...over,
  };
}

/**
 * The layout is a pure function, and it is tested as one.
 *
 * Everything visual about the canvas depends on this producing the right SHAPE —
 * so the shape is asserted here, where a failure names the defect, rather than
 * through the DOM, where it would surface as "could not find text".
 */
describe("laying a pipeline out as a graph", () => {
  it("draws an edge for every wire, attached to the port it leaves from", () => {
    const { edges } = buildGraph(input());
    const wire = edges.find((e) => e.source === "gate" && e.target === "save");
    expect(wire).toBeDefined();
    // sourceHandle is what makes the edge leave the RIGHT port rather than the
    // card in general — the difference between a graph and a flowchart.
    expect(wire!.sourceHandle).toBe("true");
  });

  it("gives a terminated port a destination of its own", () => {
    // The shape decision this whole file turns on. `false` going nowhere on
    // purpose is a place an item ends up, exactly as much as the next node is.
    // Drawn as a note under the card it reads as commentary; drawn as a node it
    // reads as one of the three things that can happen here.
    const { nodes, edges } = buildGraph(input());
    const stop = nodes.find((n) => n.id === "stop:gate.false");
    expect(stop?.type).toBe("stop");
    expect((stop!.data as { reason: string }).reason).toBe(
      "under the reporting threshold",
    );
    expect(
      edges.some((e) => e.source === "gate" && e.target === "stop:gate.false"),
    ).toBe(true);
  });

  it("distinguishes a port terminated on purpose from one that goes nowhere", () => {
    const orphan = structuredClone(GRAPH);
    orphan.scope.terminations = [];
    const { nodes } = buildGraph(input({ doc: orphan }));
    const stop = nodes.find((n) => n.id === "stop:gate.false");
    // null reason IS the distinction: a hole, not a decision.
    expect((stop!.data as { reason: string | null }).reason).toBeNull();
  });

  it("puts every port's count on the edge that carried it", () => {
    const { edges } = buildGraph(
      input({ counts: { "gate.true": 47, "gate.false": 5 } }),
    );
    expect(edges.find((e) => e.sourceHandle === "true")?.label).toBe("true · 47");
    expect(edges.find((e) => e.sourceHandle === "false")?.label).toBe("false · 5");
  });

  it("animates only the edges something actually moved through", () => {
    // An edge that animates without traffic is the same lie as a pulsing dot on
    // an idle pipeline, and it is the lie that stops people trusting the view.
    const { edges } = buildGraph(
      input({ recentlyMoved: new Set(["gate.true"]) }),
    );
    expect(edges.find((e) => e.sourceHandle === "true")?.animated).toBe(true);
    expect(edges.find((e) => e.sourceHandle === "false")?.animated).toBe(false);
  });

  it("lays out left to right, so branches fan out rather than stack", () => {
    const { nodes } = buildGraph(input());
    const t = nodes.find((n) => n.id === "t")!;
    const gate = nodes.find((n) => n.id === "gate")!;
    const save = nodes.find((n) => n.id === "save")!;
    expect(gate.position.x).toBeGreaterThan(t.position.x);
    expect(save.position.x).toBeGreaterThan(gate.position.x);

    // And the two things leaving `gate` are siblings at the same rank, which is
    // what "three destinations" looks like as opposed to "three footnotes".
    const stop = nodes.find((n) => n.id === "stop:gate.false")!;
    expect(stop.position.x).toBeGreaterThan(gate.position.x);
    expect(stop.position.y).not.toBe(save.position.y);
  });

  it("marks terminated ports on the card so they are not toned as faults", () => {
    const { nodes } = buildGraph(input());
    const gate = nodes.find((n) => n.id === "gate")!;
    const d = gate.data as { terminated: Set<string>; wired: Set<string> };
    // Both lack an outgoing edge and they mean opposite things. Collapsing them
    // would paint every deliberate discard red.
    expect(d.terminated.has("false")).toBe(true);
    expect(d.wired.has("false")).toBe(false);
    expect(d.wired.has("true")).toBe(true);
  });

  it("nests a loop body inside a group rather than flattening it", () => {
    const looped = structuredClone(GRAPH);
    looped.scope.nodes.push({
      id: "loop",
      kind: "repeat_until",
      name: "until settled",
      config: { max_iterations: 3 },
      body: {
        nodes: [{ id: "inner", kind: "notify", name: "ping", config: {} }],
        edges: [],
        terminations: [],
      },
    } as never);
    const { nodes } = buildGraph(input({ doc: looped }));
    const inner = nodes.find((n) => n.id === "inner")!;
    // Scope is structure, not decoration: a body node drawn loose in the main
    // graph would claim it runs once, when it runs once per iteration.
    expect(inner.parentId).toBe("group:loop");
    expect(nodes.some((n) => n.id === "group:loop")).toBe(true);
  });
});

describe("which edges are moving", () => {
  const now = 1785287993258;
  const s = (over: Record<string, unknown>) => ({
    pipeline_id: "p", node: "gate", port: "true", at_unix_ms: now, ...over,
  }) as never;

  it("ignores traffic from another pipeline", () => {
    expect(
      recentlyMovedPorts([s({ pipeline_id: "other" })], "p", now).size,
    ).toBe(0);
  });

  it("forgets a port that has gone quiet", () => {
    // "Is this moving now" and "did this ever run" are different questions, and
    // an edge that keeps animating answers the second while appearing to answer
    // the first.
    expect(recentlyMovedPorts([s({ at_unix_ms: now - 30_000 })], "p", now).size)
      .toBe(0);
    expect(recentlyMovedPorts([s({ at_unix_ms: now - 1_000 })], "p", now).size)
      .toBe(1);
  });

  it("ignores a step with no port, which named no edge", () => {
    expect(recentlyMovedPorts([s({ port: "" })], "p", now).size).toBe(0);
  });
});

describe("stored positions and overlap", () => {
  it("a stored layout wins over the automatic one, and its terminals follow", () => {
    const doc = JSON.parse(JSON.stringify(GRAPH)) as GraphDocument;
    doc.scope.nodes.find((n) => n.id === "gate")!.layout = { x: 900, y: 340 };
    const { nodes } = buildGraph(input({ doc }));

    const gate = nodes.find((n) => n.id === "gate")!;
    expect(gate.position).toEqual({ x: 900, y: 340 });

    // The gate's false-branch terminal moved with it rather than staying
    // where the unmoved graph would have put it.
    const stop = nodes.find((n) => n.id === "stop:gate.false")!;
    expect(stop.position.x).toBeGreaterThan(900);
    expect(Math.abs(stop.position.y - 340)).toBeLessThan(200);
  });

  it("auto-placed nodes are nudged off a stored position rather than overlapping it", () => {
    const doc = JSON.parse(JSON.stringify(GRAPH)) as GraphDocument;
    // Park the gate exactly where dagre puts the trigger (0-ish).
    const { nodes: before } = buildGraph(input());
    const t = before.find((n) => n.id === "t")!;
    doc.scope.nodes.find((n) => n.id === "gate")!.layout = { ...t.position };

    const { nodes } = buildGraph(input({ doc }));
    const gate = nodes.find((n) => n.id === "gate")!;
    const trigger = nodes.find((n) => n.id === "t")!;
    // The hand-placed gate stays; the auto-placed trigger moved out of it.
    expect(gate.position).toEqual(t.position);
    const apart =
      Math.abs(trigger.position.y - gate.position.y) > 100 ||
      Math.abs(trigger.position.x - gate.position.x) > 260;
    expect(apart).toBe(true);
  });

  it("editing makes steps draggable and pipes grabbable; reading does not", () => {
    const editable = buildGraph(input({ editing: true }));
    const readable = buildGraph(input({ editing: false }));

    const step = editable.nodes.find((n) => n.id === "gate")!;
    expect(step.draggable).toBe(true);
    expect(step.deletable).toBe(true);
    // A trigger is never deletable — a pipeline has exactly one.
    expect(editable.nodes.find((n) => n.id === "t")!.deletable).toBe(false);

    const pipe = editable.edges.find((e) => e.id === "t.out->gate")!;
    expect(pipe.reconnectable).toBe(true);
    expect(readable.edges.find((e) => e.id === "t.out->gate")!.reconnectable).toBe(false);

    // A terminated pipe is not grabbable: it carries an authored reason.
    const term = editable.edges.find((e) => e.id === "gate.false->stop:gate.false")!;
    expect(term.reconnectable).toBe(false);
  });
});
