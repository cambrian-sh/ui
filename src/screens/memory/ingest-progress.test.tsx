import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, act, waitFor, fireEvent } from '@testing-library/react';
import type { IngestStatusOp, StateOfRecord } from '@/ipc/types';
import { describeIngest, isTerminalIngest, pollIngestStatus } from './ingestProgress';
import { settled, useIngestQueue } from './useIngestQueue';
import { IngestQueue } from './IngestQueue';
import { MemoryDetail, ingestBadgeVariant } from './MemoryDetail';
import { MemoryPage } from './MemoryPage';
import { projectionStore } from '@/store/projection';
import type { MemoryDocument } from '@/design-system/components/cambrian/memory-list';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

vi.mock('@/ipc', () => ({
  ipc: {
    ingestMemory: vi.fn(),
    ingestFile: vi.fn(),
    getIngestStatus: vi.fn(),
    statFile: vi.fn(),
    matchUpload: vi.fn().mockResolvedValue(null),
    queryMemory: vi.fn().mockResolvedValue({ hits: [], policy_note: '' }),
    listTags: vi.fn().mockResolvedValue([]),
    listClassificationTags: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue({ documents: [], next_cursor: '', total_matching: 0 }),
    answerMemory: vi.fn(),
    setToolGrant: vi.fn(),
    getBlastRadiusPreview: vi.fn().mockResolvedValue({
      affected_agents: [],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    }),
  },
  onKernelToken: vi.fn().mockResolvedValue(() => {}),
  onKernelState: vi.fn().mockResolvedValue(() => {}),
}));

import { ipc } from '@/ipc';

function st(state: string, embedded = 0, total = 0, error = '', document_id = 'doc-big'): IngestStatusOp {
  return { document_id, state, chunks_total: total, chunks_embedded: embedded, error };
}

function makeState(capabilities: string[]): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0111',
    capabilities,
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    scope: {},
    watch_configs: [],
    memory_written: [],
  } as StateOfRecord;
}

const noSleep = () => Promise.resolve();

describe('ingest progress — states and wording', () => {
  it('only accepted and embedding are in flight; an unknown state is terminal', () => {
    expect(isTerminalIngest('accepted')).toBe(false);
    expect(isTerminalIngest('embedding')).toBe(false);
    expect(isTerminalIngest('searchable')).toBe(true);
    expect(isTerminalIngest('failed')).toBe(true);
    expect(isTerminalIngest('reindexing')).toBe(true);
  });

  it('reads each state in the kernel words', () => {
    expect(describeIngest(st('accepted'))).toBe('accepted · embedding in the background');
    expect(describeIngest(st('embedding', 128, 300))).toBe('embedding 128 of 300 chunks');
    expect(describeIngest(st('embedding'))).toBe('embedding…');
    expect(describeIngest(st('embedding', 10, 300, 'embedder 503'))).toBe(
      'embedding 10 of 300 chunks · retrying after: embedder 503',
    );
    expect(describeIngest(st('searchable', 300, 300))).toBe('searchable');
    expect(describeIngest(st('failed', 10, 300, 'embedder down'))).toBe('failed: embedder down');
    expect(describeIngest(st('failed'))).toBe('failed: the kernel reported no cause');
  });

  it('badge variants: live in flight, err on failure, neutral when searchable', () => {
    expect(ingestBadgeVariant('embedding')).toBe('live');
    expect(ingestBadgeVariant('failed')).toBe('err');
    expect(ingestBadgeVariant('searchable')).toBe('neutral');
  });
});

