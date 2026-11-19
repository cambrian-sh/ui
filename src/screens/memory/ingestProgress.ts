import type { IngestStatusOp } from '@/ipc/types';

/**
 * Background-embed progress of an upload (contract 0111, ENG-2143; capability
 * `ingest-status`).
 *
 * A large upload is ACCEPTED at once and embedded in the background, so the
 * `IngestMemory` call resolving no longer means the document can be found. The
 * kernel says where it stands — accepted → embedding (n of total chunks) →
 * searchable, or failed with the cause — and `GetIngestStatus` reads it. These are
 * the pure parts: what a state means, how it reads, and the poll loop; the queue
 * (`useIngestQueue`) and the document view (`MemoryDetail`) render them.
 */

/** How often a non-terminal ingest is re-read. */
export const INGEST_POLL_MS = 1500;

/** Consecutive read failures tolerated before the poll gives up and reports. */
export const INGEST_POLL_MAX_ERRORS = 5;

/**
 * Only "accepted" and "embedding" are in flight. "searchable" and "failed" are the
 * kernel's terminal states; an unknown state (a newer kernel) is treated as terminal
 * and shown as it is, so the console never polls forever on a word it does not know.
 */
export function isTerminalIngest(state: string): boolean {
  return state !== 'accepted' && state !== 'embedding';
}

/** One line for the state, in the kernel's words. */
export function describeIngest(s: IngestStatusOp): string {
  switch (s.state) {
    case 'accepted':
      return 'accepted · embedding in the background';
    case 'embedding': {
      const progress =
        s.chunks_total > 0 ? `embedding ${s.chunks_embedded} of ${s.chunks_total} chunks` : 'embedding…';
      // A failed attempt waiting for its retry carries the cause; it is not the end.
      return s.error ? `${progress} · retrying after: ${s.error}` : progress;
    }
    case 'searchable':
      return 'searchable';
    case 'failed':
      return `failed: ${s.error || 'the kernel reported no cause'}`;
    default:
      return s.state;
  }
}

export interface PollOptions {
  intervalMs?: number;
  maxErrors?: number;
  signal?: AbortSignal;
  /** Injected for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Read a document's ingest status until it is terminal, reporting every read.
 *
 * Resolves with the terminal status, or null when no document carries the id (the
 * kernel answered found=false) or the poll was aborted. A read error is retried; after
 * `maxErrors` consecutive failures the poll rejects with the last error, so the caller
 * can say the progress could not be read rather than show a stale state forever.
 */
export async function pollIngestStatus(
  documentId: string,
  read: (documentId: string) => Promise<IngestStatusOp | null>,
  onUpdate: (s: IngestStatusOp) => void,
  opts: PollOptions = {},
): Promise<IngestStatusOp | null> {
  const intervalMs = opts.intervalMs ?? INGEST_POLL_MS;
  const maxErrors = opts.maxErrors ?? INGEST_POLL_MAX_ERRORS;
  const sleep = opts.sleep ?? defaultSleep;
  let errors = 0;
  for (;;) {
    if (opts.signal?.aborted) return null;
    let s: IngestStatusOp | null;
    try {
      s = await read(documentId);
      errors = 0;
    } catch (err) {
      errors++;
      if (errors >= maxErrors) throw err;
      await sleep(intervalMs);
      continue;
    }
    if (opts.signal?.aborted) return null;
    if (s === null) return null;
    onUpdate(s);
    if (isTerminalIngest(s.state)) return s;
    await sleep(intervalMs);
  }
}
