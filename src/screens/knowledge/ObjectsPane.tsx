// The objects list (ADR-0149 D6; ENG-1395).
//
// The operator's view of the L1 list query: pick a declared object kind, add
// typed conditions on its properties, sort, and page through the objects —
// the same request the list_objects tool and the agent plane take, validated,
// fenced and executed by the kernel. The kinds, properties and their types come
// from the live ontology, so the form can only offer what the kernel will
// accept; a literal that does not parse (a number, a date) is refused before it
// is sent, with the field named.

import { useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import type { ObjectConditionInput, ObjectsList } from '@/ipc/types';
import { Button, ErrorState } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { type DeclaredKind, parseDeclarations } from './OntologyPane';

/** The operators the kernel accepts per declared type (ADR-0149 D6). */
export const OPS_BY_TYPE: Record<string, string[]> = {
  number: ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'is_null'],
  date: ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'is_null'],
  text: ['eq', 'ne', 'in', 'prefix', 'is_null'],
  entity: ['eq', 'in', 'is_null'],
};

const PAGE_SIZE = 50;

interface ConditionRow {
  property: string;
  op: string;
  value: string;
}

/** Builds the kernel request's conditions; `in` takes a comma-separated list, is_null none. */
export function toConditions(kind: DeclaredKind, rows: ConditionRow[]): ObjectConditionInput[] {
  return rows
    .filter((r) => r.property !== '')
    .map((r) => {
      const type = kind.predicates?.[r.property]?.type ?? 'text';
      const raw = r.op === 'is_null' ? [] : r.op === 'in' ? r.value.split(',').map((v) => v.trim()) : [r.value];
      return { property: r.property, op: r.op, values: raw.map((value) => ({ type, value })) };
    });
}

export function ObjectsPane() {
  const ontology = useKernelQuery(['knowledge', 'ontology'], () => ipc.getOntology(), { staleTime: 30_000 });
  const tableKinds = useMemo(() => {
    if (!ontology.data) return [];
    try {
      return parseDeclarations(ontology.data.declarations_json).kinds.filter((k) => k.table);
    } catch {
      return [];
    }
  }, [ontology.data]);

  const [kindName, setKindName] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [sort, setSort] = useState({ property: '', desc: false });
  const [pages, setPages] = useState<ObjectsList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kind = tableKinds.find((k) => k.kind === kindName) ?? tableKinds[0];
  const properties = Object.keys(kind?.predicates ?? {}).sort();

  if (ontology.isError) {
    return (
      <div className="px-[var(--page-gutter)] py-6">
        <ErrorState
          reason={`The ontology could not be read: ${ontology.error?.message ?? 'the substrate lane did not answer'}.`}
          whatToDo="The object kinds come from it; without it there is nothing to list."
        />
      </div>
    );
  }
  if (!ontology.data) return null;
  if (!kind) {
    return (
      <p className="px-[var(--page-gutter)] py-6 text-[13px] text-[var(--fg-muted)]">
        No kind is declared with an object table, so there are no objects to list. Declare one on the Ontology tab
        (<span className="font-mono">"table": true</span>).
      </p>
    );
  }

  const list = async (pageToken: string) => {
    setBusy(true);
    setError(null);
    try {
      const page = await ipc.listObjects({
        kind: kind.kind,
        conditions: toConditions(kind, conditions),
        order_by: sort.property ? [{ property: sort.property, desc: sort.desc }] : [],
        fields: [],
        page_size: PAGE_SIZE,
        page_token: pageToken,
      });
      setPages((prev) => (pageToken ? [...prev, page] : [page]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = pages.flatMap((p) => p.rows);
  const last = pages[pages.length - 1];
  const setCondition = (i: number, patch: Partial<ConditionRow>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-[var(--page-gutter)] py-6">
      <section aria-label="Object list request" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <label className="flex items-center gap-2">
            Kind
            <select
              aria-label="Object kind"
              value={kind.kind}
              onChange={(e) => {
                setKindName(e.target.value);
                setConditions([]);
                setSort({ property: '', desc: false });
                setPages([]);
              }}
              className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1"
            >
              {tableKinds.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.kind}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Sort by
            <select
              aria-label="Sort property"
              value={sort.property}
              onChange={(e) => setSort((s) => ({ ...s, property: e.target.value }))}
              className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1"
            >
              <option value="">entity id</option>
              {properties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sort.desc}
              onChange={(e) => setSort((s) => ({ ...s, desc: e.target.checked }))}
            />
            descending
          </label>
        </div>

        {conditions.map((c, i) => {
          const type = kind.predicates?.[c.property]?.type ?? 'text';
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]" aria-label={`Condition ${i + 1}`}>
              <select
                aria-label={`Condition ${i + 1} property`}
                value={c.property}
                onChange={(e) => setCondition(i, { property: e.target.value, op: 'eq' })}
                className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1"
              >
                <option value="">property…</option>
                {properties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Condition ${i + 1} operator`}
                value={c.op}
                onChange={(e) => setCondition(i, { op: e.target.value })}
                className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1"
              >
                {(OPS_BY_TYPE[type] ?? OPS_BY_TYPE.text).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {c.op !== 'is_null' && (
                <input
                  aria-label={`Condition ${i + 1} value`}
                  value={c.value}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  placeholder={type === 'date' ? 'RFC 3339, e.g. 2026-12-01T00:00:00Z' : c.op === 'in' ? 'a, b, c' : type}
                  className="min-w-[200px] rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1"
                />
              )}
              <Button size="sm" variant="ghost" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          );
        })}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConditions((cs) => [...cs, { property: '', op: 'eq', value: '' }])}
          >
            Add condition
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void list('')}>
            List objects
          </Button>
        </div>
      </section>

      {error && (
        <ErrorState
          reason={`The list was refused: ${error}.`}
          whatToDo="Nothing was listed. The reason names the field; fix it and list again."
        />
      )}

      {pages.length > 0 && (
        <section aria-label="Objects" className="flex flex-col gap-2">
          <p className="text-[12px] text-[var(--fg-muted)]">
            {rows.length} object(s) of kind {kind.kind} at declarations version {last.decl_version}. Values are each
            property's current value; a value the console may not read would be absent.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" aria-label="Object rows">
              <thead>
                <tr className="text-left text-[11.5px] text-[var(--fg-muted)]">
                  <th className="py-1 pr-3 font-medium">Object</th>
                  {properties.map((p) => (
                    <th key={p} className="py-1 pr-3 font-medium">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entity_id} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 pr-3 font-mono text-[12px]">{r.entity_id}</td>
                    {properties.map((p) => (
                      <td key={p} className="py-1.5 pr-3 tabular-nums">
                        {r.values.find((v) => v.property === p)?.value.display ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {last.next_page_token && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void list(last.next_page_token)}>
              Next page
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
