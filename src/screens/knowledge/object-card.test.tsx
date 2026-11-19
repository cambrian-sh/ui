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

  // ENG-1109: an open kind's undeclared values show read-only in their own
  // section, never mixed into the declared properties; absent when there are none.
  it('shows undeclared properties read-only in their own section', async () => {
    vi.mocked(ipc.getObject).mockResolvedValue({
      ...page,
      extra_properties: [
        { property: 'carrier', value: { type: 'text', display: 'dhl' }, at: '2026-11-15T09:00:00Z',
          source: 'erp', evidence_id: 'ev-9', conflict: false, alternatives: [] },
      ],
    });
    const { container } = renderPane('order/O-1');
    const extras = await screen.findByRole('table', { name: 'Undeclared properties' });
    expect(extras.textContent).toContain('carrier');
    expect(extras.textContent).toContain('dhl');
    expect(screen.getByRole('table', { name: 'Properties' }).textContent).not.toContain('carrier');
    expect(screen.getByRole('button', { name: 'Open receipt ev-9' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no undeclared section when the kernel sends none', async () => {
    vi.mocked(ipc.getObject).mockResolvedValue(page);
    renderPane('order/O-1');
    await screen.findByRole('table', { name: 'Properties' });
    expect(screen.queryByRole('region', { name: 'Undeclared properties' })).toBeNull();
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

  // ENG-1753: retired rows are asked for only when the operator ticks the box, on
  // the point and events reads, and a retired row says so in words.
  it('asks for retired rows only when "Show retired rows" is ticked, and marks them', async () => {
    vi.mocked(ipc.getObject).mockResolvedValue(null);
    vi.mocked(ipc.listKnowledgeEntities).mockResolvedValue([
      { entity_id: 'camera/1', observation_count: 1, predicates: ['seen'], last_seen: '' },
    ]);
    vi.mocked(ipc.knowledgeQuery).mockImplementation(async (q) => ({
      guarantee: 'g',
      rows: q.include_retired && q.kind === 'point'
        ? ['{"entity_id":"camera/1","predicate":"seen","value_number":3,"evidence_id":"ev-r","retired":true,"retired_reason":"source_deleted","retired_by":"source:cams","retired_at":"2026-11-10T09:00:00Z"}']
        : [],
    }));
    const { container } = renderPane('camera/1');
    await screen.findByRole('heading', { name: 'Latest values' });
    await waitFor(() => expect(ipc.knowledgeQuery).toHaveBeenCalled());
    // Default: no read carries the flag.
    expect(vi.mocked(ipc.knowledgeQuery).mock.calls.every(([q]) => q.include_retired === undefined)).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show retired rows' }));
    const values = await screen.findByRole('table', { name: 'Latest values' });
    const asked = vi.mocked(ipc.knowledgeQuery).mock.calls.map(([q]) => q).filter((q) => q.include_retired);
    expect(asked.map((q) => q.kind).sort()).toEqual(['events', 'point']);
    // Traverse never asks: retirement is a property of typed rows only.
    expect(vi.mocked(ipc.knowledgeQuery).mock.calls.some(([q]) => q.kind === 'traverse' && q.include_retired)).toBe(false);
    const row = values.querySelector('tr[data-retired="true"]');
    expect(row?.getAttribute('title')).toBe('Retired (source_deleted) by source:cams at 2026-11-10T09:00:00Z: no longer counted in any answer.');
    expect(values.textContent).toContain('source_deleted');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reports a read failure as a failure, not as a missing object', async () => {
    vi.mocked(ipc.getObject).mockRejectedValue(new Error('Unavailable: down'));
    renderPane('order/O-1');
    expect(await screen.findByText(/The object page could not be read: Unavailable: down/, undefined, { timeout: 5000 })).toBeTruthy();
    expect(ipc.knowledgeQuery).not.toHaveBeenCalled();
  });
});
