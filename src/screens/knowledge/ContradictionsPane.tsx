// The standing disagreement list — the substrate RETURNS contradictions,
// never resolves them away, and this pane is that promise as a surface.
//
// Each row is one (entity, predicate) where two or more actors' CURRENT
// resolutions carry distinct values, both sides shown side by side. The
// substrate takes no view on who is right: showing the disagreement is the
// feature, and any styling that made one side look "wrong" would be the
// console editorializing over the store.

import { ipc } from '@/ipc';
import type { KnowledgeKindCount } from '@/ipc/types';
import { ErrorState } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { formatCell, type KnowledgeRow, parseRows } from './rows';

export function ContradictionsPane({ kinds }: { kinds: KnowledgeKindCount[] }) {
  const kindNames = kinds.map((k) => k.kind);
  const query = useKernelQuery(
    ['knowledge', 'contradictions', kindNames.join(',')],
    async () => {
      const answers = await Promise.all(
        kindNames.map(async (kind) => ({
          kind,
          rows: parseRows((await ipc.knowledgeQuery({ kind: 'contradictions', item_kind: kind })).rows),
        })),
      );
      return answers.filter((a) => a.rows.length > 0);
    },
    { staleTime: 30_000, enabled: kindNames.length > 0 },
  );

  if (kindNames.length === 0) {
    return (
      <p className="p-5 text-[13px] text-[var(--fg-muted)]">
        No knowledge kinds are modelled yet, so there is nothing to disagree about.
      </p>
    );
  }
  if (query.isError) {
    return (
      <div className="p-5">
        <ErrorState
          reason={`Contradictions could not be read: ${query.error?.message ?? 'the substrate lane did not answer'}.`}
          whatToDo="Do not read this as agreement. A failed read and a store with no disagreement look identical from an empty page, and only one of them is safe to act on."
        />
      </div>
    );
  }
  if (!query.data) return null;
  if (query.data.length === 0) {
    return (
      <p className="p-5 text-[13px] text-[var(--fg-muted)]">
        No current disagreements: every entity's actors are aligned right now. Checked across{' '}
        {kindNames.join(', ')}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {query.data.map(({ kind, rows }) => (
        <section key={kind} aria-label={`Contradictions in ${kind}`} className="flex flex-col gap-2">
          <h3 className="type-label text-[var(--fg-muted)]">{kind}</h3>
          {rows.map((row, i) => (
            <ContradictionCard key={i} row={row} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ContradictionCard({ row }: { row: KnowledgeRow }) {
  const actors =
    typeof row.actors === 'object' && row.actors !== null
      ? Object.entries(row.actors as Record<string, unknown>)
      : [];
  return (
    <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
      <p className="font-mono text-[12.5px] text-[var(--fg-primary)]">
        {formatCell(row.entity_id)}
        <span className="mx-1.5 text-[var(--fg-muted)]">·</span>
        <span className="text-[var(--fg-secondary)]">{formatCell(row.predicate)}</span>
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {actors.map(([actor, value]) => (
          <div
            key={actor}
            className="rounded-[7px] border border-[var(--border-strong)] px-3 py-2"
          >
            <p className="text-[11.5px] text-[var(--fg-muted)]">{actor} currently asserts</p>
            <p className="mt-0.5 text-[13px] font-medium text-[var(--fg-primary)]">
              {formatCell(value)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] italic text-[var(--fg-muted)]">
        Both assertions are live. The substrate returns the disagreement; resolving it is a
        human call.
      </p>
    </div>
  );
}
