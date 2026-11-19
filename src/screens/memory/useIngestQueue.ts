import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import type {
  IngestFileParams,
  IngestMemoryParams,
  IngestMemoryResponse,
  IngestStatusOp,
  MemoryWrittenEvent,
} from '@/ipc/types';
import { isTerminalIngest, pollIngestStatus } from './ingestProgress';

/**
 * `indexed` is the pre-0111 meaning (the call returned, so the document is stored).
 * With the `ingest-status` capability a row follows the kernel's own states instead:
 * `accepted` / `embedding` while a large upload is embedded in the background,
 * `searchable` when it can be found, `failed` with the kernel's cause.
 */
export type IngestStatus =
  | 'queued'
  | 'parsing'
  | 'indexed'
  | 'accepted'
  | 'embedding'
  | 'searchable'
  | 'failed';

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
  /** Contract 0111: the kernel's last reported ingest status (ingest-status only). */
  ingest: IngestStatusOp | null;
}

/**
 * The ingest queue.
 *
 * Without the `ingest-status` capability, `IngestMemory` is SYNCHRONOUS on the kernel:
 * it runs the whole mint-source-doc → chunk → persist pipeline and only then returns.
 * So the call resolving IS the "indexed" signal — the row is `parsing` while the
 * promise is in flight and `indexed` the moment it resolves.
 *
 * With `ingest-status` (contract 0111, ENG-2143) a large upload is accepted at once
 * and embedded in the background: the response carries the kernel's status, and a
 * row that is not yet terminal is polled with `GetIngestStatus` until it is
 * `searchable` or `failed`, showing `embedding n of total` on the way.
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
    ingest: null,
  };
}

/** The row status a kernel ingest state maps to; an unknown (newer) state reads as settled. */
export function rowStatusOf(s: IngestStatusOp): IngestStatus {
  switch (s.state) {
    case 'accepted':
    case 'embedding':
    case 'searchable':
    case 'failed':
      return s.state;
    default:
      return 'indexed';
  }
}

/** The row fields one kernel ingest status settles. */
export function fromStatus(s: IngestStatusOp): Partial<IngestRow> {
  const status = rowStatusOf(s);
  return {
    status,
    ingest: s,
    error: status === 'failed' ? s.error || 'the kernel reported no cause' : null,
  };
}

/**
 * The row fields an `IngestMemoryResponse` settles (contract 0100/0111 fields optional).
 * `trackIngest` is the `ingest-status` capability: without it the row is `indexed`
 * exactly as before contract 0111.
 */
export function settled(
  [doc_id, deduped, duplicate_of, version, status]: IngestMemoryResponse,
  trackIngest: boolean,
): Partial<IngestRow> {
  const base: Partial<IngestRow> = {
    status: 'indexed',
    doc_id,
    deduped,
    duplicate_of: duplicate_of ? duplicate_of : null,
    version: version ? version : null,
  };
  if (!trackIngest || !status || !status.state) return base;
  return { ...base, ...fromStatus(status) };
}

export interface IngestQueueOptions {
  /** The kernel advertises `ingest-status` (contract 0111): follow background embedding. */
  ingestStatus?: boolean;
  /** Injected for tests; defaults to `ipc.getIngestStatus`. */
  readStatus?: (documentId: string) => Promise<IngestStatusOp | null>;
  pollIntervalMs?: number;
}

export function useIngestQueue(memoryWritten: MemoryWrittenEvent[], opts: IngestQueueOptions = {}) {
  const [rows, setRows] = useState<IngestRow[]>([]);
  const trackIngest = opts.ingestStatus === true;
  const readStatus = opts.readStatus ?? ipc.getIngestStatus;
  const pollIntervalMs = opts.pollIntervalMs;

  // Every poll stops when the screen goes away.
  const abort = useRef(new AbortController());
  useEffect(() => {
    const ctl = new AbortController();
    abort.current = ctl;
    return () => ctl.abort();
  }, []);

  const patch = useCallback((local_id: string, fields: Partial<IngestRow>) => {
    setRows((prev) => prev.map((r) => (r.local_id === local_id ? { ...r, ...fields } : r)));
  }, []);

  /** Settle a row from the response; follow a background embed until it is terminal. */
  const settle = useCallback(
    (local_id: string, resp: IngestMemoryResponse) => {
      const fields = settled(resp, trackIngest);
      patch(local_id, fields);
      const st = fields.ingest;
      if (!trackIngest || !st || isTerminalIngest(st.state)) return;
      const docId = st.document_id || resp[0];
      pollIngestStatus(docId, readStatus, (s) => patch(local_id, fromStatus(s)), {
        signal: abort.current.signal,
        intervalMs: pollIntervalMs,
      }).catch((err: unknown) => {
        // The document was accepted; only its progress could not be read. Say so
        // rather than leave a spinner that never ends.
        patch(local_id, {
          status: 'failed',
          error: `accepted, but its progress could not be read: ${errorMessage(err)}`,
        });
      });
    },
    [trackIngest, readStatus, pollIntervalMs, patch],
  );

  const chunkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of memoryWritten) {
      counts.set(ev.doc_id, (counts.get(ev.doc_id) ?? 0) + 1);
    }
    return counts;
  }, [memoryWritten]);

  const enqueue = useCallback(
    async (label: string, params: IngestMemoryParams) => {
      const local_id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setRows((prev) => [...prev, pendingRow(local_id, label)]);

      try {
        const resp = await ipc.ingestMemory(params);
        settle(local_id, resp);
        const [doc_id] = resp;
        return doc_id;
      } catch (err) {
        patch(local_id, { status: 'failed', error: errorMessage(err) });
        return null;
      }
    },
    [settle, patch],
  );

  /**
   * File lane: the Rust core reads the bytes from `params.path`. Identical queue
   * bookkeeping to `enqueue`; only the IPC call differs, so a 500 MB file never
   * becomes a JS array.
   */
  const enqueueFile = useCallback(
    async (label: string, params: IngestFileParams) => {
      const local_id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setRows((prev) => [...prev, pendingRow(local_id, label)]);
      try {
        const resp = await ipc.ingestFile(params);
        settle(local_id, resp);
        const [doc_id] = resp;
        return doc_id;
      } catch (err) {
        patch(local_id, { status: 'failed', error: errorMessage(err) });
        return null;
      }
    },
    [settle, patch],
  );

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