describe('pollIngestStatus', () => {
  it('reports every read in order and stops at the terminal state', async () => {
    const seq = [st('accepted'), st('embedding', 100, 300), st('embedding', 300, 300), st('searchable', 300, 300)];
    const read = vi.fn(async () => seq.shift() ?? null);
    const seen: string[] = [];
    const end = await pollIngestStatus('doc-big', read, (s) => seen.push(describeIngest(s)), { sleep: noSleep });
    expect(seen).toEqual([
      'accepted · embedding in the background',
      'embedding 100 of 300 chunks',
      'embedding 300 of 300 chunks',
      'searchable',
    ]);
    expect(end?.state).toBe('searchable');
    expect(read).toHaveBeenCalledTimes(4);
    expect(read).toHaveBeenCalledWith('doc-big');
  });

  it('stops on failed with the cause', async () => {
    const seq = [st('embedding', 5, 300), st('failed', 5, 300, 'embedder down')];
    const end = await pollIngestStatus('doc-big', async () => seq.shift()!, () => {}, { sleep: noSleep });
    expect(end).toEqual(st('failed', 5, 300, 'embedder down'));
  });

  it('resolves null for an id no document carries', async () => {
    const onUpdate = vi.fn();
    expect(await pollIngestStatus('nope', async () => null, onUpdate, { sleep: noSleep })).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('retries a failed read, and gives up loudly after maxErrors in a row', async () => {
    let n = 0;
    const flaky = async () => {
      n++;
      if (n === 1) throw new Error('unavailable');
      return st('searchable');
    };
    expect((await pollIngestStatus('d', flaky, () => {}, { sleep: noSleep }))?.state).toBe('searchable');

    const down = vi.fn(async () => {
      throw new Error('kernel unreachable');
    });
    await expect(pollIngestStatus('d', down, () => {}, { sleep: noSleep, maxErrors: 3 })).rejects.toThrow(
      'kernel unreachable',
    );
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    const read = vi.fn(async () => {
      ctl.abort();
      return st('embedding', 1, 300);
    });
    const onUpdate = vi.fn();
    expect(await pollIngestStatus('d', read, onUpdate, { sleep: noSleep, signal: ctl.signal })).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('settled — capability-gated', () => {
  it('without ingest-status the row is indexed as before contract 0111', () => {
    expect(settled(['doc-1', false, '', 1, st('accepted', 0, 300)], false).status).toBe('indexed');
    expect(settled(['doc-1', false], false).status).toBe('indexed');
  });

  it('with ingest-status the row takes the kernel state', () => {
    expect(settled(['doc-1', false, '', 1, st('accepted', 0, 300)], true).status).toBe('accepted');
    expect(settled(['doc-1', false, '', 1, st('searchable')], true).status).toBe('searchable');
    const failed = settled(['doc-1', false, '', 1, st('failed', 0, 0, 'no chunks')], true);
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('no chunks');
    // A deduped replay carries no status: settled as indexed.
    expect(settled(['doc-1', true, '', 0, null], true).status).toBe('indexed');
  });
});

describe('useIngestQueue — follows a background embed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepted → embedding n of total → searchable, in order, then stops polling', async () => {
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-big', false, '', 1, st('accepted', 0, 300)]);
    // Each read waits until the test releases it, so every state can be observed.
    const pending: Array<(s: IngestStatusOp) => void> = [];
    const readStatus = vi.fn(() => new Promise<IngestStatusOp>((resolve) => pending.push(resolve)));
    const { result } = renderHook(() =>
      useIngestQueue([], { ingestStatus: true, readStatus, pollIntervalMs: 1 }),
    );
    const shown = () => {
      const r = result.current.rows[0];
      return r.ingest ? describeIngest(r.ingest) : r.status;
    };
    const release = async (s: IngestStatusOp) => {
      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      await act(async () => {
        pending.shift()!(s);
      });
    };
    await act(async () => {
      await result.current.enqueue('big.txt', {} as never);
    });
    expect(result.current.rows[0].status).toBe('accepted');
    expect(shown()).toBe('accepted · embedding in the background');

    await release(st('embedding', 128, 300));
    await waitFor(() => expect(shown()).toBe('embedding 128 of 300 chunks'));
    expect(result.current.rows[0].status).toBe('embedding');

    await release(st('embedding', 300, 300));
    await waitFor(() => expect(shown()).toBe('embedding 300 of 300 chunks'));

    await release(st('searchable', 300, 300));
    await waitFor(() => expect(result.current.rows[0].status).toBe('searchable'));

    // Terminal: no further read is asked for.
    const calls = readStatus.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(readStatus.mock.calls.length).toBe(calls);
    expect(readStatus).toHaveBeenCalledWith('doc-big');
  });

  it('a background embed that fails shows the kernel cause', async () => {
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-big', false, '', 1, st('accepted', 0, 300)]);
    const readStatus = vi.fn(async () => st('failed', 12, 300, 'embedder down'));
    const { result } = renderHook(() =>
      useIngestQueue([], { ingestStatus: true, readStatus, pollIntervalMs: 1 }),
    );
    await act(async () => {
      await result.current.enqueue('big.txt', {} as never);
    });
    await waitFor(() => expect(result.current.rows[0].status).toBe('failed'));
    expect(result.current.rows[0].error).toBe('embedder down');
  });

  it('without the capability nothing is polled and the row is indexed', async () => {
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-big', false, '', 1, st('accepted', 0, 300)]);
    const readStatus = vi.fn();
    const { result } = renderHook(() => useIngestQueue([], { readStatus }));
    await act(async () => {
      await result.current.enqueue('big.txt', {} as never);
    });
    expect(result.current.rows[0].status).toBe('indexed');
    expect(readStatus).not.toHaveBeenCalled();
  });
});

describe('IngestQueue — renders the states', () => {
  const base = {
    local_id: 'r', label: 'big.txt', doc_id: 'doc-big', deduped: false, duplicate_of: null,
    version: null, error: null, chunks: null,
  };
  it('shows accepted, embedding n of total, searchable and failed with the error', () => {
    render(
      <IngestQueue
        rows={[
          { ...base, local_id: 'a', status: 'accepted', ingest: st('accepted', 0, 300) },
          { ...base, local_id: 'b', status: 'embedding', ingest: st('embedding', 128, 300) },
          { ...base, local_id: 'c', status: 'searchable', ingest: st('searchable', 300, 300) },
          { ...base, local_id: 'd', status: 'failed', error: 'embedder down', ingest: st('failed', 3, 300, 'embedder down') },
        ]}
      />,
    );
    expect(screen.getByText('accepted · embedding in the background')).toBeInTheDocument();
    expect(screen.getByText('embedding 128 of 300 chunks')).toBeInTheDocument();
    expect(screen.getByText('searchable')).toBeInTheDocument();
    expect(screen.getByText('embedder down')).toBeInTheDocument();
  });
});

describe('MemoryPage — upload progress, gated on ingest-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('with ingest-status an accepted upload shows its state, then the polled one', async () => {
    projectionStore.getState().hydrate(makeState(['memory-ingest-binary', 'ingest-status']));
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-big', false, '', 1, st('accepted', 0, 300)]);
    // The first read is held, so the response's own state is what the row shows first.
    let releaseRead: (s: IngestStatusOp) => void = () => {};
    vi.mocked(ipc.getIngestStatus).mockImplementation(
      () => new Promise<IngestStatusOp>((resolve) => (releaseRead = resolve)),
    );
    render(<MemoryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'a long document' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));
    expect(await screen.findByText('accepted · embedding in the background')).toBeInTheDocument();
    await act(async () => releaseRead(st('embedding', 42, 300)));
    expect(await screen.findByText('embedding 42 of 300 chunks')).toBeInTheDocument();
    expect(ipc.getIngestStatus).toHaveBeenCalledWith('doc-big');
  });

  it('without ingest-status the upload reads indexed and the kernel is never polled', async () => {
    projectionStore.getState().hydrate(makeState(['memory-ingest-binary']));
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-1', false]);
    render(<MemoryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'small' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));
    expect(await screen.findByText('indexed')).toBeInTheDocument();
    expect(ipc.getIngestStatus).not.toHaveBeenCalled();
  });
});

