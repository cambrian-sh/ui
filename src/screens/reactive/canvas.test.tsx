import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphScope, PipelineSummary } from "@/ipc/types";
import { projectionStore } from "@/store/projection";

const getPipeline = vi.fn();
const dryRunPipeline = vi.fn();
const validatePipeline = vi.fn();
const savePipeline = vi.fn();
const transitionPipeline = vi.fn();

const studioCaptureStatus = vi.fn().mockResolvedValue({ samples: 0, profile_json: "" });

vi.mock("@/ipc", () => ({
  ipc: {
    studioCaptureStatus: (...a: unknown[]) => studioCaptureStatus(...a),
    getPipeline: (...a: unknown[]) => getPipeline(...a),
    dryRunPipeline: (...a: unknown[]) => dryRunPipeline(...a),
    validatePipeline: (...a: unknown[]) => validatePipeline(...a),
    savePipeline: (...a: unknown[]) => savePipeline(...a),
    transitionPipeline: (...a: unknown[]) => transitionPipeline(...a),
  },
}));

import {
  PipelineCanvas,
  topological,
  countEffects,
  portCounts,
  findNode,
} from "./PipelineCanvas";
import {
  FAMILY_LABEL,
  SPEC_BY_KIND,
  outputPorts,
  touchesWorld,
} from "./nodeVocabulary";

function summary(over: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    pipeline_id: "ingress:usgs",
    revision: 2,
    name: "USGS Earthquakes",
    state: "published",
    trigger_type: "ingress",
    trigger_ref: "usgs",
    node_count: 3,
    edge_count: 2,
    effect_node_count: 1,
    mapping_revision: 1,
    plan_checksum: "abc",
    semantics_checksum: "def",
    generated: true,
    dry_run: false,
    approved: false,
    ...over,
  };
}

const GRAPH = {
  id: "ingress:usgs",
  revision: 2,
  name: "USGS Earthquakes",
  trigger: { type: "ingress", ingress: "usgs" },
  scope: {
    nodes: [
      { id: "t", kind: "trigger", name: "USGS" },
      {
        id: "gate",
        kind: "choice",
        name: "large enough?",
        config: { condition: "item.mag > 4.5" },
      },
      { id: "save", kind: "save_to_memory", name: "save the quake" },
    ],
    edges: [
      { from: "t", from_port: "out", to: "gate" },
      { from: "gate", from_port: "true", to: "save" },
    ],
    terminations: [
      { node: "gate", port: "false", reason: "under the reporting threshold" },
      { node: "save", port: "out", reason: "nothing downstream" },
      { node: "save", port: "error", reason: "retry then dead-letter" },
    ],
  },
};

describe("the node vocabulary", () => {
  it("mirrors the kernel's ports, including the ones easy to forget", () => {
    // run_turn keeps `refused` separate from `error`: a decision is not a
    // failure to decide.
    expect(outputPorts({ id: "x", kind: "run_turn" })).toEqual([
      "out",
      "refused",
      "error",
    ]);
    // A loop has no `body` port — the body is a nested scope, not an edge.
    expect(outputPorts({ id: "x", kind: "foreach" })).toEqual([
      "done",
      "exhausted",
      "error",
    ]);
    // A switch's ports come from its configuration.
    expect(
      outputPorts({ id: "x", kind: "switch", config: { cases: ["a", "b"] } }),
    ).toEqual(["case:0", "case:1", "default"]);
  });

  it("uses the designed family names, because family is what says what a node can do", () => {
    // Gate / Transform / Effect / Control — the design's names. "Flow" and
    // "join" described the shape of the graph instead, which an operator can
    // already see.
    expect(FAMILY_LABEL.gate).toBe("Gate");
    expect(FAMILY_LABEL.transform).toBe("Transform");
    expect(FAMILY_LABEL.control).toBe("Control");
    expect(FAMILY_LABEL.effect).toBe("Effect · touches the world");
    expect(SPEC_BY_KIND.choice.family).toBe("gate");
    expect(SPEC_BY_KIND.switch.family).toBe("gate");
    expect(SPEC_BY_KIND.merge.family).toBe("transform");
    expect(SPEC_BY_KIND.repeat_until.family).toBe("control");
  });

  it("classes exactly the kinds that can change the world as effects", () => {
    for (const k of [
      "save_to_memory",
      "notify",
      "emit_event",
      "dispatch_agent",
      "start_plan",
      "decide",
      "fetch",
      "run_turn",
    ]) {
      expect(touchesWorld(k)).toBe(true);
    }
    for (const k of ["choice", "switch", "map", "split", "merge", "foreach"]) {
      expect(touchesWorld(k)).toBe(false);
    }
  });
});

