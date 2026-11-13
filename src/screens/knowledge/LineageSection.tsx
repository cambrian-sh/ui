// The entity card's lineage section (ADR-0148, accepted 2026-11-12).
//
// `why` answers from STORED lineage by default — links somebody asserted, each
// labelled by the mechanism that produced it. Related events (earlier events
// that share a participant, inside a time window, ranked by a score) are a
// different kind of thing: co-occurrence, not cause. So they are fetched only
// when the operator asks, and rendered in their OWN section titled
// "Related — not causal", never mixed into the lineage list where a chain of
// rows reads as a causal story.
//
// An empty lineage answer may carry a kernel hint ("N related events available
// with include_correlation"); the hint is the kernel's, counted over what this
// caller may read, and is shown verbatim next to the toggle.

import { useState } from 'react';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { GuaranteeLabel, parseRows, RowTable, type KnowledgeRow } from './rows';

export function LineageSection({
  entityId,
  onOpenReceipt,
}: {
  entityId: string;
  onOpenReceipt: (evidenceId: string) => void;
}) {
  const [showRelated, setShowRelated] = useState(false);
  // A bare entity id is promoted to entity:<id> by the kernel; send it typed so
  // the request says exactly what it asks about.
  const ref = entityId.includes(':') ? entityId : `entity:${entityId}`;

  const lineage = useKernelQuery(
    ['knowledge', 'why', ref],
    () => ipc.knowledgeQuery({ kind: 'why', entity_id: ref }),
    { staleTime: 30_000 },
  );
  const related = useKernelQuery(
    ['knowledge', 'why-related', ref],
    () => ipc.knowledgeQuery({ kind: 'why', entity_id: ref, include_correlation: true }),
    { staleTime: 30_000, enabled: showRelated },
  );

  const lineageRows = lineage.data ? parseRows(lineage.data.rows) : [];
  const hops = lineageRows.filter((r) => r.row === 'hop');
  const hint = lineageRows.find((r) => r.row === 'hint');

  const relatedRows = related.data ? parseRows(related.data.rows) : [];
  const relatedOnly = relatedRows.filter((r) => r.row === 'related');
  const flagged = relatedRows.filter((r) => r.row === 'flagged');

  return (
    <>
      <section aria-label="Lineage" className="flex flex-col gap-2">
        <h3 className="text-[12px] uppercase tracking-wide text-[var(--fg-muted)]">
          Lineage (stored)
        </h3>
        {lineage.data ? (
          <>
            <GuaranteeLabel guarantee={lineage.data.guarantee} />
            {hops.length > 0 ? (
              <RowTable rows={hops} onOpenReceipt={onOpenReceipt} ariaLabel="Stored lineage" />
            ) : (
              <p className="text-[12.5px] text-[var(--fg-muted)]">
                No stored lineage: nobody has asserted a link behind this entity.
              </p>
            )}
            {hint && typeof hint.text === 'string' && (
              <p className="text-[12.5px] text-[var(--fg-secondary)]" role="note">
                {hint.text}
              </p>
            )}
          </>
        ) : lineage.isError ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            Lineage could not be read: {lineage.error?.message}.
          </p>
        ) : null}
        <div>
          <button
            type="button"
            aria-pressed={showRelated}
            onClick={() => setShowRelated((v) => !v)}
            className="rounded-[7px] border border-[var(--border-default)] px-2.5 py-1 text-[12px] text-[var(--fg-primary)] hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {showRelated ? 'Hide related events' : 'Show related events (not causal)'}
          </button>
        </div>
      </section>

      {showRelated && (
        <section aria-label="Related — not causal" className="flex flex-col gap-2">
          <h3 className="text-[12px] uppercase tracking-wide text-[var(--fg-muted)]">
            Related — not causal
          </h3>
          <p className="text-[12px] text-[var(--fg-muted)]">
            Earlier events that share a participant within the window, best score first. They
            happened together; nothing here says one caused another.
          </p>
          {related.data ? (
            <>
              <GuaranteeLabel guarantee={related.data.guarantee} />
              <RowTable
                rows={relatedOnly.map(withoutRowTag)}
                onOpenReceipt={onOpenReceipt}
                ariaLabel="Related events"
              />
              {flagged.map((f) => (
                <p key={String(f.ref)} className="text-[12px] text-[var(--fg-muted)]">
                  Not followed: {String(f.ref)} takes part in {String(f.events)} events in the
                  window (over {String(f.limit)}), so it relates too much to mean anything.
                </p>
              ))}
            </>
          ) : related.isError ? (
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              Related events could not be read: {related.error?.message}.
            </p>
          ) : (
            <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>
          )}
        </section>
      )}
    </>
  );
}

/** The section heading already says what these rows are; drop the discriminator column. */
function withoutRowTag(r: KnowledgeRow): KnowledgeRow {
  const { row: _row, ...rest } = r;
  return rest;
}
