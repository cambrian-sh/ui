import { useState } from "react";
import { GitBranch, RotateCcw } from "lucide-react";
import { RepairJobStatus } from "./RepairJobStatus";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/design-system/components";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { ipc } from "@/ipc";
import { OpenStage } from "./StageRows";
import { SectionLabel, Row, RowList } from "./MappingReviewView";
import { parsePreview, shadowNumbers } from "./shadowDiff";

/**
 * 17b — revising a live ingress.
 *
 * # The rule that makes editing safe
 *
 * Revising FORKS a revision. It never edits the live one. r7 keeps running and
 * saving while r8 is drafted, dry-run and diffed.
 *
 * Every tool that lets you mutate a running integration in place produces the
 * same incident — a half-saved change caught mid-arrival — and the fix is not a
 * confirmation dialog, it is NOT HAVING A LIVE OBJECT TO MUTATE. It is said in
 * the panel because an operator who understands it edits confidently, and one
 * who does not edits at 2 a.m. with a rollback plan they will not need.
 */
export function RevisionStage({
  ingressId,
  armedRevision,
  latestRevision,
  armedTransportRevision,
  armedHistoryTransportRevision,
  draftRevision,
  archived,
  onDiscard,
}: {
  ingressId: string;
  armedRevision: number;
  /** The newest stored mapping revision: ConfirmMapping confirms THIS one. */
  latestRevision: number;
  /** The armed release's transport revision and history lane (0 = none). */
  armedTransportRevision: number;
  armedHistoryTransportRevision: number;
  draftRevision: number;
  /** How many deliveries the shadow run has to replay against. */
  archived: number;
  onDiscard: () => void;
}) {
  // Measured, not predicted: the candidate is replayed over the SAME archived
  // deliveries the live revision has been reading, so the diff is evidence
  // rather than a forecast.
  const shadow = useKernelQuery(
    ["studio", "shadow", ingressId, draftRevision],
    () => ipc.studioShadowReprocess(ingressId, draftRevision, 0),
    { retry: 0, staleTime: 0 },
  );
  const preview = parsePreview(shadow.data);
  const n = shadowNumbers(preview);

  return (
    <OpenStage
      tone="warn"
      icon={
        <GitBranch
          aria-hidden="true"
          size={15}
          className="flex-none text-[var(--status-warn)]"
        />
      }
      title={`The mapping — revising as r${draftRevision}`}
      note={
        <span className="font-mono text-[10.5px]">
          r{armedRevision} untouched and still saving
        </span>
      }
    >
      <div
        className="mb-3.5 rounded-[var(--radius-md)] p-3 tint-wash tint-ring"
        style={{ "--tint": "var(--accent-bg)" } as React.CSSProperties}
      >
        <p className="text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
          <span className="text-[var(--fg-primary)]">
            Editing forks a revision. It never edits the live one.
          </span>{" "}
          Every tool that lets you mutate a running integration in place produces
          the same incident — a half-saved change caught mid-arrival. The fix is
          not a confirmation dialog, it is not having a live object to mutate.
        </p>
      </div>

      <SectionLabel
        note={`${archived.toLocaleString()} archived deliveries, r${armedRevision} vs r${draftRevision}`}
      >
        Shadow reprocess — measured, not predicted
      </SectionLabel>

      <div className="mt-2">
        {shadow.isLoading ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
            Replaying r{draftRevision} over the archive…
          </p>
        ) : shadow.error ? (
          <p
            className="rounded-[var(--radius-lg)] px-3.5 py-2.5 text-[11.5px] tint-wash"
            style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
          >
            {shadow.error.message}
          </p>
        ) : (
          <RowList>
            <Finding
              count={n.changed}
              tone="err"
              headline={`${plural(n.changed, "record")} produce a different result`}
              detail={
                n.changed > 0
                  ? `This is the finding, and it is only visible because raw was kept — r${armedRevision} has been writing these since it was armed.`
                  : `r${draftRevision} produces byte-identical output for every delivery examined.`
              }
            />
            <Finding
              count={n.gained}
              tone="accent"
              headline={`${plural(n.gained, "record")} gain something they did not have`}
              detail={`${n.unchanged.toLocaleString()} come out unchanged. Anything that legitimately stays empty stays empty — that is the behaviour you chose, not a miss.`}
            />
            {/* Stated even at zero. This is the number that silently loses data,
                and a screen that only showed it when it was non-zero would be a
                screen you cannot use to rule it out. */}
            <Finding
              count={n.dropped}
              tone={n.dropped > 0 ? "err" : "muted"}
              headline={`${plural(n.dropped, "record")} would be dropped that r${armedRevision} kept`}
              detail={
                n.dropped > 0
                  ? "These stop being stored under the new revision. Check this before promoting — it is the one change nothing downstream will report."
                  : "Worth stating at zero, because this is the number that silently loses data."
              }
            />
          </RowList>
        )}
      </div>

      <Promotion
        ingressId={ingressId}
        draftRevision={draftRevision}
        armedRevision={armedRevision}
        latestRevision={latestRevision}
        armedTransportRevision={armedTransportRevision}
        armedHistoryTransportRevision={armedHistoryTransportRevision}
        affected={n.changed}
        archived={archived}
        ready={!shadow.isLoading && !shadow.error}
      />

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard r{draftRevision}
        </Button>
        <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
          r{armedRevision} stays armed either way
        </span>
      </div>
    </OpenStage>
  );
}