describe("graph helpers", () => {
  it("orders nodes from the entry and still shows unreachable ones", () => {
    const scope: GraphScope = {
      nodes: [
        { id: "orphan", kind: "map" },
        { id: "t", kind: "trigger" },
        { id: "b", kind: "map" },
      ],
      edges: [{ from: "t", from_port: "out", to: "b" }],
    };
    const order = topological(scope).map((n) => n.id);
    // The entry leads; the unreachable node is still drawn, because the
    // operator needs to SEE the node that can never be reached.
    expect(order[0]).toBe("orphan");
    expect(order).toContain("t");
    expect(order).toContain("b");
    expect(order).toHaveLength(3);
  });

  it("counts effect nodes through nested loop bodies", () => {
    const scope: GraphScope = {
      nodes: [
        { id: "t", kind: "trigger" },
        {
          id: "loop",
          kind: "foreach",
          body: {
            nodes: [{ id: "n", kind: "notify" }],
            edges: [],
          },
        },
        { id: "s", kind: "save_to_memory" },
      ],
      edges: [],
    };
    expect(countEffects(scope)).toBe(2);
    expect(findNode(scope, "n")?.kind).toBe("notify");
  });

  it("takes port counts from the dry run and none from a refusal", () => {
    expect(
      portCounts({
        refused: "",
        run_id: "r",
        samples: 3,
        effects: [
          { node: "save", kind: "save_to_memory", effect_key: "k1", item_key: "a", summary: "" },
          { node: "save", kind: "save_to_memory", effect_key: "k2", item_key: "b", summary: "" },
        ],
        duplicates: [],
        terminations: [
          { node: "gate", port: "false", reason: "under the threshold", count: 4 },
        ],
        failures: [],
        elapsed_ms: 0,
        source: "archived deliveries",
        node_examples: [],
      }),
    ).toEqual({ "save.out": 2, "gate.false": 4 });

    // A refusal carries no counts, so none are invented.
    expect(
      portCounts({
        refused: "nothing captured",
        run_id: "",
        samples: 0,
        effects: [],
        duplicates: [],
        terminations: [],
        failures: [],
        elapsed_ms: 0,
        source: "",
        node_examples: [],
      }),
    ).toEqual({});
  });
});

