import { createStore, type StoreApi } from 'zustand/vanilla';
import type { TokenChunk } from '@/ipc/types';

/**
 * Live step output (ADR-0139 amendment 2026-11-06, capability `step-output-stream`).
 *
 * The kernel streams every step's output on the live-only token lane: gateway
 * deltas and agent-pushed `EmitStepOutput` chunks, each stamped with the step's
 * lease, the task session, the agent, a kind (text | progress | status), a
 * per-lease `chunk_seq` starting at 1, and a `final` flag. Nothing is replayed —
 * a reconnect starts from whatever arrives next — so this is a VIEW of what is
 * happening, never a record.
 *
 * Assembly rules, all enforced by `foldChunk`:
 *  - one stream per lease (`lease_id`, falling back to the historical
 *    `session_id`, which has always carried the lease);
 *  - chunks are ordered by `chunk_seq`, not by arrival, and a re-delivered seq is
 *    dropped (idempotent);
 *  - `text` chunks concatenate; `progress` and `status` are status lines, so only
 *    the highest-seq one of each is kept;
 *  - a hole in the sequence is COUNTED (`missing`), not hidden: a stream that
 *    skipped chunk 4 must not read as complete;
 *  - a chunk from an older kernel has no `chunk_seq`; it is ordered by arrival and
 *    the stream is marked `ordered: false`.
 *
 * Subagent runs (ADR-0139 D12) bind a child lease to the PARENT's session and
 * step index, and TokenChunkOp carries no parent lease, so nesting is inferred:
 * the first lease seen on a step is its run, later leases on the same step are
 * shown nested beneath it as additional runs. That is stated in the UI, not
 * passed off as fact (RPC gap: TokenChunkOp.parent_lease_id).
 */

export type ChunkKind = 'text' | 'progress' | 'status';

export interface LeaseStream {
  lease_id: string;
  task_session_id: string;
  step_index: number;
  agent_id: string;
  source: string;
  /** Concatenated `text` chunks in seq order. */
  text: string;
  /** Latest progress / status line by seq, '' when none. */
  progress: string;
  status: string;
  final: boolean;
  /** Highest seq seen. */
  last_seq: number;
  /** Seqs between 1 and last_seq that never arrived. */
  missing: number;
  /** False when the producer sent no chunk_seq (older kernel): arrival order. */
  ordered: boolean;
  /** Arrival order of the stream's first chunk (for root/child inference). */
  first_seen: number;
  /** Truncated from the front to stay inside TEXT_CAP. */
  truncated: boolean;
  /** Internal: seq → chunk, kept to re-assemble out-of-order arrivals. */
  chunks: Record<number, { kind: ChunkKind; text: string }>;
}

export interface StepOutputState {
  leases: Record<string, LeaseStream>;
  /** Monotonic arrival counter (orders streams and seq-less chunks). */
  arrivals: number;
}

/** Per-stream text cap. A runaway producer must not grow the webview without bound. */
export const TEXT_CAP = 200_000;
/** How many streams are kept; the oldest FINISHED ones are evicted first. */
export const LEASE_CAP = 400;

export const EMPTY_STEP_OUTPUT: StepOutputState = { leases: {}, arrivals: 0 };

function kindOf(k: string | undefined): ChunkKind {
  return k === 'progress' || k === 'status' ? k : 'text';
}

function assemble(s: LeaseStream): LeaseStream {
  const seqs = Object.keys(s.chunks)
    .map(Number)
    .sort((a, b) => a - b);
  let text = '';
  let progress = '';
  let status = '';
  for (const seq of seqs) {
    const c = s.chunks[seq];
    if (c.kind === 'text') text += c.text;
    else if (c.kind === 'progress') progress = c.text;
    else status = c.text;
  }
  let truncated = s.truncated;
  if (text.length > TEXT_CAP) {
    text = text.slice(text.length - TEXT_CAP);
    truncated = true;
  }
  const last = seqs.length ? seqs[seqs.length - 1] : 0;
  const missing = s.ordered ? Math.max(0, last - seqs.length) : 0;
  return { ...s, text, progress, status, last_seq: last, missing, truncated };
}

