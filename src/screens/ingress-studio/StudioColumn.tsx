import { useMemo, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/design-system/components";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { useMutation } from "@/lib/useMutation";
import { ipc } from "@/ipc";
import { cn } from "@/design-system/lib/utils";
import type { StudioDraft, StudioIngress, StudioStatus } from "@/ipc/types";
import { Receipt, Precondition, OpenStage, ReceiptNote } from "./StageRows";
import { MappingStage } from "./MappingStage";
import { RevisionStage } from "./RevisionStage";
import { EvidencePane } from "./EvidencePane";
import {
  buildStages,
  isLive,
  nextAction,
  revisingRevision,
} from "./studioStages";
import {
  parseJson,
  type Coverage,
  type MappingSpec,
  type SchemaProfile,
} from "./mappingTypes";

/**
 * 17 — the Ingress Studio, one surface.
 *
 * # This replaces the four tabs, and the reason matters
 *
 * They were never four screens. They are four states of one thing, and the
 * lifecycle already enforces the order — you cannot map a source you have not
 * seen. At any moment three of four tabs were unreachable, and a tab strip is
 * the one control that promises the opposite: *these are peers, go where you
 * like.* Then it greyed three out and offered no sentence saying why. The
 * operator's first action in the studio was a dead click.
 *
 * What replaces it: ONE SCROLLING COLUMN with the evidence pinned beside it.
 *
 *   - Completed stages collapse to a one-line receipt CARRYING ITS FINDING, not
 *     a checkmark. A tick says it happened; the finding says what the next stage
 *     will be judged against — and the capture receipt's "2 vary in shape" is
 *     *why* two fields below are abstentions, so a collapsed stage explains the
 *     open one.
 *   - The current stage is the only expanded one and the only one with a
 *     primary action.
 *   - Future stages render their own preconditions, never a dim tab. An
 *     unreachable stage that says what it waits for is a to-do list.
 *   - The evidence pane never moves. That is what makes one surface possible:
 *     every claim every stage makes is checked against the same material, so
 *     the material is constant and only the question changes.
 *
 * 17b is the SAME column entered from the other end — receipts with live
 * counters instead of finished findings. There is no second mode, only a
 * different starting scroll position.
 */
export function StudioColumn({
  summary,
  status,
  readOnly,
  onChanged,
  onOpenPanel,
  health,
}: {
  summary: StudioIngress;
  status: StudioStatus | null;
  readOnly: boolean;
  onChanged: () => void;
  /**
   * Open a side panel — the source text, the lifecycle controls, operations.
   *
   * Reached from a RECEIPT's own action ("Change", "History") rather than from a
   * tab strip, which is the difference the whole turn turns on: these are
   * detours from a stage you are standing in, not peers competing with it.
   */
  onOpenPanel: (panel: "specs" | "overview" | "operations") => void;
  health?: string;
}) {
  const ingressId = summary.ingress_id;
  const capture = useKernelQuery(
    ["studio", "capture", ingressId],
    () => ipc.studioCaptureStatus(ingressId),
    { refetchInterval: 15_000, staleTime: 0 },
  );
  const [guidance, setGuidance] = useState("");
  const [result, setResult] = useState<StudioDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  // The ONE piece of client stage state the handoff allows: which receipt the
  // operator opened. Everything else is derived from the server's lifecycle,
  // because "which tab is open" was the thing that made three of them lie.
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Discarding is terminal, so it asks for a reason rather than confirming. */
  const [discarding, setDiscarding] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const lifecycle = useMutation(ipc.studioLifecycle);

  const draft = useMutation(ipc.studioDraftMapping);
  const save = useMutation(ipc.studioSaveSpec);

  const samples = capture.data?.samples ?? 0;
  const profile = useMemo<SchemaProfile | null>(
    () => parseJson<SchemaProfile>(capture.data?.profile_json),
    [capture.data?.profile_json],
  );
  const coverage = useMemo<Coverage | null>(
    () => parseJson<Coverage>(result?.coverage_json),
    [result?.coverage_json],
  );
  const spec = useMemo<MappingSpec | null>(
    () => parseJson<MappingSpec>(result?.spec_json),
    [result?.spec_json],
  );

  const abstentions = result?.field_abstentions?.length ?? 0;
  const hasProposal = result?.ok === true && result.abstained === "";
  const live = isLive(summary.state);
  const revising = revisingRevision(status);

  const stages = useMemo(
    () => buildStages({ summary, status, abstentions, hasProposal }),
    [summary, status, abstentions, hasProposal],
  );
  const action = nextAction({ summary, abstentions, hasProposal });

  const accept = async () => {
    if (!result) return;
    const res = await save.mutate("mapping", ingressId, result.spec_json);
    if (res?.ok) {
      setNotice(
        `Saved as mapping revision ${res.revision}. Nothing is armed by saving — the dry-run stage opens next.`,
      );
      onChanged();
    } else if (res) {
      setNotice(res.error);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[17px] font-medium tracking-[-0.01em]">
            {summary.display_name || ingressId}
          </h2>
          <span className="font-mono text-[11px] text-[var(--fg-muted)]">
            {live
              ? revising !== null
                ? `r${status?.armed_mapping_revision} armed · r${revising} draft`
                : `r${status?.armed_mapping_revision} armed`
              : "new ingress · nothing armed"}
          </span>
        </div>

        {live ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] tint-fill"
            style={{ "--tint": "var(--color-accent-400)" } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              className="h-[5px] w-[5px] rounded-full bg-[var(--color-accent-400)] flow-pulse"
            />
            r{status?.armed_mapping_revision} still running
          </span>
        ) : (
          <span
            className="rounded-[7px] px-2.5 py-1 font-mono text-[11px] tint-fill text-[var(--color-accent-400)]"
            style={{ "--tint": "var(--color-accent-400)" } as React.CSSProperties}
          >
            stage {stages.findIndex((s) => s.state === "open") + 1} of 5
          </span>
        )}

        <span className="text-[11.5px] text-[var(--fg-muted)]">
          {live
            ? "no second mode — the same column, entered at the bottom"
            : "one form, then three decisions"}
        </span>

        {health !== undefined && health !== "ok" && (
          <span
            className="rounded-[7px] px-2 py-0.5 font-mono text-[10.5px] tint-fill"
            style={
              {
                "--tint":
                  health === "error" ? "var(--status-err)" : "var(--status-warn)",
                color:
                  health === "error" ? "var(--status-err)" : "var(--status-warn)",
              } as React.CSSProperties
            }
          >
            {health}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenPanel("overview")}
          >
            {live ? "Lifecycle & history" : "Lifecycle"}
          </Button>
          {!live && !readOnly && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDiscarding((v) => !v)}
            >
              Discard this draft
            </Button>
          )}
        </div>
      </header>

      {/* Terminal, and it says so. A confirmation dialog would be the weaker
          control here — what makes this safe is that the reason is recorded
          beside the transition, not that somebody clicked twice. */}
      {discarding && (
        <div
          className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-2.5 tint-wash"
          style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
        >
          <span className="text-[11.5px] text-[var(--fg-secondary)]">
            Discarding is terminal — a retired ingress is recreated under a new
            id, never revived. Its archive stays readable.
          </span>
          <input
            value={discardReason}
            onChange={(e) => setDiscardReason(e.target.value)}
            aria-label="Why are you discarding this draft?"
            placeholder="Why? (recorded beside the transition)"
            className="min-w-[220px] flex-1 rounded-[var(--radius-md)] bg-[var(--bg-base)] px-2.5 py-1 text-[11.5px] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
          <Button
            size="sm"
            variant="danger"
            disabled={discardReason.trim() === "" || lifecycle.isLoading}
            onClick={async () => {
              const res = await lifecycle.mutate("retire", ingressId, discardReason);
              setDiscarding(false);
              setDiscardReason("");
              if (res && !res.ok) setNotice(res.error);
              else onChanged();
            }}
          >
            Discard permanently
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDiscarding(false)}>
            Keep it
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── The column ───────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
            {stages.map((stage) => {
              if (stage.state === "receipt") {
                return (
                  <div key={stage.id} className="flex flex-col gap-2">
                    <Receipt
                      stage={stage}
                      onAction={() => onOpenPanel(panelFor(stage.id))}
                      expanded={expanded === stage.id}
                      // Expanding a receipt does NOT collapse the current
                      // stage: re-reading capture while resolving an
                      // abstention is the normal case, not an edge one.
                      onToggle={() =>
                        setExpanded((e) => (e === stage.id ? null : stage.id))
                      }
                    />
                    {stage.id === "capture" && (
                      <ReceiptNote>
                        A receipt carries its finding, not a tick.{" "}
                        {live
                          ? "A live ingress replaces each finished finding with a live counter — same rows, same order, nothing to relearn."
                          : "What capture found is what the mapping below is judged against, so the collapsed stage still explains the open one."}
                      </ReceiptNote>
                    )}
                  </div>
                );
              }

              if (stage.state === "precondition") {
                return <Precondition key={stage.id} stage={stage} />;
              }

              // The open stage. Only the mapping has content of its own today;
              // the others state honestly what this build does not yet render
              // rather than showing an empty card.
              if (stage.id === "mapping") {
                return (
                  <OpenStage
                    key={stage.id}
                    stage={stage}
                    note="the drafter proposed this and cannot save, transition or arm it"
                  >
                    <MappingStage
                      samples={samples}
                      result={result}
                      coverage={coverage}
                      spec={spec}
                      profile={profile}
                      guidance={guidance}
                      drafting={draft.isLoading}
                      readOnly={readOnly}
                      onGuidance={setGuidance}
                      onPropose={async () => {
                        setNotice("");
                        const r = await draft.mutate(ingressId, guidance);
                        if (r) setResult(r);
                      }}
                      onDecide={(path, choice) => {
                        // A decision becomes GUIDANCE, then re-drafts. The
                        // drafter is propose-only, so there is one path into
                        // the mapping rather than two that can disagree.
                        const line = `${path}: ${choice}`;
                        setGuidance((g) => (g === "" ? line : `${g}\n${line}`));
                        setNotice(
                          "Added to your guidance above. Propose again to see it applied — the drafter cannot edit a mapping, only propose one.",
                        );
                      }}
                      onShowEvidence={setHighlight}
                    />
                  </OpenStage>
                );
              }

              return (
                <OpenStage key={stage.id} stage={stage}>
                  <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
                    {stageFallback(stage.id)}
                  </p>
                </OpenStage>
              );
            })}

            {/* 17b: revising forks a revision, and the live one keeps running. */}
            {live && revising !== null && (
              <RevisionStage
                ingressId={ingressId}
                armedRevision={status?.armed_mapping_revision ?? 0}
                draftRevision={revising}
                archived={samples}
                onDiscard={() => onChanged()}
              />
            )}

            {notice !== "" && (
              <p className="text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
                {notice}
              </p>
            )}

            <p className="mt-2 text-[11.5px] leading-[1.65] text-[var(--fg-muted)]">
              <span className="text-[var(--fg-secondary)]">
                If this mapping turns out wrong, it is repairable.
              </span>{" "}
              All {samples.toLocaleString()} raw{" "}
              {samples === 1 ? "delivery was" : "deliveries were"} archived before
              anything interpreted them, so a corrected mapping can be
              shadow-reprocessed over the same evidence and diffed before it is
              promoted. That is why you can accept a draft this afternoon instead
              of stalling for a week.
            </p>
          </div>

          {/* ── The sticky bar: one next action, one blocker ────────── */}
          <div className="flex flex-none items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-5 py-2.5">
            <WarningCircle
              aria-hidden="true"
              size={15}
              className={cn(
                "flex-none",
                action.blocked
                  ? "text-[var(--status-warn)]"
                  : "text-[var(--fg-muted)]",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium">{action.headline}</div>
              <div className="text-[11.5px] text-[var(--fg-muted)]">
                nothing has been stored yet — saving, arming and promoting are
                human actions
              </div>
            </div>
            <Button size="sm" variant="ghost" disabled>
              Save and come back
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={accept}
              disabled={!hasProposal || readOnly || save.isLoading}
              className={cn(!hasProposal && "opacity-45")}
            >
              {save.isLoading ? "Saving…" : "Accept & dry run"}
            </Button>
          </div>
        </div>

        {/* ── The evidence, pinned ─────────────────────────────────── */}
        <aside className="hidden w-[392px] flex-none overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4 xl:block">
          <EvidencePane
            profile={profile}
            samples={samples}
            ingressId={ingressId}
            highlight={highlight}
          />
        </aside>
      </div>
    </div>
  );
}

/** Which side panel a receipt's action opens. */
function panelFor(id: string): "specs" | "overview" | "operations" {
  switch (id) {
    case "source":
    case "mapping":
      return "specs";
    case "arm":
      return "operations";
    default:
      return "overview";
  }
}

/**
 * What an open stage says when this build has no surface for it yet.
 *
 * Named rather than blank. A stage that is current and empty reads as broken;
 * one that says what it is waiting on reads as a to-do, which is the same rule
 * the precondition rows follow.
 */
function stageFallback(id: string): string {
  switch (id) {
    case "source":
      return "Declaring the transport is the one stage that is a form, and it still lives on the specs surface — everything after it is review rather than typing.";
    case "capture":
      return "Capture is running. Arrivals are counted in the receipt above and the schema profile builds beside it as deliveries land — a field appears the moment its shape is first seen.";
    case "dryrun":
      return "Dry run evaluates the accepted mapping against real arrivals with every effect swapped for a recorder. It is run from the pipelines console, which is where its findings render.";
    case "arm":
      return "Arming is a summary of what will happen to the world and then a switch — not a switch on its own. The summary is not rendered here yet, so this stage does not offer the switch.";
    default:
      return "";
  }
}
