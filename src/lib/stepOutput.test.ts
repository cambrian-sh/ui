import { describe, expect, it } from 'vitest';
import type { TokenChunk } from '@/ipc/types';
import {
  EMPTY_STEP_OUTPUT,
  TEXT_CAP,
  createChunkBatcher,
  foldChunk,
  runsForSession,
  type StepOutputState,
} from './stepOutput';

function chunk(o: Partial<TokenChunk>): TokenChunk {
  return {
    session_id: o.lease_id ?? 'L1',
    step_index: 0,
    text: '',
    lease_id: 'L1',
    task_session_id: 'T1',
    agent_id: 'a',
    kind: 'text',
    source: 'gateway',
    ...o,
  };
}

const fold = (chunks: TokenChunk[], s: StepOutputState = EMPTY_STEP_OUTPUT) => chunks.reduce(foldChunk, s);

describe('step output assembly', () => {
  it('orders text by chunk_seq, not arrival', () => {
    const s = fold([
      chunk({ chunk_seq: 2, text: 'world' }),
      chunk({ chunk_seq: 1, text: 'hello ' }),
    ]);
    expect(s.leases.L1.text).toBe('hello world');
    expect(s.leases.L1.missing).toBe(0);
  });

  it('drops a re-delivered seq', () => {
    const once = fold([chunk({ chunk_seq: 1, text: 'a' })]);
    const twice = foldChunk(once, chunk({ chunk_seq: 1, text: 'a' }));
    expect(twice).toBe(once);
    expect(twice.leases.L1.text).toBe('a');
  });

  it('counts holes instead of hiding them', () => {
    const s = fold([chunk({ chunk_seq: 1, text: 'a' }), chunk({ chunk_seq: 4, text: 'd' })]);
    expect(s.leases.L1.missing).toBe(2);
    expect(s.leases.L1.last_seq).toBe(4);
  });

  it('keeps only the latest progress and status lines', () => {
    const s = fold([
      chunk({ chunk_seq: 1, kind: 'progress', text: 'searching' }),
      chunk({ chunk_seq: 3, kind: 'progress', text: 'reading 2 of 3' }),
      chunk({ chunk_seq: 2, kind: 'status', text: 'tool: web_fetch' }),
      chunk({ chunk_seq: 4, text: 'answer' }),
    ]);
    expect(s.leases.L1.progress).toBe('reading 2 of 3');
    expect(s.leases.L1.status).toBe('tool: web_fetch');
    expect(s.leases.L1.text).toBe('answer');
  });

  it('marks final, including on a re-delivered final chunk', () => {
    const s = fold([chunk({ chunk_seq: 1, text: 'x' })]);
    const f = foldChunk(s, chunk({ chunk_seq: 1, text: 'x', final: true }));
    expect(f.leases.L1.final).toBe(true);
  });

  it('accepts seq-less chunks from an older kernel in arrival order', () => {
    const s = fold([
      { session_id: 'L9', step_index: 1, text: 'a' },
      { session_id: 'L9', step_index: 1, text: 'b' },
    ]);
    expect(s.leases.L9.text).toBe('ab');
    expect(s.leases.L9.ordered).toBe(false);
  });

  it('keeps leases apart and caps runaway text', () => {
    const big = 'x'.repeat(TEXT_CAP + 10);
    const s = fold([
      chunk({ chunk_seq: 1, text: big }),
      chunk({ lease_id: 'L2', chunk_seq: 1, text: 'other' }),
    ]);
    expect(s.leases.L1.text.length).toBe(TEXT_CAP);
    expect(s.leases.L1.truncated).toBe(true);
    expect(s.leases.L2.text).toBe('other');
  });
});

describe('runsForSession', () => {
  it('groups by step and nests later leases on a step as children', () => {
    const s = fold([
      chunk({ lease_id: 'root', step_index: 1, chunk_seq: 1, text: 'r' }),
      chunk({ lease_id: 'child', step_index: 1, chunk_seq: 1, text: 'c' }),
      chunk({ lease_id: 's0', step_index: 0, chunk_seq: 1, text: 'z' }),
      chunk({ lease_id: 'elsewhere', task_session_id: 'T2', chunk_seq: 1, text: 'n' }),
    ]);
    const runs = runsForSession(s, 'T1');
    expect(runs.map((r) => r.step_index)).toEqual([0, 1]);
    expect(runs[1].root.lease_id).toBe('root');
    expect(runs[1].children.map((c) => c.lease_id)).toEqual(['child']);
  });
});

describe('createChunkBatcher', () => {
  it('flushes everything received in one window as one batch', () => {
    const scheduled: (() => void)[] = [];
    const batches: TokenChunk[][] = [];
    const push = createChunkBatcher((b) => batches.push(b), 100, (fn) => scheduled.push(fn));
    push(chunk({ chunk_seq: 1 }));
    push(chunk({ chunk_seq: 2 }));
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    push(chunk({ chunk_seq: 3 }));
    expect(scheduled).toHaveLength(2);
  });
});
