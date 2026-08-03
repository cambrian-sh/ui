import { describe, it, expect } from "vitest";
import type { StudioIngress, StudioStatus } from "@/ipc/types";
import {
  buildStages,
  currentStage,
  isLive,
  nextAction,
  revisingRevision,
} from "./studioStages";
import { shadowNumbers } from "./shadowDiff";

function ingress(state: string): StudioIngress {
  return {
    ingress_id: "usgs",
    display_name: "USGS earthquakes",
    state,
    health: "ok",
    pinned_release: "",
  };
}

function status(over: Partial<StudioStatus> = {}): StudioStatus {
  return {
    summary: ingress("MAPPED"),
    latest_transport_revision: 1,
    latest_mapping_revision: 0,
    release_id: "",
    armed_transport_revision: 0,
    armed_mapping_revision: 0,
    capture_samples: 214,
    failure_count: 0,
    credentials: [],
    egress_policy_json: "",
    ...over,
  };
}

/**
 * Turn 17 — the studio as one column.
 *
 * What is pinned here is the reason the four tabs went: stage state is DERIVED
 * from the server's lifecycle, so it cannot disagree with what the kernel will
 * actually allow. A tab strip could; that was the defect.
 */
describe("stage state comes from the server", () => {
  it("maps every lifecycle state to a stage", () => {
    expect(currentStage("DRAFT")).toBe("source");
    expect(currentStage("CAPTURING")).toBe("capture");
    expect(currentStage("MAPPED")).toBe("mapping");
    expect(currentStage("DRY_RUN")).toBe("dryrun");
    expect(currentStage("ARMED")).toBe("arm");
    // An unknown state reads as the beginning rather than throwing: a kernel
    // that grows a state should not blank the screen.
    expect(currentStage("SOMETHING_NEW")).toBe("source");
  });

  it("opens exactly one stage, and only one", () => {
    const stages = buildStages({
      summary: ingress("MAPPED"),
      status: status(),
      abstentions: 0,
      hasProposal: false,
    });
    expect(stages.filter((s) => s.state === "open")).toHaveLength(1);
    expect(stages.find((s) => s.state === "open")?.id).toBe("mapping");
  });

  it("collapses finished stages to receipts and leaves later ones as preconditions", () => {
    const stages = buildStages({
      summary: ingress("MAPPED"),
      status: status(),
      abstentions: 0,
      hasProposal: false,
    });
    expect(stages.map((s) => s.state)).toEqual([
      "receipt",
      "receipt",
      "open",
      "precondition",
      "precondition",
    ]);
  });

  it("gives a receipt a FINDING, not a tick", () => {
    const stages = buildStages({
      summary: ingress("MAPPED"),
      status: status({ capture_samples: 214 }),
      abstentions: 0,
      hasProposal: false,
    });
    // A tick says the stage happened; the finding says what the next stage will
    // be judged against — which is the whole reason a collapsed stage is still
    // worth its row.
    expect(stages.find((s) => s.id === "capture")?.line).toContain("214");
  });

  it("makes a future stage say what it waits for, naming the open decisions", () => {
    const stages = buildStages({
      summary: ingress("MAPPED"),
      status: status(),
      abstentions: 2,
      hasProposal: false,
    });
    const dry = stages.find((s) => s.id === "dryrun")!;
    expect(dry.state).toBe("precondition");
    // "An unreachable stage that says what it waits for is a to-do list." A dim
    // tab is a dead click.
    expect(dry.line).toContain("2 abstentions are open above");
    expect(dry.line).toContain("opens on its own");
  });

  it("counts one abstention in the singular, because copy is read", () => {
    const stages = buildStages({
      summary: ingress("MAPPED"),
      status: status(),
      abstentions: 1,
      hasProposal: false,
    });
    expect(stages.find((s) => s.id === "dryrun")?.line).toContain(
      "One abstention is open above",
    );
  });
});

/**
 * 17b — the same column entered from the other end.
 *
 * No second mode. An armed ingress is every stage as a receipt, with live
 * counters where the findings were.
 */