describe("15a — the canvas", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    dryRunPipeline.mockResolvedValue({
      refused: "",
      run_id: "r",
      samples: 0,
      effects: [],
      duplicates: [],
      terminations: [],
      failures: [],
      elapsed_ms: 0,
    });
  });

  function mount(over: Record<string, unknown> = {}) {
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary(),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [{ node: "gate", paths: ["item.properties.mag"] }],
      ...over,
    });
    return render(
      <PipelineCanvas
        pipeline={summary()}
        onClose={() => {}}
        onDryRun={() => {}}
      />,
    );
  }

  it("draws admission as sealed and not reorderable", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("admission")).toBeInTheDocument());
    expect(screen.getByText(/Not nodes, and not reorderable/)).toBeInTheDocument();
    expect(
      screen.getByText(/namespace · identity binding · blocked senders · stranger policy/),
    ).toBeInTheDocument();
  });

  it("states how much of the world the graph can reach, before the buttons", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByText(/1 node can touch the world/)).toBeInTheDocument(),
    );
  });

  it("renders a terminated port as its own card carrying the reason", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByText(/“under the reporting threshold”/)).toBeInTheDocument(),
    );
    expect(screen.getByText("false · terminated")).toBeInTheDocument();
    // The wording is operator-facing copy, and the card says so.
    expect(
      screen.getAllByText(/what the run summary will say/).length,
    ).toBeGreaterThan(0);
  });

  it("marks a port that goes nowhere on the node itself", async () => {
    const broken = structuredClone(GRAPH);
    broken.scope.terminations = broken.scope.terminations.filter(
      (t) => t.port !== "false",
    );
    mount({
      graph_json: JSON.stringify(broken),
      refusals: [
        {
          constraint: "unwired-port",
          node: "gate",
          port: "false",
          message:
            "port gate.false is neither connected nor declared terminated — wire it, or declare it terminated with a reason",
        },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText(/false · goes nowhere/)).toBeInTheDocument(),
    );
  });

  it("summarises refusals by constraint and never says invalid", async () => {
    mount({
      refusals: [
        {
          constraint: "unwired-port",
          node: "gate",
          port: "false",
          message: "port gate.false is neither connected nor declared terminated — wire it, or declare it terminated with a reason",
        },
        {
          constraint: "unbounded-loop",
          node: "loop",
          port: "",
          message: "node \"loop\": max_iterations is required and must be positive (ADR-0114 D5)",
        },
      ],
    });
    await waitFor(() =>
      expect(
        screen.getByText(/2 refusals, and they all name their constraint/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/never the word “invalid”/)).toBeInTheDocument();
    expect(screen.getAllByText("Take me there")).toHaveLength(2);
    // The lifecycle track says WHY publish is dim, rather than leaving it dim.
    expect(screen.getByText(/published — blocked/)).toBeInTheDocument();
  });

  it("offers take-me-there only where there is somewhere to go", async () => {
    mount({
      refusals: [
        {
          constraint: "pipeline-shape",
          node: "",
          port: "",
          message: "pipeline: id is required",
        },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText(/1 refusal, and it names its constraint/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Take me there")).not.toBeInTheDocument();
  });

  it("inspects a node on select, with ports and where each one goes", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("large enough?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("large enough?"));
    await waitFor(() => expect(screen.getByText("Ports")).toBeInTheDocument());
    // `true` goes to the save; `false` is terminated with its reason.
    expect(screen.getByText("save")).toBeInTheDocument();
    expect(
      screen.getByText(/terminated — “under the reporting threshold”/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Counts are per port, not per node/).length,
    ).toBeGreaterThan(0);
  });

  it("refuses to offer a node test on an effect node, and says why", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("save the quake")).toBeInTheDocument());
    fireEvent.click(screen.getByText("save the quake"));
    await waitFor(() =>
      expect(
        screen.getByText(/Test this node on a pinned input/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Test this node on a pinned input/)).toBeDisabled();
    expect(
      screen.getByText(/would be the most misleading result this product could give/),
    ).toBeInTheDocument();
  });

  it("offers the NEXT lifecycle step from where the revision stands", async () => {
    // The summary says published, so the next step is arming — and with no
    // refusals standing, the button is real (contract 0093), not the disabled
    // placeholder older kernels required.
    mount();
    await waitFor(() =>
      expect(screen.getByText("Arm — make it live")).toBeInTheDocument(),
    );
    expect(screen.getByText("Arm — make it live")).toBeEnabled();
  });

  it("shows WHAT each node does to the data, not just that it exists", async () => {
    mount();
    // The choice's condition is the node. Without it the card says a gate is
    // here and nothing about what it tests.
    await waitFor(() =>
      expect(screen.getAllByText("item.mag > 4.5").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("when").length).toBeGreaterThan(0);
  });

  it("lists every configured value on the inspected node, verbatim", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("large enough?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("large enough?"));
    await waitFor(() => expect(screen.getByText("What it does")).toBeInTheDocument());
    expect(screen.getAllByText("item.mag > 4.5").length).toBeGreaterThan(0);
  });

  it("says so plainly when a node is configured with nothing", async () => {
    const bare = JSON.parse(JSON.stringify(GRAPH)) as {
      scope: { nodes: Array<{ id: string; config?: Record<string, unknown> }> };
    };
    for (const n of bare.scope.nodes) {
      if (n.id === "gate") delete n.config;
    }
    mount({ graph_json: JSON.stringify(bare) });
    await waitFor(() => expect(screen.getByText("large enough?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("large enough?"));
    await waitFor(() =>
      expect(screen.getByText(/Nothing is configured on this node/)).toBeInTheDocument(),
    );
  });

  it("names the fields a step reads, from the compiled expression", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getAllByText("item.properties.mag").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("reads").length).toBeGreaterThan(0);
  });

  it("puts the delivery guarantee and a description on the node card", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("save the quake")).toBeInTheDocument());
    // save_to_memory writes our own store under a key it controls.
    expect(screen.getByText("exactly-once")).toBeInTheDocument();
    // And a sentence, because `save_to_memory` is not one.
    expect(screen.getByText(/Writes knowledge/)).toBeInTheDocument();
  });

  it("names the move that resolves each refusal, keyed by constraint", async () => {
    mount({
      refusals: [
        {
          constraint: "unbounded-loop",
          node: "loop",
          port: "",
          message: "node loop: max_iterations is required and must be positive",
        },
        {
          constraint: "unwired-port",
          node: "gate",
          port: "false",
          message: "port gate.false is neither connected nor declared terminated",
        },
      ],
    });
    await waitFor(() => expect(screen.getByText("Set a cap")).toBeInTheDocument());
    expect(screen.getByText("Wire it to a node")).toBeInTheDocument();
  });

  it("offers a node test from the header too, disabled until a node is chosen", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Test a node")).toBeInTheDocument());
    expect(screen.getByText("Test a node")).toBeDisabled();
  });

  it("names the palette as the whole vocabulary, with no code node", async () => {
    mount();
    expect(
      screen.getByText(/There is no code node, and there never will be/),
    ).toBeInTheDocument();
    expect(screen.getByText("Effect · touches the world")).toBeInTheDocument();
  });

  it("renders the kernel's refusal instead of an empty graph", async () => {
    mount({
      refused: "no pipeline \"ingress:usgs\" is authored on this kernel",
      graph_json: "",
    });
    await waitFor(() =>
      expect(
        screen.getByText(/no pipeline "ingress:usgs" is authored on this kernel/),
      ).toBeInTheDocument(),
    );
  });
});

