import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LabelsPane } from './LabelsPane';
import { ipc } from '@/ipc';
import type { Vocabulary } from './useVocabulary';

vi.mock('@/ipc', () => ({
  ipc: {
    queryMemory: vi.fn(),
    tagMemory: vi.fn(),
    listDocuments: vi.fn(),
  },
}));

const vocabulary: Vocabulary = {
  tags: ['finance', 'internal_only'],
  configured: true,
  closed: new Set(['internal_only']),
  loading: false,
  error: null,
};

function hit(id: string, tags: string[] = []) {
  return { doc_id: id, text: `body of ${id}`, tags };
}

async function searchFor(ids: string[]) {
  vi.mocked(ipc.queryMemory).mockResolvedValue({
    hits: ids.map((id) => hit(id)),
    policy_note: '',
  } as never);
  render(<LabelsPane vocabulary={vocabulary} role="operator" />);
  fireEvent.change(screen.getByLabelText('Find a document or memory'), {
    target: { value: 'quarterly' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(screen.getByText(`body of ${ids[0]}`)).toBeTruthy());
}

/**
 * Every result row carries its own picker offering the same vocabulary, so the bulk
 * term has to be chosen from the bulk picker specifically — an unscoped query would
 * match N+1 identical buttons.
 */
function pickBulkTag(tag: string) {
  const picker = screen.getByLabelText('Label to apply or remove — available');
  fireEvent.click(within(picker).getByRole('button', { name: new RegExp(`\\+ ${tag}`) }));
}

describe('LabelsPane — bulk labelling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies one label across the selection with a single reason', async () => {
    vi.mocked(ipc.tagMemory).mockResolvedValue(true as never);
    await searchFor(['doc-a', 'doc-b', 'doc-c']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select doc-a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select doc-c' }));

    pickBulkTag('finance');
    fireEvent.change(screen.getByLabelText('Reason for this bulk change'), {
      target: { value: 'Q3 audit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));

    await waitFor(() => expect(ipc.tagMemory).toHaveBeenCalledTimes(2));
    expect(ipc.tagMemory).toHaveBeenCalledWith('doc-a', 'finance', true, 'Q3 audit');
    expect(ipc.tagMemory).toHaveBeenCalledWith('doc-c', 'finance', true, 'Q3 audit');
    // doc-b was never selected.
    expect(ipc.tagMemory).not.toHaveBeenCalledWith('doc-b', 'finance', true, 'Q3 audit');
  });

  // The point of the count. TagMemory is per-document, so a bulk run is N independent
  // calls — atomic on each document, never across the selection. Reporting "done" after
  // a run where two documents failed would leave the operator believing a boundary
  // exists that does not.
  it('reports partial failure honestly rather than a blanket success', async () => {
    vi.mocked(ipc.tagMemory).mockImplementation((async (id: string) => {
      if (id === 'doc-b') throw new Error('PermissionDenied');
      return true;
    }) as never);
    await searchFor(['doc-a', 'doc-b', 'doc-c']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    pickBulkTag('finance');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 3' }));

    await waitFor(() =>
      expect(screen.getByText(/Labelled 2 of 3 with finance/)).toBeTruthy(),
    );
    // The failure is named, not summarised away.
    expect(screen.getByText(/PermissionDenied/)).toBeTruthy();
  });

  it('states the count even when every document succeeded', async () => {
    vi.mocked(ipc.tagMemory).mockResolvedValue(true as never);
    await searchFor(['doc-a', 'doc-b']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    pickBulkTag('finance');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));

    await waitFor(() => expect(screen.getByText(/Labelled 2 of 2 with finance/)).toBeTruthy());
  });

  it('removes a label across the selection', async () => {
    vi.mocked(ipc.tagMemory).mockResolvedValue(true as never);
    await searchFor(['doc-a']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    pickBulkTag('finance');
    fireEvent.click(screen.getByRole('button', { name: 'Remove from 1' }));

    await waitFor(() => expect(ipc.tagMemory).toHaveBeenCalledTimes(1));
    expect(ipc.tagMemory).toHaveBeenCalledWith(
      'doc-a',
      'finance',
      false,
      'bulk label from console',
    );
  });

  it('offers no bulk controls to a viewer', async () => {
    vi.mocked(ipc.queryMemory).mockResolvedValue({
      hits: [hit('doc-a')],
      policy_note: '',
    } as never);
    render(<LabelsPane vocabulary={vocabulary} role="viewer" />);
    fireEvent.change(screen.getByLabelText('Find a document or memory'), {
      target: { value: 'quarterly' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('body of doc-a')).toBeTruthy());
    expect(screen.queryByRole('checkbox', { name: 'Select all results' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select doc-a' })).toBeNull();
  });
});

describe('LabelsPane — browsing documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The end-to-end point of the whole feature: find a document with no labels
  // WITHOUT already knowing what it says. Search cannot do this — there is no
  // query text for "the ones I forgot to label".
  it('lists unlabelled documents by default and reports the whole matching set', async () => {
    vi.mocked(ipc.listDocuments).mockResolvedValue({
      documents: [
        { id: 'doc-a', title: 'Ops review', source_type: 'pdf', tags: [], chunk_count: 12, created_at_unix_ms: 0 },
      ],
      next_cursor: '',
      total_matching: 422,
    } as never);

    render(<LabelsPane vocabulary={vocabulary} role="operator" canBrowse />);
    fireEvent.click(screen.getByRole('tab', { name: 'browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'List documents' }));

    await waitFor(() => expect(screen.getByText('Ops review')).toBeTruthy());
    expect(ipc.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ unlabelled_only: true, cursor: '' }),
    );
    // "1 of 422", not "1 shown": the total is what says how much of the corpus no
    // rule can reach.
    expect(screen.getByText(/1 of 422 unlabelled/)).toBeTruthy();
    expect(screen.getByText(/no labels — no rule can reach this/)).toBeTruthy();
  });

  it('pages with the keyset cursor and appends rather than replacing', async () => {
    vi.mocked(ipc.listDocuments)
      .mockResolvedValueOnce({
        documents: [
          { id: 'doc-a', title: 'A', source_type: 'pdf', tags: [], chunk_count: 1, created_at_unix_ms: 0 },
        ],
        next_cursor: 'doc-a',
        total_matching: 2,
      } as never)
      .mockResolvedValueOnce({
        documents: [
          { id: 'doc-b', title: 'B', source_type: 'pdf', tags: [], chunk_count: 1, created_at_unix_ms: 0 },
        ],
        next_cursor: '',
        total_matching: 2,
      } as never);

    render(<LabelsPane vocabulary={vocabulary} role="operator" canBrowse />);
    fireEvent.click(screen.getByRole('tab', { name: 'browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'List documents' }));
    await waitFor(() => expect(screen.getByText('A')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('B')).toBeTruthy());

    // The first page is still on screen — paging a long worklist must not lose it.
    expect(screen.getByText('A')).toBeTruthy();
    expect(ipc.listDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'doc-a' }),
    );
  });

  // An older kernel has no ListDocuments. Hiding the lane is the contract: the UI
  // renders what the handshake advertises and never probes for an RPC.
  it('hides the browse lane when the kernel lacks document-listing', () => {
    render(<LabelsPane vocabulary={vocabulary} role="operator" canBrowse={false} />);
    expect(screen.queryByRole('tab', { name: 'browse' })).toBeNull();
  });

  it('labels a browsed document through the same picker', async () => {
    vi.mocked(ipc.listDocuments).mockResolvedValue({
      documents: [
        { id: 'doc-a', title: 'Ops review', source_type: 'pdf', tags: [], chunk_count: 1, created_at_unix_ms: 0 },
      ],
      next_cursor: '',
      total_matching: 1,
    } as never);
    vi.mocked(ipc.tagMemory).mockResolvedValue(true as never);

    render(<LabelsPane vocabulary={vocabulary} role="operator" canBrowse />);
    fireEvent.click(screen.getByRole('tab', { name: 'browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'List documents' }));
    await waitFor(() => expect(screen.getByText('Ops review')).toBeTruthy());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    pickBulkTag('finance');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1' }));

    await waitFor(() =>
      expect(ipc.tagMemory).toHaveBeenCalledWith(
        'doc-a',
        'finance',
        true,
        'bulk label from console',
      ),
    );
  });
});

describe('LabelsPane — viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('still offers no bulk controls to a viewer', async () => {
    vi.mocked(ipc.queryMemory).mockResolvedValue({
      hits: [hit('doc-a')],
      policy_note: '',
    } as never);
    render(<LabelsPane vocabulary={vocabulary} role="viewer" />);
    fireEvent.change(screen.getByLabelText('Find a document or memory'), {
      target: { value: 'quarterly' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('body of doc-a')).toBeTruthy());
    expect(screen.queryByRole('checkbox', { name: 'Select all results' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select doc-a' })).toBeNull();
  });
});
