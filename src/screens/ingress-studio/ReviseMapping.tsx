// Revise a LIVE ingress's mapping by prompt (ADR-0112 §12 addendum).
//
// The operator says what should change ("add the quake as a role; extract
// depth from /geometry/coordinates/2"); the drafter REVISES the current
// mapping — same closed language, same validator, same propose-only contract,
// stream identity kept deterministically. Saving the proposal mints an
// immutable revision, which forks the revising lane: the live release keeps
// running, and the shadow-reprocess → promote flow below is how the revision
// reaches reality. This box AUTHORS; it never applies.

import { useMemo, useState } from "react";
import { ipc } from "@/ipc";
import type { StudioDraft } from "@/ipc/types";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { useMutation } from "@/lib/useMutation";

export function ReviseMapping({
  ingressId,
  baseRevision,
  readOnly,
  onSaved,
}: {
  ingressId: string;
  baseRevision: number;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<StudioDraft | null>(null);
  const [notice, setNotice] = useState("");

  const base = useKernelQuery(
    ["studio", "mapping-revision", ingressId, baseRevision],
    () => ipc.studioGetRevision("mapping", ingressId, baseRevision),
    { enabled: baseRevision > 0, staleTime: 0 },
  );
  const draft = useMutation(ipc.studioDraftMapping);
  const save = useMutation(ipc.studioSaveSpec);

  const prettySpec = useMemo(() => {
    if (!result?.spec_json) return null;
    try {
      return JSON.stringify(JSON.parse(result.spec_json), null, 2);
    } catch {
      return result.spec_json;
    }
  }, [result?.spec_json]);

  if (readOnly || baseRevision <= 0) return null;

  const propose = async () => {
    setNotice("");
    setResult(null);
    const baseSpec = base.data?.spec_json ?? "";
    if (baseSpec === "") {
      setNotice("The current mapping revision could not be read; try again.");
      return;
    }
    const r = await draft.mutate(ingressId, instruction, baseSpec);
    if (r) setResult(r);
  };

  const saveRevision = async () => {
    if (!result?.spec_json) return;
    const saved = await save.mutate("mapping", ingressId, result.spec_json);
    if (!saved?.ok) {
      setNotice(saved?.error ?? "the revision could not be saved");
      return;
    }
    setNotice(
      `Saved as revision ${saved.revision}. The live release keeps running — shadow-test the revision below, then promote.`,
    );
    setResult(null);
    setInstruction("");
    onSaved();
  };

  return (
    <section
      aria-label="Revise the mapping"
      className="rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3"
    >
      <p className="text-[12.5px] font-medium text-[var(--fg-primary)]">
        Revise the mapping
      </p>
      <p className="mt-0.5 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
        Say what should change in revision {baseRevision}; the drafter proposes a full
        revised mapping through the same validator. Nothing changes until you save it,
        and nothing runs until you promote it.
      </p>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="e.g. add the event itself as a role named quake; extract depth from /geometry/coordinates/2"
        aria-label="What should change"
        rows={2}
        className="mt-2 w-full rounded-[7px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2.5 py-1.5 text-[12px] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void propose()}
          disabled={draft.isLoading || instruction.trim() === "" || !base.data?.spec_json}
          className="rounded-[7px] border border-[var(--border-strong)] px-3 py-1 text-[12px] text-[var(--fg-primary)] disabled:opacity-50 hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {draft.isLoading ? "Proposing…" : "Propose revision"}
        </button>
        {result?.spec_json && (
          <button
            type="button"
            onClick={() => void saveRevision()}
            disabled={save.isLoading}
            className="rounded-[7px] bg-[color-mix(in_srgb,var(--accent-bg)_16%,transparent)] px-3 py-1 text-[12px] font-medium text-[var(--fg-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {save.isLoading ? "Saving…" : "Save as new revision"}
          </button>
        )}
      </div>

      {draft.error && (
        <p className="mt-2 text-[11.5px] text-[var(--fg-secondary)]">
          The proposal could not run: {draft.error}
        </p>
      )}
      {result && result.error !== "" && (
        <p className="mt-2 text-[11.5px] text-[var(--fg-secondary)]">{result.error}</p>
      )}
      {result && result.abstained !== "" && (
        <p className="mt-2 rounded-[7px] border border-dashed border-[var(--border-strong)] px-3 py-2 text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
          Declined — {result.abstained}. Refine the instruction; the drafter never
          guesses past its own doubt.
        </p>
      )}
      {result?.field_abstentions?.map((fa) => (
        <p key={fa.path} className="mt-1 text-[11.5px] text-[var(--fg-muted)]">
          undecided <span className="font-mono">{fa.path}</span>: {fa.reason}
        </p>
      ))}
      {prettySpec && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-[7px] border border-[var(--border-default)] bg-[var(--bg-inset)] p-2 font-mono text-[11px] leading-[1.5] text-[var(--fg-primary)]">
          {prettySpec}
        </pre>
      )}
      {notice !== "" && (
        <p className="mt-2 text-[11.5px] text-[var(--fg-secondary)]">{notice}</p>
      )}
    </section>
  );
}
