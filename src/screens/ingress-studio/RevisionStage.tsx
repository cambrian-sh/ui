import { useState } from "react";
import { GitBranch, ArrowCounterClockwise } from "@phosphor-icons/react";
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
  draftRevision,
  archived,
  onDiscard,
}: {
  ingressId: string;
  armedRevision: number;
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
        affected={n.changed}
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
function Promotion({
  ingressId,
  draftRevision,
  affected,
  ready,
}: {
  ingressId: string;
  draftRevision: number;
  affected: number;
  ready: boolean;
}) {
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    setBusy(true);
    try {
      const res = await ipc.studioPromoteRepair(ingressId, draftRevision, reason);
      setNotice(
        res.ok
          ? `Promoted r${draftRevision}. What arrives from now on uses it; the ${affected.toLocaleString()} already-stored records are unchanged.`
          : res.error,
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3.5 rounded-[var(--radius-md)] p-3 tint-wash tint-ring"
      style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <ArrowCounterClockwise
          aria-hidden="true"
          size={13}
          className="flex-none text-[var(--status-warn)]"
        />
        <span className="text-[12.5px] font-medium">
          Promoting r{draftRevision} fixes what arrives next. It does not fix
          what is already stored.
        </span>
      </div>
      <p className="mb-2.5 text-[11.5px] leading-[1.65] text-[var(--fg-secondary)]">
        {affected.toLocaleString()}{" "}
        {affected === 1 ? "record carries" : "records carry"} the old result
        today. Backfilling re-derives every downstream fact that read them, so it
        is a separate, explicit act rather than something promotion does quietly.
      </p>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Why are you promoting this revision?"
        placeholder="Why are you promoting this? (required — it is recorded)"
        className="mb-2 w-full rounded-[var(--radius-md)] bg-[var(--bg-base)] px-2.5 py-1.5 text-[11.5px] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled
          title="Backfill is not a separate call in this kernel yet — promoting rewrites current projections but does not re-derive downstream facts"
        >
          Promote and backfill all {affected.toLocaleString()}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={promote}
          disabled={!ready || busy || reason.trim() === ""}
        >
          {busy ? "Promoting…" : "Promote only — leave history as it is"}
        </Button>
      </div>
      {/* Named, not omitted. The design asks for two buttons and this kernel can
          honestly offer one; saying which is missing beats shipping a button
          that silently does the other thing. */}
      <p className="mt-2 text-[11px] leading-[1.5] text-[var(--fg-muted)]">
        Backfill is disabled because this kernel has no separate backfill call —
        promotion rewrites what the ingress projects from here, and re-deriving
        the downstream facts that read the old values is not yet something it can
        be asked to do.
      </p>
      {notice !== "" && (
        <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
          {notice}
        </p>
      )}
    </div>
  );
}

function plural(n: number, noun: string): string {
  return `${n.toLocaleString()} ${n === 1 ? noun : `${noun}s`}`;
}
