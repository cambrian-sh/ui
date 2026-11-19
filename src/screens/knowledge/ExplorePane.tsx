// The entity explorer: browse what the substrate models, then drill in.
//
// The browser lists NAMES only (ListEntities discloses names, predicates and
// counts — values are served by the kernel's read planes). Selecting an entity
// asks GetObject first (ADR-0149 D7): an object of a declared table kind gets
// its whole page — current values with provenance and visible conflicts,
// lifecycle, typed links both ways, aliases, timeline — in ONE call
// (ObjectCard). Any other entity (GetObject answers null) keeps the card
// assembled from the query plane's own shapes: the latest value per predicate
// (point), participation (events), lineage, and the co-participant
// neighborhood (traverse). Every value keeps its evidence_id, so the receipt
// is one click from anything.
//
// "Show retired rows" (ENG-1753) asks the point and events reads for RETIRED
// typed rows too (KnowledgeQuery.include_retired, ENG-1045, ADR-0147 D6): rows
// a superseded mapping revision or a source deletion took out of every count,
// each marked retired with its reason, by whom and when. Off by default; the
// kernel serves it to the operator plane only, and the rows stay fenced.

import { useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import type { KnowledgeEntity } from '@/ipc/types';
import { ObjectCard } from './ObjectCard';
import { ErrorState, Input } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { cn } from '@/design-system/lib/utils';
import { GuaranteeLabel, parseRows, RowTable } from './rows';
import { NeighborGraph } from './NeighborGraph';
import { LineageSection } from './LineageSection';

/** Events/traverse need a window; the explorer reads the last 90 days. */
export function exploreWindow(): { from: string; to: string } {
  const now = Date.now();
  return {
    from: new Date(now - 90 * 24 * 3600 * 1000).toISOString(),
    to: new Date(now + 3600 * 1000).toISOString(),
  };
}

export function ExplorePane({
  selectedEntity,
  onSelectEntity,
  onOpenReceipt,
}: {
  selectedEntity: string | null;
  onSelectEntity: (entityId: string | null) => void;
  onOpenReceipt: (evidenceId: string) => void;
}) {
  const [search, setSearch] = useState('');

  const entitiesQuery = useKernelQuery(
    ['knowledge', 'entities', search],
    () => ipc.listKnowledgeEntities(search, 50),
    { staleTime: 30_000 },
  );
  const entities = entitiesQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[320px] flex-none flex-col gap-2 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find an entity…"
          aria-label="Find an entity"
        />
        {entitiesQuery.isError ? (
          <ErrorState
            reason={`Entities could not be listed: ${entitiesQuery.error?.message ?? 'the substrate lane did not answer'}.`}
            whatToDo="A read failure, not an empty store — the catalog simply did not answer."
          />
        ) : entities.length === 0 ? (
          <p className="p-1 text-[12.5px] text-[var(--fg-muted)]">
            {entitiesQuery.isSuccess
              ? 'No modelled entities match. The substrate models what its ingresses deliver — an empty catalog is an empty store, not a failure.'
              : 'Loading…'}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Modelled entities">
            {entities.map((e) => (
              <EntityRow
                key={e.entity_id}
                entity={e}
                selected={e.entity_id === selectedEntity}
                onSelect={() => onSelectEntity(e.entity_id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--page-gutter)] py-5">
        {selectedEntity ? (
          <EntityCard
            entityId={selectedEntity}
            onOpenReceipt={onOpenReceipt}
            onSelectEntity={onSelectEntity}
          />
        ) : (
          <p className="text-[13px] text-[var(--fg-muted)]">
            Select an entity to see its modelled values, its events, and its neighborhood.
          </p>
        )}
      </div>
    </div>
  );
}

function EntityRow({
  entity,
  selected,
  onSelect,
}: {
  entity: KnowledgeEntity;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'w-full rounded-[var(--radius-md)] px-2.5 py-1.5 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
          selected
            ? 'bg-[var(--list-row-bg-selected)]'
            : 'hover:bg-[var(--list-row-bg-hover)]',
        )}
      >
        <span className="block truncate font-mono text-[12.5px] text-[var(--fg-primary)]">
          {entity.entity_id}
        </span>
        <span className="block text-[11.5px] text-[var(--fg-muted)]">
          {entity.observation_count.toLocaleString()} observation
          {entity.observation_count === 1 ? '' : 's'}
          {entity.predicates.length > 0 && ` · ${entity.predicates.join(', ')}`}
        </span>
      </button>
    </li>
  );
}

function EntityCard({
  entityId,
  onOpenReceipt,
  onSelectEntity,
}: {
  entityId: string;
  onOpenReceipt: (evidenceId: string) => void;
  onSelectEntity: (entityId: string) => void;
}) {
  const objectQuery = useKernelQuery(
    ['knowledge', 'object', entityId],
    () => ipc.getObject(entityId),
    { staleTime: 30_000 },
  );
  if (objectQuery.isPending) {
    return <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>;
  }
  if (objectQuery.isError) {
    return (
      <ErrorState
        reason={`The object page could not be read: ${objectQuery.error?.message ?? 'the substrate lane did not answer'}.`}
        whatToDo="A read failure, not a missing object."
      />
    );
  }
  if (objectQuery.data) {
    return (
      <ObjectCard page={objectQuery.data} onOpenReceipt={onOpenReceipt} onSelectEntity={onSelectEntity} />
    );
  }
  return (
    <QueryPlaneCard entityId={entityId} onOpenReceipt={onOpenReceipt} onSelectEntity={onSelectEntity} />
  );
}

/** The card for an entity that is not an object of a declared table kind. */
function QueryPlaneCard({
  entityId,
  onOpenReceipt,
  onSelectEntity,
}: {
  entityId: string;
  onOpenReceipt: (evidenceId: string) => void;
  onSelectEntity: (entityId: string) => void;
}) {
  const window = useMemo(exploreWindow, []);
  const [showRetired, setShowRetired] = useState(false);
  // Sent only when asked: an absent flag is the kernel's default (retired rows hidden).
  const retired = showRetired ? { include_retired: true } : {};

  // The card's own catalog row names the predicates; each gets a point lookup.
  const entityQuery = useKernelQuery(
    ['knowledge', 'entity', entityId],
    () => ipc.listKnowledgeEntities(entityId, 1),
    { staleTime: 30_000 },
  );
  const predicates = entityQuery.data?.[0]?.predicates ?? [];

  const valuesQuery = useKernelQuery(
    ['knowledge', 'values', entityId, predicates.join(','), showRetired],
    async () => {
      const answers = await Promise.all(
        predicates.map((p) =>
          ipc.knowledgeQuery({ kind: 'point', entity_id: entityId, predicate: p, ...retired }),
        ),
      );
      return {
        guarantee: answers.find((a) => a.guarantee)?.guarantee ?? '',
        rows: answers.flatMap((a) => a.rows),
      };
    },
    { staleTime: 30_000, enabled: predicates.length > 0 },
  );

  const eventsQuery = useKernelQuery(
    ['knowledge', 'events', entityId, showRetired],
    () => ipc.knowledgeQuery({ kind: 'events', entity_id: entityId, ...window, ...retired }),
    { staleTime: 30_000 },
  );

  const traverseQuery = useKernelQuery(
    ['knowledge', 'traverse', entityId],
    () => ipc.knowledgeQuery({ kind: 'traverse', entity_id: entityId, hops: 2, ...window }),
    { staleTime: 30_000 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[15px] font-semibold text-[var(--fg-primary)]">{entityId}</h2>
        <label
          className="flex items-center gap-1.5 text-[12.5px] text-[var(--fg-secondary)]"
          title="Also list values and events a superseded mapping revision or a source deletion retired, marked with why, by whom and when."
        >
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          Show retired rows
        </label>
      </div>

      <section aria-label="Latest values" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">
          Latest values
        </h3>
        {predicates.length === 0 && entityQuery.isSuccess ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            No observation predicates modelled for this entity (it may appear only in
            resolutions or events).
          </p>
        ) : valuesQuery.data ? (
          <>
            <GuaranteeLabel guarantee={valuesQuery.data.guarantee} />
            <RowTable
              rows={parseRows(valuesQuery.data.rows)}
              onOpenReceipt={onOpenReceipt}
              ariaLabel="Latest values"
            />
          </>
        ) : valuesQuery.isError ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            Values could not be read: {valuesQuery.error?.message}. A read failure, not an
            empty model.
          </p>
        ) : null}
      </section>

      <section aria-label="Events" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">
          Events (last 90 days)
        </h3>
        {eventsQuery.data ? (
          <RowTable
            rows={parseRows(eventsQuery.data.rows)}
            onOpenReceipt={onOpenReceipt}
            ariaLabel="Events"
          />
        ) : eventsQuery.isError ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            Events could not be read: {eventsQuery.error?.message}.
          </p>
        ) : null}
      </section>

      <LineageSection entityId={entityId} onOpenReceipt={onOpenReceipt} />

      <section aria-label="Neighborhood" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">
          Neighborhood (co-participation, 2 hops)
        </h3>
        {traverseQuery.data ? (
          <NeighborGraph
            center={entityId}
            rows={parseRows(traverseQuery.data.rows)}
            // Clicking a neighbor re-centres the card — exploration IS the feature.
            onSelect={(id) => id !== entityId && onSelectEntity(id)}
          />
        ) : traverseQuery.isError ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">
            The neighborhood could not be read: {traverseQuery.error?.message}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