/**
 * 15a — canvas editing.
 *
 * The interaction the design turns on: refuse almost nothing while wiring, let
 * the drop land, and let the compiler explain. These pin that the middle tier
 * stays as small as it is.
 */
describe("15a — canvas editing", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    validatePipeline.mockReset();
    savePipeline.mockReset();
    dryRunPipeline.mockResolvedValue({
      refused: "", run_id: "r", samples: 0,
      effects: [], duplicates: [], terminations: [], failures: [], elapsed_ms: 0,
    });
    validatePipeline.mockResolvedValue({
      refused: "", refusals: [], node_count: 3, effect_node_count: 1,
      plan_checksum: "abc", semantics_checksum: "def",
    });
    savePipeline.mockResolvedValue({
      refused: "", pipeline_id: "ingress:usgs", revision: 3, refusals: [],
    });
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary(),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [{ node: "gate", paths: ["item.properties.mag"] }],
    });
  });

  async function mountEditing() {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    // Wait for the GRAPH, not just the button: Edit renders before the read
    // resolves and is disabled until there is something to edit.
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() =>
      expect(screen.getByText("Save as draft")).toBeInTheDocument(),
    );
  }

  it("offers nothing to add until editing, then offers the vocabulary", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    // Read mode: the palette reads but nothing is a control.
    expect(screen.getByText("Notify").closest("button")).toBeNull();

    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() =>
      expect(screen.getByText("Notify").closest("button")).not.toBeNull(),
    );
    // A trigger is never added from the palette — a pipeline has exactly one.
    // ("Trigger" appears twice: the family heading and the kind.)
    for (const el of screen.getAllByText("Trigger")) {
      expect(el.closest("button")).toBeNull();
    }
  });

  it("says nothing is stored until you save, and that saving makes a draft", async () => {
    await mountEditing();
    expect(
      screen.getByText(/Nothing is stored until you save, and saving makes a/),
    ).toBeInTheDocument();
  });

  it("adds a node bare, so the validator says what it needs", async () => {
    await mountEditing();
    fireEvent.click(screen.getByText("Repeat until"));
    await waitFor(() =>
      expect(screen.getAllByText("repeat_until").length).toBeGreaterThan(1),
    );
  });

  it("refuses a wire from a terminated port, naming the constraint and the fix", async () => {
    await mountEditing();
    // gate.false is terminated. Starting a wire there and dropping on save must
    // be refused — the one rule that qualifies mid-wire.
    fireEvent.click(screen.getAllByTitle("Wire gate.false")[0]);
    fireEvent.click(screen.getByText("save the quake"));
    await waitFor(() =>
      expect(screen.getByText(/wired or terminated, never both/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Remove the termination to wire it/)).toBeInTheDocument();
  });

  it("lets a wire land where only the compiler could object", async () => {
    await mountEditing();
    // gate.true already reaches save; wiring the trigger to save too would give
    // it two inputs, which the compiler refuses and this does not.
    fireEvent.click(screen.getAllByTitle("Wire t.out")[0]);
    fireEvent.click(screen.getByText("save the quake"));
    await waitFor(() =>
      expect(screen.queryByText(/never both/)).not.toBeInTheDocument(),
    );
    // The edge is DRAWN now rather than listed as "out → save" under the card,
    // so what is asserted is that it landed in the document the compiler is
    // asked about — which is the claim the test was always making.
    await waitFor(() => expect(validatePipeline).toHaveBeenCalled());
    const sent = JSON.parse(
      validatePipeline.mock.calls[validatePipeline.mock.calls.length - 1][0] as string,
    );
    expect(
      sent.scope.edges.some(
        (e: { from: string; from_port: string; to: string }) =>
          e.from === "t" && e.from_port === "out" && e.to === "save",
      ),
    ).toBe(true);
  });

  it("asks the compiler after the graph settles, and shows what it says", async () => {
    validatePipeline.mockResolvedValue({
      refused: "",
      refusals: [
        {
          constraint: "unbounded-loop",
          node: "loop",
          port: "",
          message: "node loop: max_iterations is required and must be positive (ADR-0114 D5)",
        },
      ],
      node_count: 4, effect_node_count: 1, plan_checksum: "", semantics_checksum: "",
    });
    await mountEditing();
    fireEvent.click(screen.getByText("Repeat until"));
    await waitFor(() => expect(validatePipeline).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() =>
      expect(screen.getByText(/max_iterations is required/)).toBeInTheDocument(),
    );
  });

  it("never reads a failed check as no refusals", async () => {
    validatePipeline.mockRejectedValue(new Error("kernel unreachable"));
    await mountEditing();
    fireEvent.click(screen.getByText("Notify"));
    await waitFor(
      () =>
        expect(
          screen.getByText(/could not be reached to check this graph/),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it("saves as a draft and says nothing is live", async () => {
    await mountEditing();
    fireEvent.click(screen.getByText("Notify"));
    fireEvent.click(screen.getByText("Save as draft"));
    await waitFor(() => expect(savePipeline).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Saved as draft revision 3/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Nothing is live yet — Publish freezes it, Arm makes it live/),
    ).toBeInTheDocument();
  });

  it("keeps save available while refusals stand, because a draft cannot run", async () => {
    validatePipeline.mockResolvedValue({
      refused: "",
      refusals: [
        {
          constraint: "unwired-port",
          node: "n1",
          port: "out",
          message: "port n1.out is neither connected nor declared terminated — wire it, or declare it terminated with a reason",
        },
      ],
      node_count: 4, effect_node_count: 2, plan_checksum: "", semantics_checksum: "",
    });
    await mountEditing();
    fireEvent.click(screen.getByText("Notify"));
    await waitFor(() => expect(validatePipeline).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() =>
      expect(
        screen.getByText(/is neither connected nor declared terminated/),
      ).toBeInTheDocument(),
    );
    // Refusals hold Publish, not Save — and while EDITING there is no
    // lifecycle button at all: nothing can move until the draft is saved.
    expect(screen.getByText("Save as draft")).toBeEnabled();
    expect(screen.queryByText("Publish")).toBeNull();
  });

  it("discards an edit back to what the kernel stored", async () => {
    await mountEditing();
    fireEvent.click(screen.getByText("Notify"));
    // The palette no longer repeats a kind identical to its label, so "notify"
    // appears exactly where the node is: on the card that was just added.
    await waitFor(() =>
      expect(screen.getAllByText("notify")).toHaveLength(1),
    );
    fireEvent.click(screen.getByText("Discard"));
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    // Back to the stored graph; the added node is gone.
    expect(screen.queryAllByText("notify")).toHaveLength(0);
  });
});

describe("the terminate dialog", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    validatePipeline.mockReset();
    dryRunPipeline.mockResolvedValue({
      refused: "", run_id: "r", samples: 0,
      effects: [], duplicates: [], terminations: [], failures: [], elapsed_ms: 0,
    });
    validatePipeline.mockResolvedValue({
      refused: "", refusals: [], node_count: 3, effect_node_count: 1,
      plan_checksum: "", semantics_checksum: "",
    });
    getPipeline.mockResolvedValue({
      refused: "", summary: summary(),
      graph_json: JSON.stringify(GRAPH), refusals: [],
    });
  });

  it("takes free text, previews the sentence, and suggests what this pipeline already says", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Edit"));
    // Every port in the stored graph is accounted for, so the offer to
    // terminate appears only once a port actually goes nowhere. A fresh notify
    // has two.
    await waitFor(() =>
      expect(screen.getByText("Notify").closest("button")).not.toBeNull(),
    );
    fireEvent.click(screen.getByText("Notify"));
    await waitFor(() =>
      expect(
        screen.getAllByText("Terminate it with a reason").length,
      ).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByText("Terminate it with a reason")[0]);

    await waitFor(() =>
      expect(screen.getByLabelText("Why are these discarded?")).toBeInTheDocument(),
    );
    // Empty is not acceptable — the compiler requires a reason.
    expect(screen.getByText("Terminate this port")).toBeDisabled();
    // Typeahead over what this pipeline already says.
    expect(
      screen.getAllByText("under the reporting threshold").length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Why are these discarded?"), {
      target: { value: "nothing follows a save here" },
    });
    // The live preview of the sentence it lands in.
    expect(screen.getByText(/How this will read in a dry run/)).toBeInTheDocument();
    expect(screen.getByText("nothing follows a save here")).toBeInTheDocument();
    expect(screen.getByText("Terminate this port")).toBeEnabled();

    fireEvent.click(screen.getByText("Terminate this port"));
    // The reason now appears on the port's own card, in the wording the run
    // summary will use. (It also becomes a typeahead suggestion, hence two.)
    await waitFor(() =>
      expect(
        screen.getAllByText(/“nothing follows a save here”/).length,
      ).toBeGreaterThan(0),
    );
  });
});