/** Fold one chunk. Pure: returns the same object when the chunk is a duplicate. */
export function foldChunk(state: StepOutputState, chunk: TokenChunk): StepOutputState {
  const lease = chunk.lease_id || chunk.session_id;
  if (!lease) return state;
  const arrivals = state.arrivals + 1;
  const hasSeq = typeof chunk.chunk_seq === 'number' && chunk.chunk_seq > 0;
  const prev = state.leases[lease];
  // A stream without seqs is keyed by arrival; offset so it never collides with
  // a real seq if a producer starts sending them mid-stream.
  const seq = hasSeq ? (chunk.chunk_seq as number) : 1_000_000_000 + arrivals;

  if (prev && prev.chunks[seq]) {
    // Re-delivery. `final` may still be news.
    if (chunk.final && !prev.final) {
      return { ...state, leases: { ...state.leases, [lease]: { ...prev, final: true } } };
    }
    return state;
  }

  const base: LeaseStream = prev ?? {
    lease_id: lease,
    task_session_id: chunk.task_session_id ?? '',
    step_index: chunk.step_index,
    agent_id: chunk.agent_id ?? '',
    source: chunk.source ?? '',
    text: '',
    progress: '',
    status: '',
    final: false,
    last_seq: 0,
    missing: 0,
    ordered: hasSeq,
    first_seen: arrivals,
    truncated: false,
    chunks: {},
  };

  const next = assemble({
    ...base,
    task_session_id: base.task_session_id || chunk.task_session_id || '',
    agent_id: base.agent_id || chunk.agent_id || '',
    source: chunk.source || base.source,
    ordered: base.ordered && hasSeq,
    final: base.final || Boolean(chunk.final),
    chunks: { ...base.chunks, [seq]: { kind: kindOf(chunk.kind), text: chunk.text ?? '' } },
  });

  return evict({ leases: { ...state.leases, [lease]: next }, arrivals });
}

function evict(state: StepOutputState): StepOutputState {
  const ids = Object.keys(state.leases);
  if (ids.length <= LEASE_CAP) return state;
  const byAge = ids
    .map((id) => state.leases[id])
    .sort((a, b) => Number(b.final) - Number(a.final) || a.first_seen - b.first_seen);
  const leases = { ...state.leases };
  for (const s of byAge.slice(0, ids.length - LEASE_CAP)) delete leases[s.lease_id];
  return { ...state, leases };
}

export interface StepRuns {
  step_index: number;
  /** The step's own run: the first lease seen on it. */
  root: LeaseStream;
  /** Later leases on the same step — subagents or retries (inferred). */
  children: LeaseStream[];
}

/**
 * A task's live output grouped by step, steps ascending. Leases that are not
 * step-scoped (`step_index` -1) are grouped under -1.
 */
export function runsForSession(state: StepOutputState, taskSessionId: string): StepRuns[] {
  if (!taskSessionId) return [];
  const bySteps = new Map<number, LeaseStream[]>();
  for (const s of Object.values(state.leases)) {
    if (s.task_session_id !== taskSessionId) continue;
    const list = bySteps.get(s.step_index) ?? [];
    list.push(s);
    bySteps.set(s.step_index, list);
  }
  return [...bySteps.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step_index, list]) => {
      const sorted = [...list].sort((a, b) => a.first_seen - b.first_seen);
      return { step_index, root: sorted[0], children: sorted.slice(1) };
    });
}

// ── The store: one subscription, batched ───────────────────────────────────

export interface StepOutputStore {
  output: StepOutputState;
  ingest: (chunks: TokenChunk[]) => void;
  reset: () => void;
}

export const stepOutputStore: StoreApi<StepOutputStore> = createStore<StepOutputStore>((set) => ({
  output: EMPTY_STEP_OUTPUT,
  ingest: (chunks) =>
    set((s) => ({ output: chunks.reduce(foldChunk, s.output) })),
  reset: () => set({ output: EMPTY_STEP_OUTPUT }),
}));

/**
 * Batch chunks at the core→webview seam (~100 ms), per AGENTS.md: tokens are a
 * high-frequency class, and re-rendering a transcript per delta is wasted work.
 */
export function createChunkBatcher(
  flush: (chunks: TokenChunk[]) => void,
  intervalMs = 100,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
): (chunk: TokenChunk) => void {
  let buffer: TokenChunk[] = [];
  let pending = false;
  return (chunk) => {
    buffer.push(chunk);
    if (pending) return;
    pending = true;
    schedule(() => {
      const out = buffer;
      buffer = [];
      pending = false;
      flush(out);
    }, intervalMs);
  };
}
