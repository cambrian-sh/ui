import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button, Input } from "@/design-system/components";
import type { StudioDraft, StudioFieldAbstention } from "@/ipc/types";
import {
  AbstainMark,
  CoverageBar,
  Legend,
  PathCell,
  Row,
  RowList,
  SectionLabel,
} from "./MappingReviewView";
import {
  ignoredBecause,
  targetsFor,
  type Coverage,
  type MappingSpec,
  type PathStats,
  type SchemaProfile,
} from "./mappingTypes";

/**
 * Stage 3 — the mapping, inside the column.
 *
 * Carried over from 15b unchanged in substance. The four things that must not be
 * lost, because each of them is the reason this screen exists:
 *
 *   1. ABSTENTIONS ARE ROWS, in field order, with reasons and decisions. Never
 *      an empty field, never a list at the bottom. An empty field reads as an
 *      oversight and gets filled in without anybody reading why the model would
 *      not — and a drafter that cannot say "I don't know" is one that guesses.
 *   2. Coverage split three ways, same frame, same size.
 *   3. What it throws away, INCLUDING the rule that has matched zero times —
 *      a zero is how you spot a typo in a filter.
 *   4. The drafter proposed this and cannot save, transition or arm it.
 *
 * New in 17a: each abstention carries a link into the evidence. The two amber
 * rows in the profile ARE the two abstentions, so the pane and the open
 * questions are the same list — which is the argument for keeping them side by
 * side rather than behind a tab.
 */
export function MappingStage({
  samples,
  result,
  coverage,
  spec,
  profile,
  guidance,
  drafting,
  readOnly,
  onGuidance,
  onPropose,
  onDecide,
  onShowEvidence,
}: {
  samples: number;
  result: StudioDraft | null;
  coverage: Coverage | null;
  spec: MappingSpec | null;
  profile: SchemaProfile | null;
  guidance: string;
  drafting: boolean;
  readOnly: boolean;
  onGuidance: (next: string) => void;
  onPropose: () => void;
  onDecide: (path: string, choice: string) => void;
  onShowEvidence: (path: string) => void;
}) {
  const abstained = result?.ok === true && result.abstained !== "";

  return (
    <div className="flex flex-col gap-3.5">
      <ProposeOnly
        samples={samples}
        abstentions={result?.field_abstentions?.length ?? 0}
      />

      {!readOnly && (
        <div className="flex flex-col gap-2">
          <SectionLabel note="the drafter reads the profile; this is what it cannot">
            Anything the samples cannot tell it
          </SectionLabel>
          <div className="flex gap-2">
            <Input
              id="mapping-guidance"
              aria-label="Anything the samples cannot tell it"
              value={guidance}
              onChange={(e) => onGuidance(e.target.value)}
              placeholder="e.g. treat properties.updated as re-observed at"
            />
            <Button
              size="sm"
              disabled={samples === 0 || drafting}
              onClick={onPropose}
            >
              {drafting ? "Drafting…" : "Propose a mapping"}
            </Button>
          </div>
          {samples === 0 && (
            <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
              No captured coverage yet. The drafter abstains on zero samples
              rather than guessing — capture first. You cannot map a source you
              have not seen.
            </p>
          )}
        </div>
      )}

      {abstained && <WholeDraftAbstention reason={result!.abstained} />}

      {coverage && !abstained && (
        <>
          <CoverageSplit
            coverage={coverage}
            profile={profile}
            spec={spec}
            abstentions={result?.field_abstentions ?? []}
            onDecide={onDecide}
            onShowEvidence={onShowEvidence}
          />
          <Discards spec={spec} coverage={coverage} />
        </>
      )}

      {result?.ok === false && result.error !== "" && (
        <p
          className="rounded-[var(--radius-md)] p-3 text-[12px] leading-[1.6] tint-wash"
          style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
        >
          {result.error}
        </p>
      )}
    </div>
  );
}