/**
 * Per-port counts come from the LIVE meters first.
 *
 * They used to come only from the dry run, which refuses outright for a chat
 * pipeline — so every cell in the ports table read "—" while the live meters
 * held the real numbers the whole time.
 */
describe("the ports table counts", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    studioCaptureStatus.mockResolvedValue({ samples: 0, profile_json: "" });
    getPipeline.mockResolvedValue({
      refused: "", summary: summary(),
      graph_json: JSON.stringify(GRAPH), refusals: [], reads: [],
    });
    // The dry run refuses, exactly as it does for a chat pipeline.
    dryRunPipeline.mockResolvedValue({
      refused: "this kernel captures no deliveries, so there is nothing to replay",
      run_id: "", samples: 0, elapsed_ms: 0,
      effects: [], duplicates: [], terminations: [], failures: [],
    });
    projectionStore.getState().hydrate({
      connection: { status: "live" }, role: "operator",
      kernel_version: "", contract_version: "", capabilities: [], contract_skew: 0,
      plugins: [], cursor: 1, plans: [], sessions: [], audit_tail: [],
      pending_hitl: [], agents: [], tools: [], skills: [], mcp_servers: [],
      scope: {}, watch_configs: [],
      lifecycle: {} as never, verifier_pool: {} as never, cost_dashboard: {} as never,
      pipeline_meters: {
        "ingress:usgs": {
          pipeline_id: "ingress:usgs", revision: 2,
          nodes: [
            {
              node: "gate", entered: 52, in_flight: 0, failed: 0, passed_on: 0,
              ports: { true: 47, false: 5 }, mean_latency_ms: 2,
            },
          ],
        },
      },
    } as never);
  });

  it("uses the live per-port numbers when the dry run has none", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText("large enough?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("large enough?"));
    await waitFor(() => expect(screen.getByText("Ports")).toBeInTheDocument());
    // 47 took `true`, 5 took `false` — from the meters, not the refused dry run.
    // getAllBy, because a count is now shown in the ports table AND on the
    // graph itself; asserting a single occurrence would be asserting that the
    // canvas does not show counts.
    expect(screen.getAllByText("47").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });
});

