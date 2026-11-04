import { useCallback, useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import type {
  IngestFileParams,
  IngestMemoryParams,
  IngestMemoryResponse,
  MemoryWrittenEvent,
} from '@/ipc/types';

export type IngestStatus = 'queued' | 'parsing' | 'indexed' | 'failed';

export interface IngestRow {
  /** Client-side row id: a row exists before the kernel assigns a doc_id. */
  local_id: string;
  label: string;
  status: IngestStatus;
  doc_id: string | null;
  deduped: boolean;
  /** ADR-0138 B1.1: the stored document this exact file duplicates; nothing was written. */
  duplicate_of: string | null;
  /** ADR-0138 D3/B1.2: the version the document became (>1 = replaced an earlier one). */
  version: number | null;
  error: string | null;
  /** Chunks reported for this doc, or null when the kernel gives no matchable count. */
  chunks: number | null;
}

/**
 * The ingest queue.
 *
 * `IngestMemory` is SYNCHRONOUS on the kernel: it runs the whole
 * mint-source-doc → chunk → persist pipeline and only then returns. So the call
 * resolving IS the "indexed" signal — the row is `parsing` while the promise is
 * in flight and `indexed` the moment it resolves.
 *
 * The chunk count is best-effort and usually absent. `IngestMemory` returns the
 * SOURCE-DOC id (`source_doc:<uri>`), but each chunk's `MemoryWrittenOp` carries
 * its own per-chunk fact id, so the two never match and the count cannot be
 * derived today. Showing the count needs the kernel to stamp the source-doc id on
 * `MemoryWrittenOp`; until then a resolved row is honestly `indexed` with no
 * fabricated number.
 */
function pendingRow(local_id: string, label: string): IngestRow {
  return {
    local_id,
    label,
    status: 'parsing',
    doc_id: null,
    deduped: false,
    duplicate_of: null,
    version: null,
    error: null,
    chunks: null,
  };
}

/** The row fields an `IngestMemoryResponse` settles (contract 0100 fields optional). */
function settled([doc_id, deduped, duplicate_of, version]: IngestMemoryResponse) {
  return {
    status: 'indexed' as const,
    doc_id,
    deduped,
    duplicate_of: duplicate_of ? duplicate_of : null,
    version: version ? version : null,
  };
}

export function useIngestQueue(memoryWritten: MemoryWrittenEvent[]) {
  const [rows, setRows] = useState<IngestRow[]>([]);

  const chunkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of memoryWritten) {
      counts.set(ev.doc_id, (counts.get(ev.doc_id) ?? 0) + 1);
    }
    return counts;
  }, [memoryWritten]);

  const enqueue = useCallback(async (label: string, params: IngestMemoryParams) => {
    const local_id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRows((prev) => [...prev, pendingRow(local_id, label)]);

    try {
      const resp = await ipc.ingestMemory(params);
      setRows((prev) => prev.map((r) => (r.local_id === local_id ? { ...r, ...settled(resp) } : r)));
      const [doc_id] = resp;
      return doc_id;
    } catch (err) {
      const message = errorMessage(err);
      setRows((prev) =>
        prev.map((r) => (r.local_id === local_id ? { ...r, status: 'failed', error: message } : r)),
      );
      return null;
    }
  }, []);

  /**
   * File lane: the Rust core reads the bytes from `params.path`. Identical queue
   * bookkeeping to `enqueue`; only the IPC call differs, so a 500 MB file never
   * becomes a JS array.
   */
  const enqueueFile = useCallback(async (label: string, params: IngestFileParams) => {
    const local_id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRows((prev) => [...prev, pendingRow(local_id, label)]);
    try {
      const resp = await ipc.ingestFile(params);
      setRows((prev) => prev.map((r) => (r.local_id === local_id ? { ...r, ...settled(resp) } : r)));
      const [doc_id] = resp;
      return doc_id;
    } catch (err) {
      const message = errorMessage(err);
      setRows((prev) =>
        prev.map((r) => (r.local_id === local_id ? { ...r, status: 'failed', error: message } : r)),
      );
      return null;
    }
  }, []);

  /** Rows with a chunk count folded in when — and only when — one can be matched. */
  const resolved = useMemo<IngestRow[]>(
    () =>
      rows.map((r) => {
        const matched = r.doc_id ? chunkCounts.get(r.doc_id) : undefined;
        return { ...r, chunks: matched ?? null };
      }),
    [rows, chunkCounts],
  );

  /** doc_ids ingested this session — what the Inspect tab can honestly show. */
  const sessionDocIds = useMemo(
    () => resolved.filter((r) => r.doc_id !== null).map((r) => r.doc_id as string),
    [resolved],
  );

  return { rows: resolved, enqueue, enqueueFile, sessionDocIds };
}
