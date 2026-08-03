import { describe, it, expect } from "vitest";
import type { GraphDocument } from "@/ipc/types";
import {
  addNode,
  canWire,
  continuationPort,
  insertAfter,
  reasonsInUse,
  removeNode,
  terminate,
  unterminate,
  unwiredPorts,
  unwire,
  wire,
} from "./pipelineEdit";

function doc(): GraphDocument {
  return {
    id: "p1",
    revision: 1,
    trigger: { type: "ingress", ingress: "usgs" },
    scope: {
      nodes: [
        { id: "t", kind: "trigger" },
        { id: "gate", kind: "choice", config: { condition: "item.mag > 4.5" } },
        { id: "save", kind: "save_to_memory" },
        {
          id: "loop",
          kind: "foreach",
          body: {
            nodes: [{ id: "inner", kind: "map" }],
            edges: [],
            terminations: [{ node: "inner", port: "out", reason: "body end" }],
          },
        },
      ],
      edges: [
        { from: "t", from_port: "out", to: "gate" },
        { from: "gate", from_port: "true", to: "save" },
      ],
      terminations: [
        { node: "gate", port: "false", reason: "under the reporting threshold" },
      ],
    },
  };
}

/**
 * The three tiers. The whole point is how LITTLE lands in the middle one: every
 * rule here is a rule reimplemented client-side, which the handoff forbids.
 */
describe("canWire — the three tiers", () => {
  it("offers nothing where there is no connection point, and says nothing about it", () => {
    const d = doc();
    // A trigger has no input.
    expect(canWire(d, "gate", "true", "t").kind).toBe("not-a-target");
    // A node cannot wire to itself.
    expect(canWire(d, "gate", "true", "gate").kind).toBe("not-a-target");
    // A loop body is a separate scope; an edge across one is not offered.
    expect(canWire(d, "gate", "true", "inner").kind).toBe("not-a-target");
    expect(canWire(d, "inner", "out", "save").kind).toBe("not-a-target");
  });

  it("refuses exactly one thing mid-wire: a port that is terminated", () => {
    const d = doc();
    const v = canWire(d, "gate", "false", "save");
    expect(v.kind).toBe("refused");
    if (v.kind === "refused") {
      expect(v.reason).toMatch(/wired or terminated, never both/);
      // Names the constraint, then the action.
      expect(v.reason).toMatch(/Remove the termination to wire it/);
    }
  });

  it("lets a port fan out — a second edge from one port is not a limit the kernel has", () => {
    let d = doc();
    // `gate.true` already goes to `save`. Wiring it to another node must be
    // allowed: Successors is a slice, not a single target.
    d = addNode(d, "notify", () => "n2").doc;
    expect(canWire(d, "gate", "true", "n2").kind).toBe("ok");
  });

  it("lets everything else land, leaving the rule to the compiler", () => {
    let d = doc();
    d = addNode(d, "map", () => "m1").doc;
    // This would create a second input on `save` — refused by the compiler's
    // merge rule, and deliberately NOT refused here. The drop lands and the
    // refusal explains itself.
    expect(canWire(d, "gate", "true", "save").kind).toBe("ok");
    // A cycle is likewise the compiler's business.
    expect(canWire(d, "save", "out", "gate").kind).toBe("ok");
  });
});