function ProposeOnly({
  samples,
  abstentions,
}: {
  samples: number;
  abstentions: number;
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-3 tint-wash tint-ring"
      style={{ "--tint": "var(--accent-bg)" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Sparkle
          aria-hidden="true"
          size={14}
          weight="fill"
          className="flex-none text-[var(--color-accent-400)]"
        />
        <h4 className="text-[12.5px] font-medium">
          The drafter proposed this. It cannot save, transition or arm it.
        </h4>
      </div>
      <p className="mt-1 text-[12px] leading-[1.65] text-[var(--fg-secondary)]">
        Written from the schema profile and {samples.toLocaleString()}{" "}
        {samples === 1 ? "captured delivery" : "captured deliveries"}.
        {abstentions > 0 && (
          <>
            {" "}
            It abstained {abstentions === 1 ? "once" : `${abstentions} times`},
            and{" "}
            {abstentions === 1 ? "that abstention sits" : "those abstentions sit"}{" "}
            below with the rest of the mapping rather than at the bottom — an
            abstention shown as an empty field reads as an oversight, and gets
            filled in without anybody reading why the model would not.
          </>
        )}
      </p>
    </div>
  );
}

/** The drafter declined to propose anything at all — distinct from a field. */
function WholeDraftAbstention({ reason }: { reason: string }) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-3 tint-wash tint-ring"
      style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
    >
      <h4 className="text-[12.5px] font-medium text-[var(--status-warn)]">
        The drafter abstained — it needs you
      </h4>
      <p className="mt-1 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
        {reason}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        A first-class outcome, not a failure. Answer it in the guidance box above
        and propose again, or write the mapping by hand.
      </p>
    </div>
  );
}

function CoverageSplit({
  coverage,
  profile,
  spec,
  abstentions,
  onDecide,
  onShowEvidence,
}: {
  coverage: Coverage;
  profile: SchemaProfile | null;
  spec: MappingSpec | null;
  abstentions: StudioFieldAbstention[];
  onDecide: (path: string, choice: string) => void;
  onShowEvidence: (path: string) => void;
}) {
  const mapped = coverage.MappedPaths ?? [];
  const abstainedPaths = new Set(abstentions.map((a) => a.path));
  // An abstained path is not "ignored" — nobody has decided about it yet, and
  // showing it in the ignored column would say a decision was made.
  const ignored = (coverage.UnmappedPaths ?? []).filter(
    (p) => !abstainedPaths.has(p),
  );
  const total = mapped.length + ignored.length + abstentions.length;
  const targets = targetsFor(spec);

  // Field order, with abstentions inline among the mappings rather than
  // collected at the bottom. Where a row sits is part of what it says.
  const rows: Array<{ path: string; kind: "mapped" | "ignored" | "abstained" }> = [
    ...mapped.map((path) => ({ path, kind: "mapped" as const })),
    ...abstentions.map((a) => ({ path: a.path, kind: "abstained" as const })),
    ...ignored.map((path) => ({ path, kind: "ignored" as const })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <section className="flex flex-col gap-2.5">
      <CoverageBar
        mapped={mapped.length}
        ignored={ignored.length}
        abstained={abstentions.length}
      />
      <Legend
        mapped={mapped.length}
        ignored={ignored.length}
        abstained={abstentions.length}
      />
      <span className="sr-only">
        Coverage · {total} {total === 1 ? "field" : "fields"}
      </span>

      <RowList>
        {rows.map((row) =>
          row.kind === "abstained" ? (
            <AbstentionRow
              key={row.path}
              abstention={abstentions.find((a) => a.path === row.path)!}
              onDecide={onDecide}
              onShowEvidence={onShowEvidence}
            />
          ) : (
            <FieldRow
              key={row.path}
              path={row.path}
              target={targets.get(row.path)}
              stats={profile?.paths?.[row.path]}
              missRate={coverage.MissRates?.[row.path]}
              samples={coverage.Samples}
              kind={row.kind}
            />
          ),
        )}
      </RowList>
    </section>
  );
}

/**
 * An abstention is a ROW, in field order, with the decision to make.
 *
 * The single easiest thing to get wrong on this screen — so it gets the same
 * visual weight as a confident mapping, and it gets buttons.
 *
 * Choosing an option does not edit the spec directly. The drafter is
 * propose-only, so a decision reaches it the way every other instruction does:
 * as guidance for the next proposal. That keeps one path into the mapping rather
 * than two that can disagree.
 */
function AbstentionRow({
  abstention,
  onDecide,
  onShowEvidence,
}: {
  abstention: StudioFieldAbstention;
  onDecide: (path: string, choice: string) => void;
  onShowEvidence: (path: string) => void;
}) {
  return (
    <Row tone="warn" align="start">
      <PathCell>{abstention.path}</PathCell>
      <AbstainMark />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11.5px] font-medium text-[var(--status-warn)]">
          Abstained — this one is yours to decide
        </div>
        <p className="mb-2 text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
          “{abstention.reason}”
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {abstention.options.map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant="secondary"
              onClick={() => onDecide(abstention.path, opt)}
            >
              {opt}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDecide(abstention.path, "leave it in raw")}
          >
            Leave it in raw
          </Button>
          {/* Into the evidence. The amber row over there IS this row. */}
          <button
            type="button"
            onClick={() => onShowEvidence(abstention.path)}
            className="ml-1 text-[11px] text-[var(--color-accent-400)] hover:underline"
          >
            It is pinned in the evidence →
          </button>
        </div>
      </div>
    </Row>
  );
}

