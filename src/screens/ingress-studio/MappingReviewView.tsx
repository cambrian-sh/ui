import { CaretRight, Question } from "@phosphor-icons/react";
import { cn } from "@/design-system/lib/utils";

/**
 * The shared vocabulary of 15b's layout.
 *
 * The design repeats four shapes — a mono uppercase section label with a note
 * pushed to the right, a fixed 150px path column, an amber marker, and a
 * quiet-background panel. They are extracted so the screen reads as one system
 * rather than as forty ad-hoc class strings that drift apart the first time
 * somebody edits one row.
 */

/** A section heading: mono, uppercase, tracked, with an optional right note. */
export function SectionLabel({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
        {children}
      </span>
      {note !== undefined && (
        <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
          {note}
        </span>
      )}
    </div>
  );
}

/**
 * The path column, at a fixed width across every row type.
 *
 * Fixed, not auto: mapped rows, abstained rows and ignored rows all start with
 * a path, and if the column resized per row the three would stop reading as one
 * list — which is exactly the "same frame, same size" claim the section makes
 * about keeping and discarding.
 */
export function PathCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-[150px] flex-none truncate font-mono text-[11.5px] leading-[1.4] text-[var(--fg-secondary)]">
      {children}
    </span>
  );
}

/**
 * The amber marker that identifies an abstained row at a glance.
 *
 * A shape, not just a colour: colour alone is the first thing to fail on
 * somebody else's monitor, and the whole argument of this screen is that an
 * abstention must be impossible to skim past.
 */
export function AbstainMark() {
  return (
    <Question
      aria-hidden="true"
      weight="bold"
      className="mt-[2px] flex-none text-[var(--status-warn)]"
      size={12}
    />
  );
}

/** A row in one of the three lists. Zebra-free; separated by a 1px gap. */
export function Row({
  children,
  tone = "plain",
  align = "center",
}: {
  children: React.ReactNode;
  tone?: "plain" | "warn";
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 px-3.5 py-2.5",
        align === "center" ? "items-center" : "items-start",
        tone === "warn" ? "tint-wash" : "bg-[var(--bg-surface)]",
      )}
      style={
        tone === "warn"
          ? ({ "--tint": "var(--status-warn)" } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}

/** A list of rows: hairline gaps, rounded ends, no internal borders. */
export function RowList({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-lg)]">
      {children}
    </div>
  );
}

/** The three-way proportion bar. Widths are the argument, so they are exact. */
export function CoverageBar({
  mapped,
  ignored,
  abstained,
}: {
  mapped: number;
  ignored: number;
  abstained: number;
}) {
  const total = mapped + ignored + abstained;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-[10px] overflow-hidden rounded-[5px] bg-[var(--bg-surface)]">
      <span style={{ width: pct(mapped), background: SWATCH.mapped }} />
      <span style={{ width: pct(ignored), background: SWATCH.ignored }} />
      <span style={{ width: pct(abstained), background: SWATCH.abstained }} />
    </div>
  );
}

/**
 * The legend, with swatches.
 *
 * The swatch is the whole point: a bar without one is decoration, because
 * nothing connects a segment to the number that explains it.
 */
export function Legend({
  mapped,
  ignored,
  abstained,
}: {
  mapped: number;
  ignored: number;
  abstained: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <LegendItem colour={SWATCH.mapped}>{mapped} mapped</LegendItem>
      <LegendItem colour={SWATCH.ignored}>
        {ignored} ignored, kept in raw
      </LegendItem>
      <LegendItem colour={SWATCH.abstained} emphatic={abstained > 0}>
        {abstained} abstained — need you
      </LegendItem>
    </div>
  );
}

function LegendItem({
  colour,
  emphatic = false,
  children,
}: {
  colour: string;
  emphatic?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px]",
        emphatic ? "text-[var(--status-warn)]" : "text-[var(--fg-secondary)]",
      )}
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] rounded-[2px]"
        style={{ background: colour }}
      />
      {children}
    </span>
  );
}

export const SWATCH = {
  mapped: "var(--color-accent-700)",
  ignored: "var(--color-neutral-700)",
  abstained: "color-mix(in srgb, var(--status-warn) 55%, var(--bg-surface))",
};

/**
 * The lifecycle, as chips with carets.
 *
 * An operator should never have to guess where they are or why the next step is
 * unavailable — the same reason the pipeline canvas carries one. `you are here`
 * is written out rather than implied by colour alone, because colour is the
 * first thing to go wrong on somebody else's monitor.
 */
export function Lifecycle({ at }: { at: "capturing" | "mapped" }) {
  const steps: Array<{ label: string; state: "done" | "here" | "todo" }> = [
    { label: "draft", state: "done" },
    {
      label: at === "capturing" ? "capturing" : "capturing · done",
      state: at === "capturing" ? "here" : "done",
    },
    { label: "mapped", state: at === "mapped" ? "here" : "todo" },
    { label: "dry run", state: "todo" },
    { label: "armed", state: "todo" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {i > 0 && (
            <CaretRight
              aria-hidden="true"
              size={10}
              className="text-[var(--border-strong)]"
            />
          )}
          <span
            className={cn(
              "rounded-[4px] font-mono text-[10.5px]",
              s.state === "todo"
                ? "text-[var(--fg-muted)]"
                : "px-2.5 py-1 tint-fill",
              s.state === "here"
                ? "text-[var(--color-accent-400)]"
                : s.state === "done"
                  ? "text-[var(--fg-secondary)]"
                  : "",
            )}
            style={
              s.state === "here"
                ? ({ "--tint": "var(--accent-bg)" } as React.CSSProperties)
                : s.state === "done"
                  ? ({ "--tint": "var(--fg-muted)" } as React.CSSProperties)
                  : undefined
            }
          >
            {s.label}
            {s.state === "here" && " · you are here"}
          </span>
        </span>
      ))}
    </div>
  );
}
