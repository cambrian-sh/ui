import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryPage } from './MemoryPage';
import { SourceCard } from './SourceCard';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, MemoryHit, MemoryWrittenEvent } from '@/ipc/types';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@/ipc', () => ({
  ipc: {
    ingestMemory: vi.fn().mockResolvedValue(['doc-1', false]),
    ingestFile: vi.fn().mockResolvedValue(['doc-1', false]),
    statFile: vi.fn().mockResolvedValue({ name: 'murat.pdf', size: 5_202_359 }),
    queryMemory: vi.fn().mockResolvedValue([]),
    answerMemory: vi.fn().mockResolvedValue({ status: 'answer', answer: '', citations: [] }),
    createSession: vi.fn().mockResolvedValue({ session_id: 'ses-1' }),
    sendMessage: vi.fn().mockResolvedValue({ deduped: false }),
    setToolGrant: vi.fn().mockResolvedValue({ deduped: false }),
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
import { open } from '@tauri-apps/plugin-dialog';

function makeHit(overrides: Partial<MemoryHit> = {}): MemoryHit {
  return {
    doc_id: 'doc-1',
    summary: 'SHORT PREVIEW — never quotable',
    text: 'Two SEV-2 incidents were raised this week; both were closed within SLA.',
    section_path: 'Ops Review > 3.2 Incidents',
    score: 0.82,
    source: '2026-W29-ops-review.pdf',
    importance: 0.6,
    tags: ['ops'],
    ...overrides,
  };
}

function makeState(overrides: Partial<StateOfRecord> = {}): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0057',
    capabilities: ['memory-ingest-binary', 'memory-answer'],
    contract_skew: 0,
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
    memory_written: [],
    ...overrides,
  };
}

function writtenEvent(overrides: Partial<MemoryWrittenEvent> = {}): MemoryWrittenEvent {
  return {
    seq: 1,
    doc_id: 'doc-1',
    doc_type: 'episodic_memory',
    session_id: 'ses-1',
    source: 'notes.md',
    summary: 'a summary',
    written_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('SourceCard', () => {
  it('quotes text, never summary', () => {
    render(<SourceCard hit={makeHit()} index={1} />);
    expect(screen.getByText(/Two SEV-2 incidents were raised/)).toBeInTheDocument();
    expect(screen.queryByText(/never quotable/)).not.toBeInTheDocument();
  });

  it('renders the section breadcrumb and score', () => {
    render(<SourceCard hit={makeHit()} index={1} />);
    expect(screen.getByLabelText('Section path')).toHaveTextContent('Ops Review › 3.2 Incidents');
    expect(screen.getByLabelText('score 0.82')).toBeInTheDocument();
  });

  it('hides the breadcrumb for a flat document', () => {
    render(<SourceCard hit={makeHit({ section_path: '' })} index={1} />);
    expect(screen.queryByLabelText('Section path')).not.toBeInTheDocument();
  });

  it('expands the passage on click', () => {
    render(<SourceCard hit={makeHit()} index={1} />);
    const toggle = screen.getByRole('button', { name: 'Expand passage' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Collapse passage' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('MemoryPage — ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-1', false]);
    vi.mocked(ipc.queryMemory).mockResolvedValue([]);
    projectionStore.getState().reset();
  });

  it('sends the text lane with content empty', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'hello corpus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(ipc.ingestMemory).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello corpus', content: [], filename: '' }),
      );
    });
  });

  it('defaults scope to anyone, sending no tags', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(ipc.ingestMemory).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
    });
  });

  it('sends tags once scope is restricted', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.click(screen.getByLabelText('Restrict…'));
    fireEvent.change(screen.getByLabelText('Add scope tag'), { target: { value: 'finance' } });
    fireEvent.keyDown(screen.getByLabelText('Add scope tag'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(ipc.ingestMemory).toHaveBeenCalledWith(expect.objectContaining({ tags: ['finance'] }));
    });
  });

  it('sends a non-empty reason by default', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(ipc.ingestMemory).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'operator upload' }),
      );
    });
  });

  it('hides file upload when the kernel lacks memory-ingest-binary', () => {
    projectionStore.getState().hydrate(makeState({ capabilities: [] }));
    render(<MemoryPage />);

    expect(screen.queryByRole('button', { name: 'or browse' })).not.toBeInTheDocument();
    expect(screen.getByText(/File upload is hidden/)).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
  });

  it('disables ingest for a Viewer', () => {
    projectionStore.getState().hydrate(makeState({ role: 'viewer' }));
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    expect(screen.getByLabelText('Text')).toBeDisabled();
  });

  it('marks a row indexed once the synchronous ingest resolves', async () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    // IngestMemory is synchronous kernel-side, so the promise resolving is the
    // completion signal — no MemoryWrittenOp match required (their doc_ids differ).
    await waitFor(() => {
      expect(screen.getByText('indexed')).toBeInTheDocument();
    });
  });

  it('appends a chunk count only when the feed reports a matchable doc_id', async () => {
    vi.mocked(ipc.ingestMemory).mockResolvedValueOnce(['source_doc:x', false]);
    projectionStore.getState().hydrate(makeState());
    const { rerender } = render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));
    await waitFor(() => expect(screen.getByText('indexed')).toBeInTheDocument());

    // If a MemoryWrittenOp DOES carry the same id (future kernel), show the count.
    projectionStore.getState().fold(
      makeState({
        memory_written: [
          writtenEvent({ seq: 1, doc_id: 'source_doc:x' }),
          writtenEvent({ seq: 2, doc_id: 'source_doc:x' }),
        ],
      }),
    );
    rerender(<MemoryPage />);

    await waitFor(() => {
      expect(screen.getByText('indexed · 2 chunks')).toBeInTheDocument();
    });
  });

  it('stages a picked file without sending it, and never reads its bytes', async () => {
    vi.mocked(open).mockResolvedValue('C:/Users/afsin/Downloads/murat.pdf');
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose files to ingest' }));

    await waitFor(() => {
      expect(screen.getByText('Ready to ingest (1)')).toBeInTheDocument();
    });
    // The point of the native path: the bytes never enter the webview, and nothing
    // is sent until the operator ingests (context/scope are set after picking).
    expect(ipc.ingestFile).not.toHaveBeenCalled();
    expect(ipc.ingestMemory).not.toHaveBeenCalled();
  });

  it('ingests by PATH with the context entered after staging', async () => {
    vi.mocked(open).mockResolvedValue('C:/Users/afsin/Downloads/murat.pdf');
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose files to ingest' }));
    await screen.findByText('Ready to ingest (1)');

    fireEvent.change(screen.getByLabelText('Context'), {
      target: { value: 'Q3 board pack; provisional' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ingest 1 file with this context/ }));

    await waitFor(() => {
      expect(ipc.ingestFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'C:/Users/afsin/Downloads/murat.pdf',
          context: 'Q3 board pack; provisional',
        }),
      );
    });
    // The byte lane is never used for files anymore.
    expect(ipc.ingestMemory).not.toHaveBeenCalled();
  });

  it('surfaces the kernel message when ingest fails', async () => {
    // Tauri rejects with a plain string, not an Error.
    vi.mocked(ipc.ingestMemory).mockRejectedValueOnce(
      'invalid args `contentType` for command `op_ingest_memory`',
    );
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(screen.getByText(/invalid args `contentType`/)).toBeInTheDocument();
    });
  });

  it('surfaces an ingest failure on the row', async () => {
    vi.mocked(ipc.ingestMemory).mockRejectedValueOnce(new Error('InvalidArgument'));
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));

    await waitFor(() => {
      expect(screen.getByText('InvalidArgument')).toBeInTheDocument();
    });
  });
});

