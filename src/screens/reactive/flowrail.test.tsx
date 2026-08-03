import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PipelineStep } from "@/ipc/types";
import { projectionStore } from "@/store/projection";
import { FlowRail, arrivalsIn, formatGap, WINDOW_MS } from "./FlowRail";

const NOW = 1785287993258;

function step(over: Partial<PipelineStep> = {}): PipelineStep {
  return {
    pipeline_id: "ingress:usgs",
    revision: 1,
    run_id: "run-1",
    item_key: "quake-a",
    node: "t",
    kind: "trigger",
    port: "out",
    outcome: "routed",
    reason: "",
    duration_ms: 3,
    payload: "",
    payload_bytes: 0,
    dropped: 0,
    at_unix_ms: NOW - 5000,
    ...over,
  };
}

function push(pipeline_steps: PipelineStep[] | undefined) {
  projectionStore.getState().hydrate({
    connection: { status: "live" }, role: "operator",
    kernel_version: "", contract_version: "", capabilities: [], contract_skew: 0,
    plugins: [], cursor: 1, plans: [], sessions: [], audit_tail: [],
    pending_hitl: [], agents: [], tools: [], skills: [], mcp_servers: [],
    scope: {}, watch_configs: [],
    lifecycle: {} as never, verifier_pool: {} as never, cost_dashboard: {} as never,
    pipeline_steps,
  } as never);
}

/**
 * 16a — the flow rail.
 *
 * The rail exists because an animated canvas says nothing on a quiet kernel, and
 * most kernels are quiet most of the time. So the behaviour worth pinning is not
 * that traffic draws — it is that SILENCE draws, that the two are distinguishable
 * from "the app did not load", and that pausing is honest about what it held.
 */
describe("the flow rail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says a quiet pipeline is quiet, not empty", () => {
    push([step({ at_unix_ms: NOW - 40_000 })]);
    render(<FlowRail pipelineID="ingress:usgs" entryNodeID="t" />);

    // The distinction the whole rail exists to make: this pipeline is fine and
    // idle, which must not read the same as a screen that failed to load.
    expect(screen.getByText(/quiet for 40s/)).toBeInTheDocument();
    expect(screen.getByText(/1 arrival/)).toBeInTheDocument();
  });

  it("separates 'nothing yet' from 'nothing lately'", () => {
    push([]);
    render(<FlowRail pipelineID="ingress:usgs" entryNodeID="t" />);
    // Never having seen anything is a different claim from having gone quiet,
    // and a rail that conflated them would blame the pipeline for the console.
    expect(
      screen.getByText(/nothing since this console connected/),
    ).toBeInTheDocument();
  });

  it("reports a build with no step trace as a fact about the build", () => {
    push(undefined);
    render(<FlowRail pipelineID="ingress:usgs" entryNodeID="t" />);
    expect(screen.getByText(/fact about the build/)).toBeInTheDocument();
  });

  it("holds while paused and says whether the backlog matters", () => {
    push([
      step({ item_key: "a", at_unix_ms: NOW - 1000 }),
      // After the freeze: held, counted, and reported — never dropped.
      step({ item_key: "b", at_unix_ms: NOW + 4000 }),
      step({ item_key: "b", node: "gate", port: "error", at_unix_ms: NOW + 4100 }),
    ]);
    render(
      <FlowRail
        pipelineID="ingress:usgs"
        entryNodeID="t"
        paused
        pausedReason="a node is selected"
      />,
    );

    expect(screen.getByText(/paused — a node is selected/)).toBeInTheDocument();
    // The fear about pausing is that it loses data. Say plainly that it does not.
    expect(screen.getByText("held, not dropped")).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
    // The half that makes catching up a decision rather than a reflex.
    expect(screen.getByText("1 took an error port")).toBeInTheDocument();
  });

  it("says plainly when a backlog is not worth returning for", () => {
    push([
      step({ item_key: "a", at_unix_ms: NOW - 1000 }),
      step({ item_key: "b", at_unix_ms: NOW + 4000 }),
    ]);
    render(<FlowRail pipelineID="ingress:usgs" entryNodeID="t" paused />);
    expect(screen.getByText("none took an error port")).toBeInTheDocument();
  });
});

describe("arrivals", () => {
  it("counts one arrival per item, not one per step it took", () => {
    // The bug this prevents: a five-node pipeline reporting itself as five times
    // busier than a one-node pipeline carrying identical traffic.
    const steps = [
      step({ item_key: "a", node: "t" }),
      step({ item_key: "a", node: "gate" }),
      step({ item_key: "a", node: "save" }),
    ];
    expect(arrivalsIn(steps, "t")).toHaveLength(1);
  });

  it("attributes a downstream failure to the arrival that caused it", () => {
    const steps = [
      step({ item_key: "a", node: "t", at_unix_ms: NOW - 900 }),
      step({
        item_key: "a", node: "save", port: "", outcome: "failed",
        at_unix_ms: NOW - 800,
      }),
    ];
    const [mark] = arrivalsIn(steps, "t");
    expect(mark.bad).toBe(true);
  });

  it("falls back to the first step per item when the entry is unknown", () => {
    // Degrades honestly rather than drawing nothing: a trace without a known
    // entry node still says how much arrived.
    const steps = [
      step({ item_key: "a", node: "gate" }),
      step({ item_key: "a", node: "save" }),
      step({ item_key: "b", node: "gate" }),
    ];
    expect(arrivalsIn(steps, null)).toHaveLength(2);
  });

  it("orders marks by time so the rail reads left to right", () => {
    const steps = [
      step({ item_key: "b", at_unix_ms: NOW - 100 }),
      step({ item_key: "a", at_unix_ms: NOW - 9000 }),
    ];
    expect(arrivalsIn(steps, "t").map((a) => a.at)).toEqual([
      NOW - 9000,
      NOW - 100,
    ]);
  });
});

describe("gap wording", () => {
  it("reads as a duration a person would say out loud", () => {
    expect(formatGap(4000)).toBe("4s");
    expect(formatGap(WINDOW_MS)).toBe("1m");
    expect(formatGap(95_000)).toBe("1m 35s");
    expect(formatGap(3_900_000)).toBe("1h 5m");
  });
});
