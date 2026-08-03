import { useMemo, useState } from "react";
import { Button, Input } from "@/design-system/components";
import type { GraphDocument } from "@/ipc/types";
import { reasonsInUse } from "./pipelineEdit";

/**
 * Declaring a port terminated, with a reason.
 *
 * # Why this is free text
 *
 * There is a precedent in this console for refusing free text: `TagPicker`
 * replaced free-text tags because "a free-text tag field in the admin UI is a
 * defect" — a tag is MATCHED ON, so a typo produces a boundary that silently
 * matches nothing.
 *
 * That reasoning does not transfer, and the difference is the whole design. A
 * termination reason is never matched on. It is displayed, verbatim, in dry-run
 * output and run summaries. A near-duplicate is untidy; it is not broken. Where
 * free entry is honest rather than dangerous it is allowed — which is the same
 * rule the picker itself follows when no vocabulary is configured.
 *
 * A fixed list would be actively worse: reasons are domain-specific, so most of
 * the time the right one would not be on it, and an operator would pick a
 * listed-but-wrong reason over typing the true one. That corrupts the exact copy
 * the dry run depends on.
 *
 * # What keeps it tidy
 *
 * Typeahead over reasons already used in this pipeline, which is where
 * near-duplicates actually come from and costs nothing because the graph is
 * already in hand. And a live preview of the sentence the reason lands in —
 * because the reason is a noun phrase completing "3 items took ___", and seeing
 * that sentence is what makes someone write "under the reporting threshold"
 * instead of "mag<4.5".
 */
export function TerminateDialog({
  doc,
  node,
  port,
  onCancel,
  onConfirm,
}: {
  doc: GraphDocument;
  node: string;
  port: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const existing = useMemo(() => reasonsInUse(doc), [doc]);
  const suggestions = useMemo(() => {
    const q = reason.trim().toLowerCase();
    if (q === "") return existing.slice(0, 4);
    return existing.filter((r) => r.toLowerCase().includes(q)).slice(0, 4);
  }, [existing, reason]);

  const ready = reason.trim() !== "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Terminate a port with a reason"
    >
      <div className="w-full max-w-[520px] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-4 shadow-[var(--elevation-3)]">
        <h2 className="text-[14px] font-medium">
          Terminate{" "}
          <span className="font-mono text-[12px]">
            {node}.{port}
          </span>
        </h2>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Items reaching this port stop here on purpose. The reason is required —
          a discard nobody can explain is a discard nobody can review — and it is
          operator-facing copy, not a note: it appears word for word wherever this
          discard is counted.
        </p>

        <label
          htmlFor="termination-reason"
          className="mt-3 block text-[12px] text-[var(--fg-secondary)]"
        >
          Why are these discarded?
        </label>
        <Input
          id="termination-reason"
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="under the reporting threshold"
        />

        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-[10.5px] text-[var(--fg-muted)]">
              Already used in this pipeline
            </span>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-[3px] bg-[var(--bg-base)] px-1.5 py-0.5 text-[11px] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The sentence it lands in. This is the whole reason the field is not
            just an input: what gets written is judged by how it reads here. */}
        <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--bg-base)] px-3 py-2">
          <span className="text-[10.5px] text-[var(--fg-muted)]">
            How this will read in a dry run
          </span>
          <p className="mt-0.5 text-[12px] text-[var(--fg-secondary)]">
            {ready ? (
              <>
                3 items took “
                <span className="text-[var(--fg-primary)]">{reason.trim()}</span>
                ”
              </>
            ) : (
              <span className="text-[var(--fg-muted)]">
                3 items took “…”
              </span>
            )}
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!ready}
            onClick={() => onConfirm(reason.trim())}
          >
            Terminate this port
          </Button>
        </div>
      </div>
    </div>
  );
}