describe('MemoryPage — ask (ADR-0081 grounded answer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('renders a grounded answer with clickable cited passages', async () => {
    vi.mocked(ipc.answerMemory).mockResolvedValue({
      status: 'answer',
      answer: 'The little prince came from asteroid B612 [1]. He met a geographer [2].',
      citations: [
        {
          marker: 1,
          doc_id: 'd1',
          text: 'the planet from which the little prince came is the asteroid known as B612.',
          section_path: '',
          source: 'littleprince.pdf',
          score: 0.9,
          importance: 0.5,
          tags: [],
        },
        {
          marker: 2,
          doc_id: 'd2',
          text: '"I am a geographer," said the old gentleman.',
          section_path: '',
          source: 'littleprince.pdf',
          score: 0.8,
          importance: 0.5,
          tags: [],
        },
      ],
    });
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    const input = screen.getByPlaceholderText('Ask a question about the corpus…');
    fireEvent.change(input, { target: { value: 'who is the little prince?' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The answer prose renders without the raw [n] markers.
    const cited = await screen.findByRole('button', { name: /Cited passage; sources 1/ });
    expect(cited).toHaveTextContent('The little prince came from asteroid B612');
    expect(cited.textContent).not.toContain('[1]');

    // Clicking a cited passage reveals its exact source chunk.
    fireEvent.click(cited);
    await waitFor(() => {
      expect(screen.getByText(/the asteroid known as B612/)).toBeInTheDocument();
    });
    expect(ipc.answerMemory).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'who is the little prince?' }),
    );
  });

  it('shows abstention as such, never as an empty answer', async () => {
    vi.mocked(ipc.answerMemory).mockResolvedValue({
      status: 'abstention',
      answer: 'not found in memory',
      citations: [],
    });
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    const input = screen.getByPlaceholderText('Ask a question about the corpus…');
    fireEvent.change(input, { target: { value: 'unknown thing' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/does not answer this question/)).toBeInTheDocument();
    });
  });

  it('hides the answer lane when the kernel lacks memory-answer', () => {
    projectionStore.getState().hydrate(makeState({ capabilities: ['memory-ingest-binary'] }));
    render(<MemoryPage />);

    expect(screen.getByText('Answering not available')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a question about the corpus…')).toBeDisabled();
  });
});

describe('MemoryPage — inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.queryMemory).mockResolvedValue([]);
    projectionStore.getState().reset();
  });

  it('lists one row per ingested document, not per chunk', () => {
    projectionStore.getState().hydrate(
      makeState({
        memory_written: [
          writtenEvent({ seq: 1, doc_id: 'doc-a' }),
          writtenEvent({ seq: 2, doc_id: 'doc-a' }),
          writtenEvent({ seq: 3, doc_id: 'doc-b' }),
        ],
      }),
    );
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'inspect' }));
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
  });

  it('is honest that browse needs ListMemory', () => {
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'inspect' }));
    expect(screen.getByText(/Full browse needs a ListMemory RPC/)).toBeInTheDocument();
  });
});

describe('MemoryPage — a11y', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.queryMemory).mockResolvedValue([]);
    projectionStore.getState().reset();
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState());
    const { container } = render(<MemoryPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
