// The holdings header — what this substrate holds, per source surface.
//
// Every ingress is a surface, and its data is scoped by that surface: evidence
// carries the ingress's classification floor at capture (ADR-0112) and reads
// filter on it per principal (ADR-0118). The per-source table with its tags is
// where that model becomes VISIBLE instead of implicit — which surface
// contributed what, and which scopes gate it. All numbers are full-visibility:
// the operator console sees everything by design.

import type { SubstrateOverview } from '@/ipc/types';

export function OverviewStrip({ overview }: { overview: SubstrateOverview }) {
  const stats: Array<[string, number]> = [
    ['evidence', overview.evidence_count],
    ['events', overview.event_count],
    ['observations', overview.observation_count],
    ['knowledge items', overview.knowledge_item_count],
    ['live resolutions', overview.live_resolution_count],
    ['entities', overview.entity_count],
    ['actors', overview.actor_count],
  ];
  return (
    <section
      aria-label="Substrate holdings"
      className="flex flex-none flex-col gap-2 border-b border-[var(--border-default)] px-5 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {stats.map(([label, n]) => (
          <span key={label} className="text-[12.5px] text-[var(--fg-muted)]">
            <span className="mr-1 font-medium tabular-nums text-[var(--fg-primary)]">
              {n.toLocaleString()}
            </span>
            {label}
          </span>
        ))}
        <ContradictionBadge count={overview.contradiction_count} />
        <OutboxBadge pending={overview.outbox_pending} />
      </div>
      {overview.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Holdings per source surface">
          {overview.sources.slice(0, 8).map((s) => (
            <span key={s.source_id} className="text-[12px] text-[var(--fg-secondary)]">
              <span className="font-mono text-[var(--fg-primary)]">{s.source_id}</span>
              <span className="mx-1 tabular-nums text-[var(--fg-muted)]">
                ×{s.evidence_count.toLocaleString()}
              </span>
              {s.classification.map((tag) => (
                <span
                  key={tag}
                  className="ml-1 rounded-[4px] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--fg-muted)]"
                >
                  {tag}
                </span>
              ))}
            </span>
          ))}
          {overview.sources.length > 8 && (
            <span className="text-[12px] text-[var(--fg-muted)]">
              +{overview.sources.length - 8} more sources
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Disagreement is a headline metric for this product — the substrate RETURNS
 * contradictions rather than resolving them away, so the count sits in the
 * header, not behind a query. Word + shape, never colour alone.
 */
function ContradictionBadge({ count }: { count: number }) {
  return (
    <span
      className="rounded-[5px] border border-[var(--border-strong)] px-1.5 py-0.5 text-[11.5px] text-[var(--fg-secondary)]"
      role="status"
    >
      {count === 0 ? 'no contradictions' : `${count} contradiction${count === 1 ? '' : 's'}`}
    </span>
  );
}

/**
 * The async-ingest health number: evidence archived but not yet transformed
 * into typed rows. Non-zero moments after an ingest is normal ("your data is
 * still materializing"); shown only when non-zero so zero is silence.
 */
function OutboxBadge({ pending }: { pending: number }) {
  if (pending === 0) return null;
  return (
    <span
      className="rounded-[5px] border border-[var(--border-strong)] px-1.5 py-0.5 text-[11.5px] text-[var(--fg-secondary)]"
      role="status"
    >
      {pending.toLocaleString()} materializing
    </span>
  );
}