/**
 * One of the three numbers, at display size with its meaning beside it.
 *
 * The number leads because it is what gets quoted to somebody else; the sentence
 * follows because a number without one is a statistic rather than a finding.
 */
function Finding({
  count,
  tone,
  headline,
  detail,
}: {
  count: number;
  tone: "err" | "accent" | "muted";
  headline: string;
  detail: string;
}) {
  const colour =
    tone === "err"
      ? "var(--status-err)"
      : tone === "accent"
        ? "var(--color-accent-400)"
        : "var(--fg-muted)";
  return (
    <Row align="start">
      <span
        className="w-[52px] flex-none text-right font-mono text-[15px] leading-[1.1] tabular-nums"
        style={{ color: colour }}
      >
        {count.toLocaleString()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[12px] font-medium">{headline}</div>
        <div className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
          {detail}
        </div>
      </div>
    </Row>
  );
}

/**
 * §3.3 — promotion and backfill are SEPARATE ACTS.
 *
 * Promoting fixes what arrives next. It does not fix what is already stored.
 * The records written under the old revision still carry the old result today,
 * and re-deriving them touches every downstream fact that read them — so it is
 * not free, and it is not implied.
 *
 * Two explicit buttons, never one that quietly does both or quietly does
 * neither. A reason is mandatory on the kernel side, which is why the field is
 * here rather than a dialog: a promotion without a reason is refused, and
 * discovering that in a modal after deciding is worse than typing it now.
 */
/**
 * The two things a reviewed revision can be used for (ENG-1722, owner decision
 * 2026-11-20, option C), side by side, each saying exactly what it calls:
 *
 *  - REPAIR STORED RECORDS — IngressStudioAdmin.PromoteRepair: a background job
 *    re-projects EVERY preserved delivery under the candidate revision and retires
 *    the rows the old one wrote. Stored records change; what new arrivals use does
 *    not (the armed release is untouched).
 *  - RELEASE FOR NEW ARRIVALS — the kernel's own path for changing a live
 *    ingress's mapping, run step by step with the operator's reason: pause →
 *    confirm the mapping (PAUSED → MAPPED builds the candidate's pipeline) → start
 *    the dry run → arm a new release (the armed transport, this mapping, the armed
 *    history lane kept). Stored records do not change. It stops at the first
 *    refusal and says where the ingress was left.
 *
 * Until ENG-1722 the one button here called PromoteRepair while its copy promised
 * the release ("fixes what arrives next… does not fix what is already stored").
 */
function Promotion({
  ingressId,
  draftRevision,
  armedRevision,
  latestRevision,
  armedTransportRevision,
  armedHistoryTransportRevision,
  affected,
  archived,
  ready,
}: {
  ingressId: string;
  draftRevision: number;
  armedRevision: number;
  latestRevision: number;
  armedTransportRevision: number;
  armedHistoryTransportRevision: number;
  affected: number;
  archived: number;
  ready: boolean;
}) {
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "repair" | "release">("");
  const [started, setStarted] = useState(false);
  const reasonMissing = reason.trim() === "";
  // ConfirmMapping confirms the LATEST stored revision, so the release can only
  // carry this candidate while it is the latest.
  const releasable = draftRevision === latestRevision && armedTransportRevision > 0;

  const repair = async () => {
    setBusy("repair");
    try {
      const res = await ipc.studioPromoteRepair(ingressId, draftRevision, reason);
      // The kernel's own words: PromoteRepair STARTS a background job that
      // re-projects the preserved deliveries under this revision; it is not
      // finished when the call returns (RepairJobStatus follows it).
      setNotice(res.ok ? res.detail : res.error);
      if (res.ok) {
        setStarted(true);
        void queryClient.invalidateQueries({ queryKey: ["studio-repair", ingressId] });
      }
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy("");
    }
  };

  const release = async () => {
    setBusy("release");
    // Each step is one audited kernel call; the first refusal stops the chain,
    // and the notice says where the ingress was left.
    const steps: { label: string; leftIn: string; run: () => Promise<{ ok: boolean; error: string; detail: string }> }[] = [
      { label: "pause", leftIn: `still armed on r${armedRevision}`, run: () => ipc.studioLifecycle("pause", ingressId, reason) },
      { label: "confirm the mapping", leftIn: "paused — resume it to go back to r" + armedRevision, run: () => ipc.studioLifecycle("confirm_mapping", ingressId, reason) },
      { label: "start the dry run", leftIn: `mapped on r${draftRevision}, not receiving — start the dry run and arm from the lifecycle controls`, run: () => ipc.studioLifecycle("start_dry_run", ingressId, reason) },
      {
        label: "arm the new release",
        leftIn: `in dry run on r${draftRevision}, not receiving — arm it from the lifecycle controls`,
        run: () => ipc.studioArm(ingressId, armedTransportRevision, draftRevision, reason, armedHistoryTransportRevision),
      },
    ];
    try {
      for (const step of steps) {
        const res = await step.run();
        if (!res.ok) {
          setNotice(`Could not ${step.label}: ${res.error || "refused"}. The ingress is ${step.leftIn}.`);
          return;
        }
      }
      setNotice(`Released r${draftRevision} for new arrivals. Stored records are unchanged.`);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy("");
      void queryClient.invalidateQueries({ queryKey: ["studio", "status", ingressId] });
    }
  };

  return (
    <div
      className="mt-3.5 rounded-[var(--radius-md)] p-3 tint-wash tint-ring"
      style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <RotateCcw aria-hidden="true" size={13} className="flex-none text-[var(--status-warn)]" />
        <span className="text-[12.5px] font-medium">
          Two separate things r{draftRevision} can do. Choose one, or both in turn.
        </span>
      </div>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Why are you doing this?"
        placeholder="Why? (required — it is recorded with each call)"
        className="mb-2.5 w-full rounded-[var(--radius-md)] bg-[var(--bg-base)] px-2.5 py-1.5 text-[11.5px] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Repair stored records" className="flex flex-col gap-1.5">
          <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
            Re-projects all {archived.toLocaleString()} preserved deliveries under r{draftRevision} and
            retires the rows r{armedRevision} wrote — {affected.toLocaleString()}{" "}
            {affected === 1 ? "record changes" : "records change"}. Runs in the background. New
            arrivals keep using r{armedRevision}.
          </p>
          <Button size="sm" variant="secondary" onClick={repair} disabled={!ready || busy !== "" || reasonMissing}>
            {busy === "repair" ? "Starting…" : "Repair stored records"}
          </Button>
        </section>
        <section aria-label="Release for new arrivals" className="flex flex-col gap-1.5">
          <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
            Pauses this ingress, confirms r{draftRevision}, runs it through the dry run and arms it as a
            new release. Deliveries that arrive while it is paused wait at the source. Stored records
            are not changed.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={release}
            disabled={!ready || busy !== "" || reasonMissing || !releasable}
            title={
              releasable
                ? undefined
                : draftRevision !== latestRevision
                  ? `r${latestRevision} is newer: confirming a mapping confirms the latest revision`
                  : "No armed release to carry the transport from"
            }
          >
            {busy === "release" ? "Releasing…" : `Release r${draftRevision} for new arrivals`}
          </Button>
        </section>
      </div>

      {notice !== "" && (
        <p role="status" className="mt-2 text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
          {notice}
        </p>
      )}
      {started && (
        <div className="mt-1.5">
          <RepairJobStatus ingressId={ingressId} />
        </div>
      )}
    </div>
  );
}

function plural(n: number, noun: string): string {
  return `${n.toLocaleString()} ${n === 1 ? noun : `${noun}s`}`;
}
