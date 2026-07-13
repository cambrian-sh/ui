
import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { BlastRadiusMutation, BlastRadiusPreviewResponse } from '@/ipc/types';

export function MemoryBlastRadius({ mutation }: { mutation: BlastRadiusMutation }) {
  const [preview, setPreview] = useState<BlastRadiusPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getBlastRadiusPreview(mutation)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [mutation]);

  if (error) {
    return (
      <div className="rounded-sm border border-[var(--status-err)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[11px] text-[var(--status-err)]">
        Blast-radius preview failed: {error}
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[11px] text-[var(--fg-muted)]">
        Computing blast radius…
      </div>
    );
  }

  const widened = preview.affected_agents.filter((a) => a.impact === 'widened').length;
  const narrowed = preview.affected_agents.filter((a) => a.impact === 'narrowed').length;
  const reEval = preview.affected_plans.filter((p) => p.re_evaluation_required).length;

  return (
    <div
      role="region"
      aria-live="polite"
      className="flex flex-col gap-1.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[11px]"
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Blast radius</div>
      <div className="font-mono text-[10px] text-[var(--fg-secondary)]">
        {preview.affected_agents.length} agent{preview.affected_agents.length === 1 ? '' : 's'} affected
        ({widened} widened, {narrowed} narrowed); {reEval} plan{reEval === 1 ? '' : 's'} to re-evaluate.
      </div>
      <div className="text-[10px] text-[var(--fg-muted)]">
        Cache TTL {preview.cache_ttl_ms} ms · computed {preview.computed_at}
      </div>
    </div>
  );
}