describe("a live ingress", () => {
  it("shows every stage as a receipt", () => {
    const stages = buildStages({
      summary: ingress("ARMED"),
      status: status({ armed_mapping_revision: 7, latest_mapping_revision: 7 }),
      abstentions: 0,
      hasProposal: false,
    });
    expect(stages.every((s) => s.state === "receipt")).toBe(true);
  });

  it("replaces a finished finding with a live counter", () => {
    const stages = buildStages({
      summary: ingress("ARMED"),
      status: status({ armed_mapping_revision: 7, latest_mapping_revision: 7 }),
      abstentions: 0,
      hasProposal: false,
    });
    expect(stages.find((s) => s.id === "capture")?.line).toContain(
      "still archiving every arrival",
    );
    expect(stages.find((s) => s.id === "capture")?.action).toBe("Browse");
  });

  it("treats PAUSED as live, because it is still a thing that was armed", () => {
    expect(isLive("PAUSED")).toBe(true);
    expect(isLive("RETIRED")).toBe(false);
    expect(isLive("MAPPED")).toBe(false);
  });

  it("detects a revision being drafted over the live one", () => {
    // The whole of 17b's safety story: revising FORKS. r7 keeps running and
    // saving while r8 is drafted, dry-run and diffed.
    expect(revisingRevision(status({ armed_mapping_revision: 7, latest_mapping_revision: 8 }))).toBe(8);
    // Not a fork: nothing armed yet, so this is just the first draft.
    expect(revisingRevision(status({ armed_mapping_revision: 0, latest_mapping_revision: 3 }))).toBeNull();
    // Not a fork: the live revision IS the latest.
    expect(revisingRevision(status({ armed_mapping_revision: 7, latest_mapping_revision: 7 }))).toBeNull();
  });

  it("reopens only the mapping stage while a revision is being drafted", () => {
    const stages = buildStages({
      summary: ingress("ARMED"),
      status: status({ armed_mapping_revision: 7, latest_mapping_revision: 8 }),
      abstentions: 0,
      hasProposal: false,
    });
    expect(stages.find((s) => s.id === "mapping")?.state).toBe("open");
    expect(stages.find((s) => s.id === "capture")?.state).toBe("receipt");
    expect(stages.find((s) => s.id === "arm")?.state).toBe("receipt");
  });
});

/**
 * The sticky bar: one next action, one blocker, always visible — so the operator
 * never scrolls to find out what to do.
 */
describe("the next action", () => {
  it("names the number of open decisions and stays blocked", () => {
    const a = nextAction({
      summary: ingress("MAPPED"),
      abstentions: 2,
      hasProposal: true,
    });
    expect(a.headline).toContain("2 decisions left");
    expect(a.blocked).toBe(true);
  });

  it("unblocks once every decision is made", () => {
    const a = nextAction({
      summary: ingress("MAPPED"),
      abstentions: 0,
      hasProposal: true,
    });
    expect(a.blocked).toBe(false);
  });

  it("says a live ingress is safe to revise", () => {
    const a = nextAction({
      summary: ingress("ARMED"),
      abstentions: 0,
      hasProposal: false,
    });
    expect(a.headline).toContain("forks");
  });
});

/**
 * §3.2 — the three numbers.
 *
 * Measured, not predicted: the candidate is replayed over the same archived
 * deliveries, so the diff is evidence rather than a forecast.
 */
describe("the shadow diff", () => {
  it("counts RECORDS, not rows in the diff", () => {
    // One delivery can produce several projections. Counting rows would report
    // a number larger than the number of things that arrived — and an operator
    // reading it against the archive size would be reading a coincidence.
    const n = shadowNumbers({
      EvidenceExamined: 2,
      Changes: [
        { EvidenceID: "e1", Kind: "a" },
        { EvidenceID: "e1", Kind: "b" },
        { EvidenceID: "e2", Kind: "a" },
      ],
    });
    expect(n.changed).toBe(2);
  });

  it("treats every way of losing a record as one number", () => {
    // Removals, new discards and new refusals are three mechanisms and one
    // consequence: it is no longer stored. Separating them here would be a
    // taxonomy lesson in the middle of a safety check.
    const n = shadowNumbers({
      Removals: [{ EvidenceID: "e1" }],
      NewDiscards: [{ EvidenceID: "e2" }],
      NewRefusals: [{ EvidenceID: "e3" }],
    });
    expect(n.dropped).toBe(3);
  });

  it("does not double-count a record lost two ways", () => {
    const n = shadowNumbers({
      Removals: [{ EvidenceID: "e1" }],
      NewDiscards: [{ EvidenceID: "e1" }],
    });
    expect(n.dropped).toBe(1);
  });

  it("counts a record that projects where nothing did as a gain", () => {
    const n = shadowNumbers({
      Additions: [{ EvidenceID: "e1" }],
      ResolvedRefusals: [{ EvidenceID: "e2" }],
    });
    expect(n.gained).toBe(2);
  });

  it("reports zeroes rather than nothing when there is no preview", () => {
    // The drop count must be sayable at zero — it is the number that silently
    // loses data, and a screen that only showed it when non-zero could not be
    // used to rule it out.
    const n = shadowNumbers(null);
    expect(n).toEqual({
      examined: 0,
      changed: 0,
      gained: 0,
      dropped: 0,
      unchanged: 0,
    });
  });
});
