import type { StudioIngress, StudioStatus } from "@/ipc/types";

/**
 * 17 — the studio as ONE column, derived from the server's lifecycle.
 *
 * # Why the four tabs went
 *
 * They were never four screens. They are four states of one thing, and the
 * lifecycle already enforces the order — you cannot map a source you have not
 * seen. So at any moment three of four tabs were unreachable, and a tab strip is
 * the one control that promises the opposite: *these are peers, go where you
 * like.* Then it greyed three out and offered no sentence saying why, which made
 * the operator's first action in the studio a dead click.
 *
 * # Where stage state comes from
 *
 * The SERVER's lifecycle field, never client state. There is deliberately no
 * "which tab is open" here: open / collapsed / precondition are all derived from
 * the ingress's actual stage, plus one local override for "the operator expanded
 * a receipt" — which is held by the component, because it is a viewing
 * preference and not a fact about the ingress.
 */

export type StageID = "source" | "capture" | "mapping" | "dryrun" | "arm";

export type StageState =
  /** Done. Collapses to a one-line receipt carrying its FINDING, not a tick. */
  | "receipt"
  /** The current stage: the only expanded one, and the only one with a primary action. */
  | "open"
  /** Not reachable yet, and says what it is waiting for rather than going dim. */
  | "precondition";

export type Stage = {
  id: StageID;
  /** 1-based, for the numbered circle and "stage N of 5". */
  index: number;
  title: string;
  state: StageState;
  /**
   * The receipt line, or the precondition sentence.
   *
   * A receipt carries what the next stage will be judged against — "214
   * deliveries · 11 fields · 2 vary in shape" — because a tick says it happened
   * and a finding says what it means. The capture receipt's "2 vary in shape"
   * is *why* two fields below are abstentions, so a collapsed stage still
   * explains the open one.
   */
  line?: string;
  /** The right-hand link on a receipt: Change / Capture more / Browse / History. */
  action?: string;
};

export const STAGE_TITLES: Record<StageID, string> = {
  source: "The source",
  capture: "Capture",
  mapping: "The mapping",
  dryrun: "Dry run",
  arm: "Arm it",
};

const ORDER: StageID[] = ["source", "capture", "mapping", "dryrun", "arm"];

/** Where the server says this ingress is. Anything unknown reads as DRAFT. */
export function currentStage(state: string): StageID {
  switch (state) {
    case "CAPTURING":
      return "capture";
    case "MAPPED":
      return "mapping";
    case "DRY_RUN":
      return "dryrun";
    case "ARMED":
    case "PAUSED":
    case "RETIRED":
      return "arm";
    default:
      return "source";
  }
}

/** True once the ingress is live — the 17b entry point. */
export function isLive(state: string): boolean {
  return state === "ARMED" || state === "PAUSED";
}

/**
 * Is a revision being drafted over a live one?
 *
 * This is the whole of 17b's safety story: revising FORKS a revision and never
 * edits the live one, so r7 keeps running and saving while r8 is drafted,
 * dry-run and diffed. A draft ahead of the armed revision is what that looks
 * like in data.
 */
export function revisingRevision(status: StudioStatus | null): number | null {
  if (!status) return null;
  const { latest_mapping_revision: latest, armed_mapping_revision: armed } = status;
  return latest > armed && armed > 0 ? latest : null;
}

export function buildStages({
  summary,
  status,
  abstentions,
  hasProposal,
}: {
  summary: StudioIngress;
  status: StudioStatus | null;
  /** Open per-field abstentions — they gate the dry-run stage. */
  abstentions: number;
  /** Whether a mapping proposal is on screen awaiting a decision. */
  hasProposal: boolean;
}): Stage[] {
  const at = currentStage(summary.state);
  const live = isLive(summary.state);
  const atIndex = ORDER.indexOf(at);
  const samples = status?.capture_samples ?? 0;
  const revising = revisingRevision(status);

  return ORDER.map((id, i): Stage => {
    const index = i + 1;
    const title = STAGE_TITLES[id];
    // On a live ingress every stage is a receipt: 17b is the same column
    // entered from the other end, not a second mode. The ONE exception is a
    // mapping being revised — that stage reopens over the top of its own
    // receipt, because a fork is the only thing that can be in progress on
    // something already armed.
    const state: StageState = live
      ? id === "mapping" && revising !== null
        ? "open"
        : "receipt"
      : i < atIndex
        ? "receipt"
        : i === atIndex
          ? "open"
          : "precondition";

    if (state === "receipt") {
      return { id, index, title, state, ...receiptFor(id, { status, samples, live }) };
    }
    if (state === "open") {
      return { id, index, title, state };
    }
    return {
      id,
      index,
      title: id === "arm" ? "Arm it" : title,
      state,
      line: preconditionFor(id, { abstentions, hasProposal }),
    };
  });
}

