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
      className="flex flex-none flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {stats.map(([label, n]) => (
          <span key={label} className="text-[12.5px] text-[var(--fg-muted)]">
            <span className="mr-1 text-[14px] font-semibold tabular-nums text-[var(--fg-primary)]">
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
                  className="ml-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--fg-secondary)]"
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
      className={
        count === 0
          ? 'rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11.5px] text-[var(--fg-muted)]'
          : 'inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-warn)_40%,transparent)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--fg-primary)]'
      }
      role="status"
    >
      {count > 0 && <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--status-warn)]" />}
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
      className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11.5px] text-[var(--fg-secondary)]"
      role="status"
    >
      {pending.toLocaleString()} materializing
    </span>
  );
}