/**
 * Contract 0091 — the field schema on the canvas.
 *
 * The kernel projects, the console renders: chips in the inspector, a picker
 * while editing, and a followed field lighting the nodes that touch it.
 */
describe("the field schema on the canvas", () => {
  const FIELD_SCHEMA = JSON.stringify({
    t: { available: [{ path: "mag", types: ["number"] }, { path: "place", types: ["string"] }] },
    gate: {
      available: [{ path: "mag", types: ["number"] }, { path: "place", types: ["string"] }],
      reads: ["mag"],
    },
    save: {
      available: [{ path: "mag", types: ["number"] }, { path: "place", types: ["string"] }],
    },
  });

  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    validatePipeline.mockReset();
    dryRunPipeline.mockResolvedValue({
      refused: "", run_id: "r", samples: 0,
      effects: [], duplicates: [], terminations: [], failures: [], elapsed_ms: 0,
    });
    validatePipeline.mockResolvedValue({
      refused: "", refusals: [], node_count: 3, effect_node_count: 1,
      plan_checksum: "abc", semantics_checksum: "def",
      field_schema_json: FIELD_SCHEMA,
    });
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary(),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [{ node: "gate", paths: ["item.mag"] }],
      field_schema_json: FIELD_SCHEMA,
    });
  });

  it("shows the kernel's fields at a selected node, and follows one across the graph", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("large enough?"));

    // The inspector renders the projection — the fields that arrive here.
    await waitFor(() =>
      expect(screen.getByText("Fields that arrive here")).toBeInTheDocument(),
    );
    expect(screen.getByText("place")).toBeInTheDocument();

    // Clicking a field follows it: the banner names it and tallies who
    // touches it — the gate reads `mag`, so following it finds one reader.
    fireEvent.click(screen.getByText("mag"));
    await waitFor(() => expect(screen.getByText("following")).toBeInTheDocument());
    expect(screen.getByText(/1 routes on it/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("stop following"));
    await waitFor(() =>
      expect(screen.queryByText("following")).not.toBeInTheDocument(),
    );
  });

  it("while editing, the gate's condition opens as rows, and the expression stays a toggle away", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() =>
      expect(screen.getByText("Save as draft")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("large enough?"));

    // The stored condition `item.mag > 4.5` opens as a ROW — field,
    // comparison, value — not as syntax.
    await waitFor(() =>
      expect(screen.getByLabelText("condition 0 field")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("condition 0 field")).toHaveValue("mag");
    expect(screen.getByLabelText("condition 0 value")).toHaveValue("4.5");

    // The raw expression is one toggle away, and a chip typed into it there.
    fireEvent.click(screen.getByText("edit as an expression"));
    await waitFor(() => expect(screen.getByText("place")).toBeInTheDocument());
    const condition = screen.getByLabelText("condition") as HTMLTextAreaElement;
    expect(condition.value).toBe("item.mag > 4.5");
    fireEvent.click(screen.getByText("place"));
    await waitFor(() =>
      expect((screen.getByLabelText("condition") as HTMLTextAreaElement).value)
        .toContain("item.place"),
    );
  });

  it("an absent projection reads as unchecked, never as an empty payload", async () => {
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary(),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [],
      // An older kernel: the field is simply missing.
    });
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("large enough?"));
    await waitFor(() => expect(screen.getByText(/Unchecked/)).toBeInTheDocument());
  });
});

