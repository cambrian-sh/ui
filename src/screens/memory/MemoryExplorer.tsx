/* Memory explorer (PRD-05 + UI-012 + UI-013).
 *
 * The filter bar + virtualised list + detail (FACT + SCENE + mutating
 * actions). The inline graph view is a placeholder for V1 (UI-012's
 * React Flow graph lands in a follow-on). The blast-radius panel uses
 * `op_blast_radius_preview` (per §3.1 / UI-013) before any tag action.
 *
 * The list data is read via `memory_query` (kernel ADR-0022's pull
 * mechanism) — the projection store does not carry the document list.
 * For V1 the list is empty; the wire lands when the memory list IPC
 * ships (UI-IMPL-19, the Memory console entry's P1 ticket).
 */
import { useState, useMemo } from 'react';
import { MemoryList, type MemoryDocument, type MemoryDocType } from '@/design-system/components/cambrian/memory-list';
import { MemoryDetail } from './MemoryDetail';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';

const ALL_DOCTYPES: MemoryDocType[] = [
  'mnemonic_fact',
  'mnemonic_scene',
  'episodic_memory',
  'procedural_template',
  'agent_profile',
  'negative_edge',
  'tool',
  'skill',
];

const DOCTYPE_LABEL: Record<MemoryDocType, string> = {
  mnemonic_fact: 'FACT',
  mnemonic_scene: 'SCENE',
  episodic_memory: 'EPISODIC',
  procedural_template: 'TEMPLATE',
  agent_profile: 'AGENT',
  negative_edge: 'NEG-EDGE',
  tool: 'TOOL',
  skill: 'SKILL',
};

export function MemoryExplorer() {
  const [doctypes, setDoctypes] = useState<Set<MemoryDocType>>(new Set());
  const [query, setQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docs] = useState<MemoryDocument[]>([]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (doctypes.size > 0 && !doctypes.has(d.doc_type)) return false;
      if (query && !d.content_preview.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [docs, doctypes, query]);

  const selected = filtered.find((d) => d.doc_id === selectedDocId) ?? null;

  const toggleDoctype = (dt: MemoryDocType) => {
    setDoctypes((prev) => {
      const next = new Set(prev);
      if (next.has(dt)) next.delete(dt);
      else next.add(dt);
      return next;
    });
  };

  const reset = () => {
    setDoctypes(new Set());
    setQuery('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Memory</h1>
        <p className="text-xs text-[var(--fg-muted)]">
          Long-Term Memory. The list is empty in V1 until the memory list IPC ships
          (UI-IMPL-19). The detail pane and blast-radius panel are wired.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filter</CardTitle>
          <CardDescription>DocType + free text. More filters (scope, session, time, activation) land in UI-IMPL-19.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {ALL_DOCTYPES.map((dt) => {
              const active = doctypes.has(dt);
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => toggleDoctype(dt)}
                  aria-pressed={active}
                  className={
                    'rounded-sm border px-2 py-0.5 font-mono text-[10px] ' +
                    (active
                      ? 'border-[var(--accent-bg)] bg-[var(--accent-bg)] text-[var(--fg-on-accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]')
                  }
                >
                  {DOCTYPE_LABEL[dt]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory…"
              aria-label="Search memory"
              className="flex-1 rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={reset}
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
            >
              Reset
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-y-auto rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <MemoryList
            docs={filtered}
            selectedId={selectedDocId}
            onSelect={setSelectedDocId}
            emptyTitle="No memories match"
            emptyBody="The list is empty in V1 — the memory list IPC ships in UI-IMPL-19."
          />
        </div>
        <div className="overflow-y-auto">
          {selected ? (
            <MemoryDetail doc={selected} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">No document selected</CardTitle>
                <CardDescription>Select a memory from the list to see FACT, SCENE, and the mutating actions.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
