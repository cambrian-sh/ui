import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ipc } from '@/ipc';
import type { ObjectPage } from '@/ipc/types';
import { queryClient } from '@/lib/queryClient';
import { ExplorePane } from './ExplorePane';

// ADR-0149 D7: the Explore card is ONE GetObject call for an object of a
// declared table kind, and falls back to the query-plane card otherwise.

vi.mock('@/ipc', () => ({
  ipc: {
    getObject: vi.fn(),
    knowledgeQuery: vi.fn(),
    listKnowledgeEntities: vi.fn(),
  },
}));

const page: ObjectPage = {
  entity_id: 'order/O-1',
  kind: 'order',
  namespace: 'default',
  created_at: '2026-11-01T09:00:00Z',
  first_seen_evidence: 'ev-1',
  decl_version: 4,
  updated_at: '2026-11-02T09:00:00Z',
  properties: [
    {
      property: 'status',
      value: { type: 'text', display: 'picking' },
      at: '2026-11-02T09:00:00Z',
      source: 'erp',
      evidence_id: 'ev-2',
      conflict: true,
      alternatives: [
        { value: { type: 'text', display: 'open' }, at: '2026-11-01T09:00:00Z', source: 'crm', evidence_id: 'ev-3' },
      ],
    },
    {
      property: 'customer',
      value: { type: 'entity', display: 'customer/C-1' },
      at: '2026-11-01T09:00:00Z',
      source: 'erp',
      evidence_id: 'ev-2',
      conflict: false,
      alternatives: [],
    },
  ],
  lifecycle: { state_predicate: 'status', state: 'picking', allowed: ['packed', 'cancelled'] },
  aliases: [],
  links: [
    {
      link_id: 'l1',
      relation: 'placed_by',
      label: 'placed_by',
      family: 'relation',
      direction: 'out',
      other_ref: 'entity:customer/C-1',
      other_kind: 'customer',
      evidence_id: 'ev-4',
      asserted_at: '2026-11-01T09:00:00Z',
      valid_from: '',
      valid_to: '',
    },
  ],
  timeline: [
    {
      kind: 'event',
      at: '2026-11-02T10:00:00Z',
      event_id: 'e1',
      event_type: 'picked',
      roles: { order: 'order/O-1' },
      property: '',
      value: { type: '', display: '' },
      evidence_id: 'ev-5',
    },
  ],
  evidence: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'],
};

function renderPane(selected: string) {
  const onSelect = vi.fn();
  const onReceipt = vi.fn();
  const view = render(
    <ExplorePane selectedEntity={selected} onSelectEntity={onSelect} onOpenReceipt={onReceipt} />,
  );
  return { ...view, onSelect, onReceipt };
}

describe('Explore card through GetObject', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(ipc.listKnowledgeEntities).mockResolvedValue([]);
    vi.mocked(ipc.knowledgeQuery).mockReset().mockResolvedValue({ guarantee: 'g', rows: [] });
    vi.mocked(ipc.getObject).mockReset();
  });

  it('renders the whole object page from one call and nothing from the query plane', async () => {
    vi.mocked(ipc.getObject).mockResolvedValue(page);
    const { container, onSelect, onReceipt } = renderPane('order/O-1');
    expect(await screen.findByRole('table', { name: 'Properties' })).toBeTruthy();
    expect(ipc.getObject).toHaveBeenCalledTimes(1);
    expect(ipc.getObject).toHaveBeenCalledWith('order/O-1');
    expect(ipc.knowledgeQuery).not.toHaveBeenCalled();
    expect(screen.getAllByText('picking').length).toBeGreaterThan(0);
    // The conflict shows the other source's value, with its receipt.
    expect(screen.getByRole('list', { name: 'Other values of status' }).textContent).toContain('crm says open');
    expect(screen.getByText(/may move to packed, cancelled/)).toBeTruthy();
    expect(screen.getByText('event')).toBeTruthy();
    // Entity values and links re-centre the explorer; receipts open.
    fireEvent.click(screen.getAllByRole('button', { name: 'customer/C-1' })[0]);
    expect(onSelect).toHaveBeenCalledWith('customer/C-1');
    fireEvent.click(screen.getByRole('button', { name: 'Open receipt ev-3' }));
    expect(onReceipt).toHaveBeenCalledWith('ev-3');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('falls back to the query-plane card when the entity is not an object', async () => {
    vi.mocked(ipc.getObject).mockResolvedValue(null);
    vi.mocked(ipc.listKnowledgeEntities).mockResolvedValue([
      { entity_id: 'camera/1', observation_count: 1, predicates: ['seen'], last_seen: '' },
    ]);
    renderPane('camera/1');
    expect(await screen.findByRole('heading', { name: 'Latest values' })).toBeTruthy();
    await waitFor(() => expect(ipc.knowledgeQuery).toHaveBeenCalled());
    expect(screen.queryByRole('table', { name: 'Properties' })).toBeNull();
  });

  it('reports a read failure as a failure, not as a missing object', async () => {
    vi.mocked(ipc.getObject).mockRejectedValue(new Error('Unavailable: down'));
    renderPane('order/O-1');
    expect(await screen.findByText(/The object page could not be read: Unavailable: down/, undefined, { timeout: 5000 })).toBeTruthy();
    expect(ipc.knowledgeQuery).not.toHaveBeenCalled();
  });
});