/**
 * Contract 0092 — the data itself, on the inspector.
 */
describe("the data through a step", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    validatePipeline.mockReset();
    validatePipeline.mockResolvedValue({
      refused: "", refusals: [], node_count: 3, effect_node_count: 1,
      plan_checksum: "abc", semantics_checksum: "def", field_schema_json: "",
    });
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary(),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [],
      field_schema_json: JSON.stringify({
        gate: { available: [{ path: "mag", types: ["number"] }] },
      }),
    });
    dryRunPipeline.mockResolvedValue({
      refused: "", run_id: "r", samples: 2,
      effects: [], duplicates: [], terminations: [], failures: [], elapsed_ms: 12,
      source: "archived deliveries",
      node_examples: [
        {
          node: "gate",
          item_key: "abc123",
          value_json: JSON.stringify({ mag: 5.3, place: "62 km W of Tobelo, Indonesia" }),
          result_json: "",
        },
      ],
    });
  });

  it("shows the real item a node received, and where it came from", async () => {
    render(
      <PipelineCanvas pipeline={summary()} onClose={() => {}} onDryRun={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("large enough?"));

    await waitFor(() =>
      expect(screen.getByText("The data through this step")).toBeInTheDocument(),
    );
    // The leading line is the operator's terms, not JSON. (Tobelo appears
    // twice — the summary line and the raw envelope — which is the design.)
    expect(screen.getByText(/mag 5\.3/)).toBeInTheDocument();
    expect(screen.getAllByText(/Tobelo/).length).toBeGreaterThan(0);
    // And the source is named — real deliveries, not redacted shapes.
    expect(screen.getByText(/archived deliveries/)).toBeInTheDocument();

    // The picker chips carry the example value beside the type.
    expect(screen.getByText(/= 5\.3/)).toBeInTheDocument();
  });
});