describe('MemoryDetail — ingest state badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  function doc(id: string): MemoryDocument {
    return {
      doc_id: id,
      doc_type: 'mnemonic_fact',
      scope_tags: [],
      activation_strength: 0.9,
      session_id: '',
      seen_at: new Date().toISOString(),
      content_preview: 'x',
    };
  }

  it('shows the state with the kernel detail when ingest-status is advertised', async () => {
    projectionStore.getState().hydrate(makeState(['ingest-status']));
    vi.mocked(ipc.getIngestStatus).mockResolvedValue(st('embedding', 5, 10, '', 'doc-detail-1'));
    render(<MemoryDetail doc={doc('doc-detail-1')} />);
    expect(await screen.findByLabelText('Ingest state: embedding')).toBeInTheDocument();
    expect(screen.getByText('embedding 5 of 10 chunks')).toBeInTheDocument();
  });

  it('a failed document shows the cause', async () => {
    projectionStore.getState().hydrate(makeState(['ingest-status']));
    vi.mocked(ipc.getIngestStatus).mockResolvedValue(st('failed', 0, 10, 'embedder down', 'doc-detail-2'));
    render(<MemoryDetail doc={doc('doc-detail-2')} />);
    expect(await screen.findByLabelText('Ingest state: failed')).toBeInTheDocument();
    expect(screen.getByText('failed: embedder down')).toBeInTheDocument();
  });

  it('without the capability there is no state row and no call', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<MemoryDetail doc={doc('doc-detail-3')} />);
    expect(screen.queryByText('State')).not.toBeInTheDocument();
    expect(ipc.getIngestStatus).not.toHaveBeenCalled();
  });
});
