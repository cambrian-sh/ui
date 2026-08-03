import { useState } from "react";
import { PushPin } from "@phosphor-icons/react";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { ipc } from "@/ipc";
import { cn } from "@/design-system/lib/utils";
import { SectionLabel, RowList } from "./MappingReviewView";
import { isFlagged, type SchemaProfile } from "./mappingTypes";

/**
 * The evidence pane — pinned through every stage.
 *
 * This is what makes ONE column possible instead of four tabs. Every claim every
 * stage makes is checked against the same material, so the material stays put
 * and only the question changes. Four tabs meant four copies of this pane, or —
 * what actually happened — three stages with no evidence at all.
 *
 * It never moves and it scrolls independently of the column beside it.
 */
export function EvidencePane({
  profile,
  samples,
  ingressId,
  highlight,
}: {
  profile: SchemaProfile | null;
  samples: number;
  ingressId: string;
  /**
   * A path the operator asked to see, from an abstention's "Show me the 41 →".
   *
   * The two amber rows in the profile ARE the two abstentions, so jumping from
   * one to the other is following a link between two views of one fact — not
   * navigating somewhere else.
   */
  highlight?: string | null;
}) {
  const paths = Object.entries(profile?.paths ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      <div className="flex items-center gap-2.5">
        <PushPin
          aria-hidden="true"
          size={12}
          className="flex-none text-[var(--fg-muted)]"
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
          The evidence
        </span>
        <span className="ml-auto text-[11px] text-[var(--fg-muted)]">
          {samples.toLocaleString()} captured · redacted
        </span>
      </div>
      <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
        Pinned through every stage. It is why this is one column and not four
        tabs — the material you check against never changes, only the question
        does.
      </p>

      <SectionLabel>Schema profile</SectionLabel>
      {paths.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          No profile yet. It builds as deliveries land — a field appears the
          moment its shape is first seen.
        </p>
      ) : (
        <RowList>
          {paths.map(([path, stats]) => {
            const types = Object.keys(stats.types ?? {});
            const flagged = isFlagged(stats);
            const nulls = stats.nulls ?? 0;
            const lit = highlight === path;
            return (
              <div
                key={path}
                data-path={path}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-[7px]",
                  flagged || lit ? "tint-wash" : "bg-[var(--bg-surface)]",
                  lit && "tint-ring",
                )}
                style={
                  flagged || lit
                    ? ({
                        "--tint": lit
                          ? "var(--color-accent-400)"
                          : "var(--status-warn)",
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[10.5px] leading-[1.4]",
                    flagged
                      ? "text-[var(--fg-primary)]"
                      : "text-[var(--fg-secondary)]",
                  )}
                >
                  {path}
                </span>
                <span
                  className={cn(
                    "flex-none font-mono text-[10px]",
                    flagged
                      ? "text-[var(--status-warn)]"
                      : "text-[var(--fg-muted)]",
                  )}
                >
                  {types.length > 1
                    ? `${types.length} shapes`
                    : (stats.max_array_len ?? 0) > 0
                      ? `array[${stats.max_array_len}] · unlabelled`
                      : nulls > 0 && stats.present !== undefined
                        ? `null in ${nulls}/${stats.present}`
                        : `${types.join(" | ") || "—"} · ${stats.present ?? 0}/${samples}`}
                </span>
              </div>
            );
          })}
        </RowList>
      )}

      <p className="text-[11px] leading-[1.55] text-[var(--fg-muted)]">
        The amber rows are exactly the abstentions.{" "}
        <span className="text-[var(--fg-secondary)]">
          The profile and the open questions are the same list
        </span>
        , which is the point of keeping them side by side.
      </p>

      <RealDelivery ingressId={ingressId} samples={samples} />
    </div>
  );
}

/**
 * A real delivery, as formatted JSON.
 *
 * The profile says `array[3] · unlabelled`; the payload shows three bare
 * elements. Only the second makes it obvious why guessing an order would be
 * silently wrong half the time, which is the entire argument the abstention on
 * the left is making.
 *
 * # What is on screen is REDACTED, and it says so
 *
 * Values were replaced with type tokens AT CAPTURE (ADR-0112 §12) — the
 * originals were never persisted, so nothing here could show them. Saying that
 * plainly matters more than it looks: without it an operator reads
 * `"<string:place>"` as a literal the source sent, and goes looking for a bug in
 * the upstream feed.
 */
function RealDelivery({
  ingressId,
  samples,
}: {
  ingressId: string;
  samples: number;
}) {
  const [index, setIndex] = useState(0);
  const q = useKernelQuery(
    ["studio", "capture-samples", ingressId],
    () => ipc.studioCaptureSamples(ingressId, 10),
    { retry: 0, staleTime: 0, enabled: samples > 0 },
  );

  const bodies = q.data?.bodies_json ?? [];
  const total = q.data?.total ?? samples;
  const body = bodies[index];

  if (samples === 0) {
    return (
      <>
        <SectionLabel>A real delivery</SectionLabel>
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          No delivery to show yet. Capture comes before mapping precisely so this
          pane is never empty when a mapping is being reviewed.
        </p>
      </>
    );
  }

  return (
    <>
      <SectionLabel>A real delivery</SectionLabel>

      {q.error ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--status-err)]">
          {q.error.message}
        </p>
      ) : body === undefined ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[11.5px] text-[var(--fg-muted)]">
          {q.isLoading
            ? "Loading a delivery…"
            : "The profile counts deliveries this kernel no longer retains — retention pruned them."}
        </p>
      ) : (
        <>
          <pre className="max-h-[280px] overflow-auto rounded-[var(--radius-lg)] bg-[var(--bg-base)] px-3 py-2.5 font-mono text-[10.5px] leading-[1.55] text-[var(--fg-secondary)]">
            {formatJson(body)}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[var(--fg-muted)]">
              {/* Newest first, so index 0 is the newest of `total`. */}
              {Math.max(1, total - index)} of {total}
            </span>
            {bodies.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  className="text-[11px] text-[var(--color-accent-400)] hover:underline disabled:text-[var(--fg-muted)] disabled:no-underline"
                >
                  newer
                </button>
                <button
                  type="button"
                  disabled={index >= bodies.length - 1}
                  onClick={() =>
                    setIndex((i) => Math.min(bodies.length - 1, i + 1))
                  }
                  className="text-[11px] text-[var(--color-accent-400)] hover:underline disabled:text-[var(--fg-muted)] disabled:no-underline"
                >
                  older
                </button>
              </>
            )}
            {/* The design's action, named and visibly unavailable rather than
                omitted: somebody holding the handoff should see that it is
                missing on purpose, not that it was forgotten. */}
            <span
              className="ml-auto text-[11px] text-[var(--fg-muted)]"
              title="No RPC evaluates a draft against one delivery yet; dry run evaluates a saved revision against all of them"
            >
              Run the mapping on this one — not wired yet
            </span>
          </div>
        </>
      )}

      <p
        className="rounded-[var(--radius-lg)] px-3 py-2.5 text-[11px] leading-[1.55] tint-wash"
        style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
      >
        <span className="text-[var(--fg-secondary)]">
          Values are type tokens, not what the source sent.
        </span>{" "}
        Deliveries are redacted before they are stored, so the originals were
        never persisted and nothing here could show them. The SHAPE is exact —
        which is what a mapping is written against, and why an unlabelled array is
        just as visibly unlabelled once redacted.
      </p>
    </>
  );
}

/** Pretty-print if it parses; show it verbatim if it does not. */
function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // A body that will not parse is a fact about the delivery. Showing it raw
    // beats showing nothing, which reads as "there was no delivery".
    return raw;
  }
}
