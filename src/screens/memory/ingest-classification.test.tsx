import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryPage } from './MemoryPage';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, WriteCeiling } from '@/ipc/types';

// ENG-2161 (owner decision 2026-11-19, C): when the operator's write ceiling holds a
// closed label, the kernel refuses an unlabelled upload — so the upload form asks for
// a classification, chosen from the ceiling, BEFORE anything is sent.

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

vi.mock('@/ipc', () => ({
  ipc: {
    ingestMemory: vi.fn().mockResolvedValue(['doc-1', false]),
    ingestFile: vi.fn().mockResolvedValue(['doc-1', false]),
    statFile: vi.fn().mockResolvedValue({ name: 'board.pdf', size: 1024 }),
    matchUpload: vi.fn().mockResolvedValue(null),
    queryMemory: vi.fn().mockResolvedValue({ hits: [], policy_note: '' }),
    listTags: vi.fn().mockResolvedValue([
      { tag: 'scope-public', closed: false },
      { tag: 'scope-docs', closed: true },
      { tag: 'scope-hr', closed: true },
      { tag: 'scope-legal', closed: true },
    ]),
    listClassificationTags: vi.fn().mockResolvedValue([]),
    getWriteCeiling: vi.fn(),
    answerMemory: vi.fn().mockResolvedValue({ status: 'answer', answer: '', citations: [] }),
  },
  onKernelToken: vi.fn().mockResolvedValue(() => {}),
  onKernelState: vi.fn().mockResolvedValue(() => {}),
}));

import { ipc } from '@/ipc';

function makeState(overrides: Partial<StateOfRecord> = {}): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0057',
    capabilities: ['memory-ingest-binary', 'access-policy'],
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
    ...overrides,
  };
}

const closedCeiling: WriteCeiling = {
  writer: 'admin',
  tags: [
    { tag: 'scope-public', closed: false },
    { tag: 'scope-docs', closed: true },
    { tag: 'scope-hr', closed: true },
  ],
  classification_required: true,
};

describe('MemoryPage — classification before upload (ENG-2161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.ingestMemory).mockResolvedValue(['doc-1', false]);
    projectionStore.getState().reset();
  });

  it('asks for a classification from the ceiling and sends nothing until one is chosen', async () => {
    vi.mocked(ipc.getWriteCeiling).mockResolvedValue(closedCeiling);
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    await waitFor(() => expect(screen.getByText(/Choose a classification/)).toBeTruthy());
    // No "anyone" option: an unlabelled upload would be refused.
    expect(screen.queryByLabelText('Anyone, anywhere')).toBeNull();
    expect(screen.getByText(/scope-docs, scope-hr/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'board minutes' } });
    const ingest = screen.getByRole('button', { name: 'Ingest text' }) as HTMLButtonElement;
    expect(ingest.disabled).toBe(true);
    fireEvent.click(ingest);
    expect(ipc.ingestMemory).not.toHaveBeenCalled();

    // Only ceiling labels are offered — scope-legal is in the vocabulary, not the ceiling.
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ scope-public/ })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /\+ scope-legal/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /\+ scope-public/ }));
    expect((screen.getByRole('button', { name: 'Ingest text' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));
    await waitFor(() => {
      expect(ipc.ingestMemory).toHaveBeenCalledWith(expect.objectContaining({ text: 'board minutes', tags: ['scope-public'] }));
    });
  });

  it('keeps "Anyone, anywhere" when the ceiling holds only open labels', async () => {
    vi.mocked(ipc.getWriteCeiling).mockResolvedValue({
      writer: 'admin',
      tags: [{ tag: 'scope-public', closed: false }],
      classification_required: false,
    });
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    await waitFor(() => expect(ipc.getWriteCeiling).toHaveBeenCalled());
    expect(screen.getByLabelText('Anyone, anywhere')).toBeTruthy();
    expect(screen.queryByText(/Choose a classification/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingest text' }));
    await waitFor(() => expect(ipc.ingestMemory).toHaveBeenCalledWith(expect.objectContaining({ tags: [] })));
  });

  it('falls back to the old form when the ceiling cannot be read', async () => {
    vi.mocked(ipc.getWriteCeiling).mockRejectedValue(new Error('Unimplemented'));
    projectionStore.getState().hydrate(makeState());
    render(<MemoryPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    await waitFor(() => expect(ipc.getWriteCeiling).toHaveBeenCalled());
    expect(screen.getByLabelText('Anyone, anywhere')).toBeTruthy();
  });

  it('does not ask a Viewer’s kernel for a ceiling', () => {
    projectionStore.getState().hydrate(makeState({ role: 'viewer' }));
    render(<MemoryPage />);
    expect(ipc.getWriteCeiling).not.toHaveBeenCalled();
  });
});