function FieldRow({
  path,
  target,
  stats,
  missRate,
  samples,
  kind,
}: {
  path: string;
  target: string | undefined;
  stats: PathStats | undefined;
  missRate: number | undefined;
  samples: number | undefined;
  kind: "mapped" | "ignored";
}) {
  const types = Object.keys(stats?.types ?? {});
  const present = stats?.present ?? samples ?? 0;

  if (kind === "ignored") {
    return (
      <Row>
        <PathCell>{path}</PathCell>
        <span className="min-w-0 flex-1 text-[11px] text-[var(--fg-muted)]">
          ignored — {ignoredBecause(stats, stats?.present ?? samples)} Still in
          raw.
        </span>
      </Row>
    );
  }

  return (
    <Row>
      <PathCell>{path}</PathCell>
      {/* Where it lands. A mapping is a pair, and showing only the left half
          makes it look like a list of fields that were noticed. */}
      <ArrowRight
        aria-hidden="true"
        size={10}
        className="flex-none text-[var(--fg-muted)]"
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-[1.4] text-[var(--color-accent-300,var(--color-accent-400))]">
        {target ?? "—"}
      </span>
      <span className="flex-none text-[10.5px] text-[var(--fg-muted)]">
        {types.join(" | ") || "—"} ·{" "}
        {missRate === undefined
          ? `${present}/${samples ?? present}`
          : `${Math.round((1 - missRate) * 100)}%`}
      </span>
    </Row>
  );
}

/**
 * What the mapping throws away — same frame, same size as what it keeps.
 *
 * A discard is the part of a mapping that cannot be noticed later: the data
 * simply is not there, and nothing about the result says it was ever meant to
 * be. The rule that has matched zero times is shown for the same reason — a rule
 * that never fires and a rule that CANNOT fire look identical until you count
 * them, and a zero is the cheapest way to notice a typo in a filter.
 */
function Discards({
  spec,
  coverage,
}: {
  spec: MappingSpec | null;
  coverage: Coverage;
}) {
  const rules = spec?.discards ?? [];
  const discardedPaths = coverage.DiscardedPaths ?? [];

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel note="an unnamed discard rule is refused at parse time">
        What this mapping throws away
      </SectionLabel>

      {rules.length === 0 && discardedPaths.length === 0 ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--bg-base)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          Nothing. Every delivery this mapping accepts becomes knowledge.
        </p>
      ) : (
        <RowList>
          {rules.map((r, i) => (
            <Row key={`${r.name}-${i}`} align="start">
              {/* The count column at display size. It reads an em dash because
                  this deployment cannot count it — see the note below, which
                  names the mechanism rather than showing a plausible zero. */}
              <span className="w-[40px] flex-none text-right font-mono text-[15px] leading-[1.1] text-[var(--fg-muted)]">
                —
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-[12px] font-medium">“{r.name}”</div>
                <div className="font-mono text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
                  {r.path}
                  {r.equals !== undefined && ` = ${JSON.stringify(r.equals)}`}
                  {r.exists !== undefined && (r.exists ? " exists" : " is absent")}
                  {" — discarded before the save"}
                </div>
              </div>
            </Row>
          ))}
          {discardedPaths.map((p) => (
            <Row key={p}>
              <span className="w-[40px] flex-none text-right font-mono text-[15px] leading-[1.1] text-[var(--fg-muted)]">
                —
              </span>
              <span className="min-w-0 flex-1 font-mono text-[11px] text-[var(--fg-muted)]">
                {p}
              </span>
            </Row>
          ))}
        </RowList>
      )}

      {rules.length > 0 && (
        <p className="text-[11px] leading-[1.55] text-[var(--fg-muted)]">
          <span className="text-[var(--fg-secondary)]">
            How often each rule has fired cannot be counted here.
          </span>{" "}
          That number — “167, which is 78% of all arrivals” — is the one worth
          double-checking before arming, and a zero beside a rule is how you spot
          a typo in a filter. Neither is available from the archive: deliveries
          are redacted before they are stored, so it holds the shape of every
          delivery and the value of none, and a rule matching on a value has
          nothing left to match against. Dry run counts discards over traffic
          arriving now, where the values are still present.
        </p>
      )}
    </section>
  );
}
