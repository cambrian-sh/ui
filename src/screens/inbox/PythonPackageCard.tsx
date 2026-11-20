import type { HITLIntervention } from '@/ipc/types';

/**
 * What a `python_package` approval asks (ADR-0157 D7.8.6): the one-line summary and
 * the card text the kernel wrote — the target agent, the package and version, who
 * asked and why, the source, and every distribution with the SHA-256 of each file it
 * may install. Approving approves exactly that set for that one agent.
 */
export function PythonPackageCard({ hitl }: { hitl: HITLIntervention }) {
  if (hitl.kind !== 'python_package') return null;
  const preview = (hitl.proposed_action?.args_preview as string | undefined) ?? '';
  const text = (hitl.proposed_action?.object as string | undefined) ?? '';
  return (
    <section aria-label="Python package request" className="flex flex-col gap-1 text-[11.5px]">
      {preview && <p className="text-[var(--fg-secondary)]">{preview}</p>}
      {text && (
        <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] p-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
          {text}
        </pre>
      )}
    </section>
  );
}
