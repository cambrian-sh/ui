// The evidence receipt — where any answer's provenance chain ends.
//
// Every substrate row keeps its evidence_id; this inspector resolves one to
// the receipt: which source surface delivered it, its source-native key, the
// content hash, when it was ingested, and the classification tags that gate
// it. The audit story of the whole console is that this drawer is one click
// from any value.

import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { formatCell, GuaranteeLabel, parseRows } from './rows';

export function ReceiptInspector({ evidenceId }: { evidenceId: string }) {
  const query = useKernelQuery(
    ['knowledge', 'receipt', evidenceId],
    () => ipc.knowledgeQuery({ kind: 'evidence', evidence_id: evidenceId }),
    { staleTime: Infinity }, // evidence is immutable by construction
  );

  if (query.isError) {
    return (
      <p className="p-4 text-[12.5px] text-[var(--fg-muted)]">
        The receipt could not be read: {query.error?.message}. A read failure — the evidence
        row itself is immutable and still there.
      </p>
    );
  }
  const row = query.data ? parseRows(query.data.rows)[0] : undefined;
  if (!row) {
    return query.isSuccess ? (
      <p className="p-4 text-[12.5px] text-[var(--fg-muted)]">
        No receipt visible for <span className="font-mono">{evidenceId}</span>.
      </p>
    ) : null;
  }

  const fields: Array<[string, unknown]> = [
    ['evidence id', row.id],
    ['source surface', row.source_id],
    ['source key', row.source_key],
    ['source revision', row.source_revision],
    ['source time', row.source_time],
    ['ingested at', row.ingested_at],
    ['content hash', row.content_hash],
    ['content bytes', row.content_bytes],
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <GuaranteeLabel guarantee={query.data?.guarantee ?? ''} />
      <dl className="flex flex-col gap-1.5">
        {fields.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">{label}</dt>
            <dd className="break-all font-mono text-[12px] text-[var(--fg-primary)]">
              {formatCell(value)}
            </dd>
          </div>
        ))}
      </dl>
      {Array.isArray(row.classification) && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
            Classification (the scopes that gate this material)
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {(row.classification as unknown[]).length === 0 ? (
              <span className="text-[12px] text-[var(--fg-muted)]">untagged</span>
            ) : (
              (row.classification as unknown[]).map((tag) => (
                <span
                  key={String(tag)}
                  className="rounded-[4px] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fg-secondary)]"
                >
                  {String(tag)}
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
