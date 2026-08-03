import { NODE_SPECS, FAMILY_LABEL, FAMILY_TONE } from "./nodeVocabulary";
import type { NodeFamily } from "./nodeVocabulary";

/**
 * The palette is the whole vocabulary.
 *
 * A closed vocabulary is a feature, and an operator who knows the list is finite
 * behaves differently — they look for the node that does the thing rather than
 * assuming they will have to write something. That is why the footer note is
 * real information rather than flavour, and why the rail is allowed to be a rail:
 * the list fits because the language cannot grow.
 *
 * Adding is only offered while editing. Outside edit mode the list still reads —
 * knowing what the vocabulary contains is useful without wanting to change
 * anything — but nothing is clickable, because a control that does nothing is
 * worse than no control.
 */

const ORDER: NodeFamily[] = ["trigger", "gate", "transform", "effect", "control"];

export function NodePalette({
  canAdd = false,
  after = null,
  onAdd,
}: {
  canAdd?: boolean;
  /** The step a new one would land after, when there is one. */
  after?: string | null;
  onAdd?: (kind: string) => void;
} = {}) {
  return (
    <aside className="hidden w-[186px] shrink-0 flex-col border-r border-[var(--border-subtle)] lg:flex">
      {canAdd && (
        <p className="border-b border-[var(--border-subtle)] px-3 py-2 text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          {after !== null ? (
            <>
              Adds after{" "}
              <span className="text-[var(--color-accent-400)]">{after}</span>,
              wired in.
            </>
          ) : (
            "Select a step first and the next one lands after it, wired in."
          )}
        </p>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-4">
          {ORDER.map((family) => {
            const specs = NODE_SPECS.filter((s) => s.family === family);
            if (specs.length === 0) return null;
            return (
              <section key={family} className="flex flex-col gap-1.5">
                <h3
                  className="font-mono text-[9.5px] uppercase tracking-[0.1em]"
                  style={{ color: FAMILY_TONE[family] }}
                >
                  {FAMILY_LABEL[family]}
                </h3>
                <ul className="flex flex-col gap-1">
                  {specs.map((s) => {
                    // A trigger is never added from here: a pipeline has exactly
                    // one and it is bound to its source, not chosen.
                    const addable = canAdd && onAdd && s.family !== "trigger";
                    // The kind is shown only when it ADDS something.
                    //
                    // "Choice / choice" thirteen times over is thirteen lines
                    // of noise that teach an operator to stop reading the
                    // second line — which is where "Answer / run_turn" lives,
                    // the one case where the kind is the name they will meet
                    // again on a card, on an edge and in a trace.
                    //
                    // Exact match only, deliberately: "Repeat until /
                    // repeat_until" survives, because the underscored form is
                    // the one they will meet again and the palette is where
                    // they learn to connect the two.
                    const kindAdds =
                      s.kind.toLowerCase() !== s.label.toLowerCase();
                    const body = (
                      <>
                        <span className="block text-[12px] leading-[1.3]">
                          {s.label}
                        </span>
                        {kindAdds && (
                          <span className="block font-mono text-[9.5px] text-[var(--fg-muted)]">
                            {s.kind}
                          </span>
                        )}
                      </>
                    );
                    const shell =
                      // The effect family is visually distinct because family
                      // is the only thing that tells you what a node can do.
                      family === "effect"
                        ? "rounded-[var(--radius-md)] px-2 py-1.5 tint-wash"
                        : "rounded-[var(--radius-md)] px-2 py-1.5 bg-[var(--bg-surface)]";
                    const style =
                      family === "effect"
                        ? ({ "--tint": "var(--status-warn)" } as React.CSSProperties)
                        : undefined;
                    return (
                      <li key={s.kind} title={s.lead}>
                        {addable ? (
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData("text/plain", s.kind)
                            }
                            onClick={() => onAdd!(s.kind)}
                            className={`${shell} w-full text-left hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
                            style={style}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className={shell} style={style}>
                            {body}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <p className="border-t border-[var(--border-subtle)] p-3 text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
        There is no code node, and there never will be. The expression language is
        closed and non-Turing — so the palette is the whole vocabulary, which is
        why it fits in a rail.
      </p>
    </aside>
  );
}