describe("editing operations", () => {
  it("adds a node with no configuration, so the validator says what it needs", () => {
    const { doc: d, id } = addNode(doc(), "repeat_until", () => "loop2");
    expect(id).toBe("loop2");
    const added = d.scope.nodes.find((n) => n.id === "loop2");
    // Nothing pre-filled: a plausible default cap would mean the operator never
    // states an end, which is the thing the cap exists to make them state.
    expect(added?.config).toBeUndefined();
  });

  it("wires and unwires without disturbing anything else", () => {
    let d = doc();
    d = wire(d, "save", "out", "gate");
    expect(d.scope.edges).toHaveLength(3);
    // Wiring the same edge twice is a no-op rather than a duplicate.
    d = wire(d, "save", "out", "gate");
    expect(d.scope.edges).toHaveLength(3);
    d = unwire(d, "save", "out", "gate");
    expect(d.scope.edges).toHaveLength(2);
  });

  it("clears any edge from a port it terminates, because the two are exclusive", () => {
    let d = doc();
    d = terminate(d, "gate", "true", "handled elsewhere");
    expect(d.scope.edges.some((e) => e.from === "gate" && e.from_port === "true")).toBe(
      false,
    );
    expect(
      d.scope.terminations?.some((t) => t.node === "gate" && t.port === "true"),
    ).toBe(true);
  });

  it("replaces a termination rather than stacking a second on one port", () => {
    let d = doc();
    d = terminate(d, "gate", "false", "a better wording");
    const forPort = (d.scope.terminations ?? []).filter(
      (t) => t.node === "gate" && t.port === "false",
    );
    expect(forPort).toHaveLength(1);
    expect(forPort[0].reason).toBe("a better wording");
  });

  it("removes a node together with everything that referred to it", () => {
    const d = removeNode(doc(), "gate");
    expect(d.scope.nodes.some((n) => n.id === "gate")).toBe(false);
    // Leaving these would produce "unknown node" refusals pointing at something
    // no longer on screen.
    expect(d.scope.edges.some((e) => e.from === "gate" || e.to === "gate")).toBe(false);
    expect(d.scope.terminations?.some((t) => t.node === "gate")).toBe(false);
  });

  it("reaches into nested scopes", () => {
    const d = unterminate(doc(), "inner", "out");
    const loop = d.scope.nodes.find((n) => n.id === "loop");
    expect(loop?.body?.terminations).toHaveLength(0);
  });

  it("reports the ports that go nowhere, per scope", () => {
    // `save.out` and `save.error` are neither wired nor terminated.
    expect(unwiredPorts(doc(), "save").sort()).toEqual(["error", "out"]);
    // `gate` has both of its ports accounted for.
    expect(unwiredPorts(doc(), "gate")).toEqual([]);
  });
});

describe("termination reasons", () => {
  it("collects distinct reasons across every scope for the typeahead", () => {
    expect(reasonsInUse(doc())).toEqual([
      "body end",
      "under the reporting threshold",
    ]);
  });

  it("ignores blank reasons rather than offering an empty suggestion", () => {
    const d = doc();
    d.scope.terminations = [
      { node: "gate", port: "false", reason: "   " },
      { node: "save", port: "out", reason: "kept" },
    ];
    expect(reasonsInUse(d)).toEqual(["body end", "kept"]);
  });
});

/**
 * Adding a STEP, not a floating node.
 *
 * A node with no edge in never runs, makes the graph refuse for a reason that
 * looks unrelated, and forces the operator to discover the wiring gesture before
 * anything they added does anything.
 */
describe('insertAfter', () => {
  it('wires the new step in, and keeps what followed downstream of it', () => {
    // t → gate already exists. Inserting after `t` must put the new node
    // between them, not beside them.
    const { doc: d, id } = insertAfter(doc(), 't', 'out', 'map', () => 'm1');
    expect(id).toBe('m1');
    const from = (n: string, p: string) =>
      d.scope.edges.filter((e) => e.from === n && e.from_port === p).map((e) => e.to);
    expect(from('t', 'out')).toEqual(['m1']);
    // The rest of the pipeline is still attached — dropping it would be a
    // bigger change than the operator asked for.
    expect(from('m1', 'out')).toEqual(['gate']);
  });

  it('is a plain append when the port fed nothing', () => {
    const { doc: d, id } = insertAfter(doc(), 'save', 'out', 'notify', () => 'n1');
    expect(d.scope.edges.some((e) => e.from === 'save' && e.to === id)).toBe(true);
    expect(d.scope.edges.some((e) => e.from === id)).toBe(false);
  });

  it('names no continuation port for a gate, because that is a branch choice', () => {
    const gate = doc().scope.nodes.find((n) => n.id === 'gate')!;
    // Picking `true` silently would author a branch nobody chose.
    expect(continuationPort(gate)).toBeNull();
    const save = doc().scope.nodes.find((n) => n.id === 'save')!;
    expect(continuationPort(save)).toBe('out');
    const loop = doc().scope.nodes.find((n) => n.id === 'loop')!;
    expect(continuationPort(loop)).toBe('done');
  });
});
