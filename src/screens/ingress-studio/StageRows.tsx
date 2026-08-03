import { Check, CaretDown } from "@phosphor-icons/react";
import { cn } from "@/design-system/lib/utils";
import type { Stage } from "./studioStages";

/**
 * The three row shapes the column is made of.
 *
 * A stage is only ever one of these, and which one is derived from the server's
 * lifecycle — never from a tab the operator clicked.
 */

/**
 * A completed stage, collapsed to a one-line receipt CARRYING ITS FINDING.
 *
 * Not a checkmark. A tick says the stage happened; the finding says what the
 * next stage will be judged against — "214 deliveries · 11 fields · 2 vary in
 * shape". The last of those is *why* two fields below are abstentions, so a
 * collapsed stage still explains the open one.
 *
 * It is a button (`aria-expanded`) because re-reading capture while resolving an
 * abstention is the normal case, and expanding one deliberately does NOT
 * collapse the current stage.
 */
export function Receipt({
  stage,
  expanded,
  onToggle,
  onAction,
  children,
}: {
  stage: Stage;
  expanded: boolean;
  onToggle: () => void;
  onAction?: () => void;
  /** What the receipt reveals when expanded. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={children === undefined}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <Check
            aria-hidden="true"
            size={13}
            weight="bold"
            className="flex-none text-[var(--color-accent-400)]"
          />
          <span className="flex-none text-[12.5px] font-medium">
            {stage.title}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] leading-[1.45] text-[var(--fg-muted)]">
            {stage.line}
          </span>
          {children !== undefined && (
            <CaretDown
              aria-hidden="true"
              size={10}
              className={cn(
                "flex-none text-[var(--fg-muted)] transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </button>
        {stage.action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex-none text-[11.5px] text-[var(--color-accent-400)] hover:underline"
          >
            {stage.action}
          </button>
        )}
      </div>
      {expanded && children !== undefined && (
        <div className="border-t border-[var(--border-subtle)] px-3.5 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A stage that cannot be reached yet, stating its OWN precondition.
 *
 * Never a dim tab. "Dry run — needs an accepted mapping. Two abstentions are
 * open above — resolve them and this opens on its own." is a to-do list; a
 * greyed-out tab is a dead click.
 */
export function Precondition({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)]/50 px-3.5 py-3">
      <StageNumber n={stage.index} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[12.5px] font-medium text-[var(--fg-muted)]">
          {stage.title}
        </div>
        <div className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          {stage.line}
        </div>
      </div>
    </div>
  );
}

/**
 * The current stage: the only expanded one, and the only one with a primary
 * action. The accent ring is what makes "you are here" survive a screenshot.
 */
export function OpenStage({
  stage,
  note,
  tone = "accent",
  icon,
  title,
  children,
}: {
  stage?: Stage;
  /** The right-aligned caveat, e.g. the drafter's propose-only claim. */
  note?: React.ReactNode;
  tone?: "accent" | "warn";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 tint-ring"
      style={
        {
          "--tint":
            tone === "warn" ? "var(--status-warn)" : "var(--color-accent-400)",
        } as React.CSSProperties
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {icon ?? (stage && <StageNumber n={stage.index} current />)}
        <h3 className="text-[15px] font-medium tracking-[-0.01em]">
          {title ?? stage?.title}
        </h3>
        {note !== undefined && (
          <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function StageNumber({
  n,
  current = false,
}: {
  n: number;
  current?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full font-mono text-[10px]",
        current
          ? "text-[var(--color-accent-400)] tint-fill"
          : "bg-[var(--bg-base)] text-[var(--fg-muted)]",
      )}
      style={
        current
          ? ({ "--tint": "var(--color-accent-400)" } as React.CSSProperties)
          : undefined
      }
    >
      {n}
    </span>
  );
}

/**
 * The note that explains the receipt convention, once, where it applies.
 *
 * Design copy, kept because it is the sentence that teaches somebody to read the
 * column: a receipt carries its finding, not a tick.
 */
export function ReceiptNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="-mt-1 pl-3.5 text-[11px] leading-[1.55] text-[var(--fg-muted)]">
      {children}
    </p>
  );
}
