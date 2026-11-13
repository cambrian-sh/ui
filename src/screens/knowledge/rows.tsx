// Row rendering for the knowledge substrate's typed answers.
//
// Rows arrive as JSON objects (the plane's v1 wire shape) whose keys are
// shape-specific — point rows carry value_* columns, contradiction rows carry
// an actors map, traverse rows carry from/to/hop. A dynamic table is the
// honest renderer: it shows exactly what the store answered, never a schema
// this build guessed at. The one interactive column is `evidence_id` — every
// answer's receipt is one click away, which is the audit story of the page.

import { cn } from '@/design-system/lib/utils';

export type KnowledgeRow = Record<string, unknown>;

/** Parse the wire rows, keeping an undecodable row visible rather than dropped. */
export function parseRows(rows: string[]): KnowledgeRow[] {
  return rows.map((r) => {
    try {
      const v: unknown = JSON.parse(r);
      return typeof v === 'object' && v !== null ? (v as KnowledgeRow) : { value: v };
    } catch {
      return { undecodable: r };
    }
  });
}

/** Column order: stable, with identity first and provenance last. */
function columnsOf(rows: KnowledgeRow[]): string[] {
  const first = ['entity_id', 'predicate', 'actor', 'actors', 'event_type'];
  const last = ['evidence_id'];
  const seen = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) seen.add(k);
  const middle = [...seen].filter((k) => !first.includes(k) && !last.includes(k)).sort();
  return [...first.filter((k) => seen.has(k)), ...middle, ...last.filter((k) => seen.has(k))];
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

/**
 * The guarantee banner. Rendered VERBATIM and always — the label is the
 * product promise, and a row set without its warranty is just another list.
 */
export function GuaranteeLabel({ guarantee }: { guarantee: string }) {
  if (!guarantee) return null;
  return (
    <p className="text-[12.5px] text-[var(--fg-muted)]">
      <span className="font-medium text-[var(--fg-secondary)]">Guarantee: </span>
      {guarantee}
    </p>
  );
}

export function RowTable({
  rows,
  onOpenReceipt,
  ariaLabel,
}: {
  rows: KnowledgeRow[];
  onOpenReceipt?: (evidenceId: string) => void;
  ariaLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--fg-muted)]">
        0 rows. The query ran and the store holds nothing matching — an answer, not an error.
      </p>
    );
  }
  const columns = columnsOf(rows);
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--card-border)] bg-[var(--bg-surface)]">
      <table className="w-full text-[13px]" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-left">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-mono text-[11.5px] font-medium text-[var(--fg-muted)]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn('border-b border-[var(--border-subtle)] last:border-b-0 align-top hover:bg-[var(--list-row-bg-hover)]')}
            >
              {columns.map((c) => {
                const v = row[c];
                if (c === 'evidence_id' && typeof v === 'string' && v !== '' && onOpenReceipt) {
                  return (
                    <td key={c} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(v)}
                        className="font-mono text-[12px] text-[var(--color-accent-500)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        {v.length > 14 ? `${v.slice(0, 14)}…` : v}
                      </button>
                    </td>
                  );
                }
                return (
                  <td key={c} className="px-3 py-2 tabular-nums text-[var(--fg-primary)]">
                    {formatCell(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
