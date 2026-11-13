import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ipc } from '@/ipc';
import { LineageSection } from './LineageSection';

// ADR-0148 (accepted 2026-11-12): stored lineage is the default answer;
// related events are opt-in and rendered apart, labelled "Related — not causal".

vi.mock('@/ipc', () => ({
  ipc: { knowledgeQuery: vi.fn() },
}));

const storedHop =
  '{"row":"hop","from_ref":"entity:customer/C-1","to_ref":"event:e-9","relation":"referenced_by","mechanism":"reference","stored":true,"hop":1,"evidence_id":"ev-1"}';
const hint =
  '{"row":"hint","hint":"related_available","related_count":3,"flag":"include_correlation","text":"no stored lineage; 3 related events available with include_correlation"}';
const relatedRow =
  '{"row":"related","from_ref":"event:e-2","to_ref":"event:e-1","mechanism":"shared_object","stored":false,"score":0.81,"shared_entity_id":"customer/C-1","hop":1,"evidence_id":"ev-2"}';
const hubRow =
  '{"row":"flagged","ref":"entity:site/WH-1","guard":"why_hub_participant","limit":64,"events":71}';

function seed(lineage: string[], related: string[]) {
  vi.mocked(ipc.knowledgeQuery).mockImplementation(async (q) =>
    q?.include_correlation
      ? { guarantee: 'stored lineage hops are asserted; related rows share a participant and are not causal', rows: related }
      : { guarantee: 'stored lineage only, each hop labelled by mechanism; related events are not causal and need include_correlation', rows: lineage },
  );
}

describe('LineageSection', () => {
  beforeEach(() => vi.mocked(ipc.knowledgeQuery).mockReset());

  it('asks for stored lineage only by default and renders it under Lineage', async () => {
    seed([storedHop], [relatedRow]);
    render(<LineageSection entityId="customer/C-1" onOpenReceipt={vi.fn()} />);
    const table = await screen.findByRole('table', { name: 'Stored lineage' });
    expect(within(table).getByText('event:e-9')).toBeTruthy();
    expect(vi.mocked(ipc.knowledgeQuery)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ipc.knowledgeQuery).mock.calls[0][0]).toEqual({ kind: 'why', entity_id: 'entity:customer/C-1' });
    expect(screen.queryByRole('region', { name: 'Related — not causal' })).toBeNull();
  });

  it('shows the kernel hint verbatim when there is no stored lineage', async () => {
    seed([hint], [relatedRow]);
    render(<LineageSection entityId="customer/C-1" onOpenReceipt={vi.fn()} />);
    expect(await screen.findByRole('note')).toHaveTextContent(
      'no stored lineage; 3 related events available with include_correlation',
    );
    expect(screen.getByText(/No stored lineage: nobody has asserted/)).toBeTruthy();
  });

  it('opts in to related events and renders them apart, labelled not causal, with hubs named', async () => {
    seed([hint], [relatedRow, hubRow]);
    render(<LineageSection entityId="customer/C-1" onOpenReceipt={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show related events (not causal)' }));
    const region = await screen.findByRole('region', { name: 'Related — not causal' });
    await waitFor(() => expect(within(region).getByRole('table', { name: 'Related events' })).toBeTruthy());
    const table = within(region).getByRole('table', { name: 'Related events' });
    expect(within(table).getByText('0.81')).toBeTruthy();
    // The discriminator is the section, not a column.
    expect(within(table).queryByText('row')).toBeNull();
    expect(within(region).getByText(/Not followed: entity:site\/WH-1 takes part in 71 events/)).toBeTruthy();
    const relatedCall = vi.mocked(ipc.knowledgeQuery).mock.calls.find((c) => c[0].include_correlation);
    expect(relatedCall?.[0]).toEqual({ kind: 'why', entity_id: 'entity:customer/C-1', include_correlation: true });
    // Related rows never leak into the stored-lineage list.
    expect(screen.queryByRole('table', { name: 'Stored lineage' })).toBeNull();
  });

  it('has no axe violations with both sections open', async () => {
    seed([storedHop], [relatedRow, hubRow]);
    const { container } = render(<LineageSection entityId="customer/C-1" onOpenReceipt={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show related events (not causal)' }));
    await screen.findByRole('table', { name: 'Related events' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