/**
 * The receipt line: a finding, and on a live ingress a LIVE COUNTER in its place.
 *
 * Same rows, same order, nothing relearned on the way in — the studio has no
 * second mode, only a different starting scroll position.
 */
function receiptFor(
  id: StageID,
  ctx: { status: StudioStatus | null; samples: number; live: boolean },
): { line: string; action?: string } {
  const s = ctx.status;
  switch (id) {
    case "source":
      return {
        line: ctx.live
          ? `transport r${s?.armed_transport_revision ?? 0} · ${failureLine(s)}`
          : `transport r${s?.latest_transport_revision ?? 0} declared`,
        action: "Change",
      };
    case "capture":
      return {
        line: ctx.live
          ? `${ctx.samples.toLocaleString()} archived · still archiving every arrival`
          : `${ctx.samples.toLocaleString()} ${ctx.samples === 1 ? "delivery" : "deliveries"} captured`,
        action: ctx.live ? "Browse" : "Capture more",
      };
    case "mapping":
      return {
        line: `mapping r${(ctx.live ? s?.armed_mapping_revision : s?.latest_mapping_revision) ?? 0} accepted`,
        action: "Change",
      };
    case "dryrun":
      return { line: "dry run passed", action: "Run it again" };
    case "arm":
      return {
        line: `r${s?.armed_mapping_revision ?? 0} armed · ${ctx.samples.toLocaleString()} seen`,
        action: "History",
      };
  }
}

function failureLine(s: StudioStatus | null): string {
  const n = s?.failure_count ?? 0;
  // Zero is content: "0 failures" is the reassurance an operator opens this
  // screen for, and hiding it when it is zero removes exactly that.
  return n === 0 ? "0 delivery failures recorded" : `${n} delivery failures`;
}

/**
 * What a future stage is waiting for.
 *
 * Never a dim tab. An unreachable stage that says what it waits for is a to-do
 * list; one that is simply greyed out is a dead end an operator clicks anyway.
 */
function preconditionFor(
  id: StageID,
  ctx: { abstentions: number; hasProposal: boolean },
): string {
  switch (id) {
    case "capture":
      return "Needs a declared source. Capture starts the moment the transport is saved — you cannot map a source you have not seen.";
    case "mapping":
      return "Needs captured deliveries. The drafter abstains on zero samples rather than guessing.";
    case "dryrun":
      if (ctx.abstentions > 0) {
        return `Needs an accepted mapping. ${ctx.abstentions === 1 ? "One abstention is" : `${ctx.abstentions} abstentions are`} open above — resolve ${ctx.abstentions === 1 ? "it" : "them"} and this opens on its own.`;
      }
      if (ctx.hasProposal) {
        return "Needs an accepted mapping. There is a proposal above — accept it and this opens on its own.";
      }
      return "Needs an accepted mapping. Propose one above and this opens on its own.";
    case "arm":
      return "Needs a clean dry run. This stage is a summary of what will happen to the world, and then a switch — not a switch on its own.";
    default:
      return "";
  }
}

/**
 * The sticky bar: one next action and one blocker, always visible.
 *
 * The operator never scrolls to find out what to do — which is the other half of
 * removing the tab strip, because a single long column can otherwise hide the
 * only thing that matters below the fold.
 */
export function nextAction({
  summary,
  abstentions,
  hasProposal,
}: {
  summary: StudioIngress;
  abstentions: number;
  hasProposal: boolean;
}): { headline: string; blocked: boolean } {
  const at = currentStage(summary.state);
  if (isLive(summary.state)) {
    return { headline: "Armed and running. Revising forks a new revision — the live one keeps saving.", blocked: false };
  }
  switch (at) {
    case "source":
      return { headline: "Declare the source. This is the only stage that is a form.", blocked: true };
    case "capture":
      return { headline: "Capturing. Watching arrivals is the work at this stage.", blocked: true };
    case "mapping":
      if (abstentions > 0) {
        return {
          headline: `${abstentions === 1 ? "One decision" : `${abstentions} decisions`} left before this can dry-run`,
          blocked: true,
        };
      }
      if (!hasProposal) {
        return { headline: "Propose a mapping to review what it would keep and throw away.", blocked: true };
      }
      return { headline: "Nothing is open. Accept the mapping to move to dry run.", blocked: false };
    case "dryrun":
      return { headline: "Dry-run it against real arrivals. Nothing reaches the world.", blocked: false };
    case "arm":
      return { headline: "Read what arming will do, then arm it.", blocked: false };
  }
}
