import { useState } from "react";
import { Button, Input } from "@/design-system/components";
import { cn } from "@/design-system/lib/utils";
import type { GraphDocument } from "@/ipc/types";

/**
 * Starting a pipeline.
 *
 * It asks two things and nothing else, because two things are all a human can
 * supply that the canvas cannot: what to call it, and what starts it. Everything
 * after that is a graph, and the canvas is better at graphs than a form is.
 *
 * The old flow opened a condition/action form — one condition, one arm, filled in
 * before anything was visible. That is the shape this whole surface replaced: it
 * cannot express a branch, it cannot express a discard, and it asks for the
 * expression before showing what the payload looks like.
 *
 * What this produces is deliberately INCOMPLETE: a trigger, and nothing wired to
 * it. The first refusal an operator sees is "wire it, or declare it terminated
 * with a reason", which is exactly the next decision. Starting from something
 * that already compiles would mean guessing what the pipeline is for.
 */
export function NewPipelineDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (doc: GraphDocument) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"ingress" | "stream" | "schedule">("ingress");
  const [ref, setRef] = useState("");

  const id = slug(name);
  const ready = name.trim() !== "" && ref.trim() !== "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New pipeline"
    >
      <div className="w-full max-w-[560px] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-4 shadow-[var(--elevation-3)]">
        <h2 className="text-[14px] font-medium">New pipeline</h2>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Two questions, then the canvas. A pipeline is a graph, and the rest of
          it is drawn rather than filled in.
        </p>

        <label
          htmlFor="pipeline-name"
          className="mt-3 block text-[12px] text-[var(--fg-secondary)]"
        >
          What is it called?
        </label>
        <Input
          id="pipeline-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Quake watch → desk"
        />
        {id !== "" && (
          <p className="mt-1 font-mono text-[10.5px] text-[var(--fg-muted)]">
            id: {id} — fixed once it is saved, because effect keys derive from it
          </p>
        )}

        <fieldset className="mt-3">
          <legend className="text-[12px] text-[var(--fg-secondary)]">
            What starts it?
          </legend>
          <div className="mt-1 flex gap-1">
            {(
              [
                ["ingress", "An ingress"],
                ["stream", "A signal stream"],
                ["schedule", "A schedule"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={cn(
                  "rounded-[var(--radius-md)] px-2.5 py-1 text-[11.5px]",
                  type === value
                    ? "tint-fill text-[var(--color-accent-400)]"
                    : "bg-[var(--bg-base)] text-[var(--fg-secondary)]",
                )}
                style={
                  type === value
                    ? ({ "--tint": "var(--accent-bg)" } as React.CSSProperties)
                    : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label
          htmlFor="pipeline-ref"
          className="mt-3 block text-[12px] text-[var(--fg-secondary)]"
        >
          {type === "ingress"
            ? "Which ingress?"
            : type === "stream"
              ? "Which stream?"
              : "On what schedule?"}
        </label>
        <Input
          id="pipeline-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={
            type === "ingress"
              ? "usgs-quakes"
              : type === "stream"
                ? "ingress.records.*"
                : "0 8 * * 1"
          }
        />

        <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--bg-base)] px-3 py-2 text-[11px] leading-[1.6] text-[var(--fg-muted)]">
          It starts with a trigger and nothing after it, so the first thing the
          validator will say is that the trigger's output goes nowhere. That is
          the next decision, and it is better made on the canvas — with the
          payload's schema beside it — than guessed at in this box.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!ready}
            onClick={() => onCreate(starterGraph(id, name.trim(), type, ref.trim()))}
          >
            Draw it
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The starting graph: a bound trigger, and nothing else.
 *
 * One node, no edges. It does not compile, and that is the point — the refusal
 * names the next decision instead of the console inventing one.
 */
export function starterGraph(
  id: string,
  name: string,
  type: "ingress" | "stream" | "schedule",
  ref: string,
): GraphDocument {
  return {
    id,
    // Revision 1 is what Save will store; the writer assigns the real number.
    revision: 1,
    name,
    state: "draft",
    trigger: {
      type,
      ...(type === "ingress" ? { ingress: ref } : {}),
      ...(type === "stream" ? { stream_id: ref } : {}),
      ...(type === "schedule" ? { cron: ref } : {}),
    },
    scope: {
      nodes: [{ id: "trigger", kind: "trigger", name: ref }],
      edges: [],
      terminations: [],
    },
  };
}

/**
 * A stable id from the name.
 *
 * Derived once, at creation, and then fixed: effect keys and journal records are
 * built from the node and pipeline ids, so renaming a pipeline later must not
 * change the identity of work already done.
 */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
