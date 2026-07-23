import { useMemo, useState } from 'react';
import type { MemoryWrittenEvent } from '@/ipc/types';
import {
  MemoryList,
  type MemoryDocument,
  type MemoryDocType,
} from '@/design-system/components/cambrian/memory-list';
import { MemoryDetail } from './MemoryDetail';

const KNOWN_DOCTYPES: MemoryDocType[] = [
  'mnemonic_fact',
  'mnemonic_scene',
  'episodic_memory',
  'procedural_template',
  'agent_profile',
  'negative_edge',
  'tool',
  'skill',
];

function toDocType(raw: string): MemoryDocType {
  return (KNOWN_DOCTYPES as string[]).includes(raw)
    ? (raw as MemoryDocType)
    : 'episodic_memory';
}

/**
 * Documents ingested in THIS session, folded from MemoryWrittenOps.
 *
 * This is not a browse surface: there is no `ListMemory` RPC, and an empty-query
 * `queryMemory` returns nothing because the kernel lane is a search, not a scan.
 * The empty state says so rather than implying the corpus is empty.
 */
export function InspectTab({ events }: { events: MemoryWrittenEvent[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = useMemo<MemoryDocument[]>(() => {
    const byDoc = new Map<string, MemoryDocument>();
    for (const ev of events) {
      const existing = byDoc.get(ev.doc_id);
      if (existing) continue;
      byDoc.set(ev.doc_id, {
        doc_id: ev.doc_id,
        doc_type: toDocType(ev.doc_type),
        scope_tags: [],
        activation_strength: 1,
        session_id: ev.session_id,
        created_at: ev.written_at,
        content_preview: ev.summary || ev.source,
      });
    }
    return [...byDoc.values()];
  }, [events]);

  const selected = docs.find((d) => d.doc_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <MemoryList
          docs={docs}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyTitle="No documents this session"
          emptyBody="Shows documents ingested in this session. Full browse needs a ListMemory RPC, which does not exist yet."
        />
      </div>
      {selected && <MemoryDetail doc={selected} />}
    </div>
  );
}