/**
 * Contract 0093 — the lifecycle finally has a button.
 */
describe("publishing and arming from the canvas", () => {
  beforeEach(() => {
    getPipeline.mockReset();
    dryRunPipeline.mockReset();
    transitionPipeline.mockReset();
    dryRunPipeline.mockResolvedValue({
      refused: "", run_id: "r", samples: 0,
      effects: [], duplicates: [], terminations: [], failures: [], elapsed_ms: 0,
      source: "", node_examples: [],
    });
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary({ state: "draft" }),
      graph_json: JSON.stringify(GRAPH),
      refusals: [],
      reads: [],
      field_schema_json: "",
    });
  });

  it("a draft's next step is Publish, and the kernel's answer becomes the state", async () => {
    transitionPipeline.mockResolvedValue({
      refused: "", pipeline_id: "ingress:usgs", revision: 2, state: "published",
    });
    render(
      <PipelineCanvas
        pipeline={summary({ state: "draft" })}
        onClose={() => {}}
        onDryRun={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Publish"));
    await waitFor(() =>
      expect(screen.getByText(/frozen and inspectable, not live/)).toBeInTheDocument(),
    );
    // The button now offers the NEXT step from where the revision IS.
    expect(screen.getByText("Arm — make it live")).toBeInTheDocument();
  });

  it("a refusal is the registry's own sentence, and the state does not move", async () => {
    transitionPipeline.mockResolvedValue({
      refused: "pipeline p1 r2: cannot publish from retired",
      pipeline_id: "", revision: 0, state: "",
    });
    render(
      <PipelineCanvas
        pipeline={summary({ state: "draft" })}
        onClose={() => {}}
        onDryRun={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Publish"));
    await waitFor(() =>
      expect(screen.getByText(/cannot publish from retired/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Publish")).toBeInTheDocument();
  });

  it("refusals hold Publish, with the count as the reason", async () => {
    getPipeline.mockResolvedValue({
      refused: "",
      summary: summary({ state: "draft" }),
      graph_json: JSON.stringify(GRAPH),
      refusals: [
        { constraint: "port-unwired", node: "gate", port: "false", message: "wire it" },
      ],
      reads: [],
      field_schema_json: "",
    });
    render(
      <PipelineCanvas
        pipeline={summary({ state: "draft" })}
        onClose={() => {}}
        onDryRun={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("large enough?")).toBeInTheDocument(),
    );
    const publish = screen.getByText("Publish").closest("button")!;
    expect(publish).toBeDisabled();
    expect(publish.title).toContain("refusal");
  });
});
