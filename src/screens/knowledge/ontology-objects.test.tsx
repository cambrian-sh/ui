import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ipc } from '@/ipc';
import type { OntologyView, StateOfRecord } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { OntologyPane, parseDeclarations } from './OntologyPane';
import { ObjectsPane, toConditions } from './ObjectsPane';

// ENG-1395: the operator's ontology and objects surfaces over the premium
// SubstrateLane RPCs (GetOntology, ApplyOntologyChange, ListOntologyViolations,
// ListObjects). The ipc module is mocked per file, as the other knowledge panes.

vi.mock('@/ipc', () => ({
  ipc: {
    getOntology: vi.fn(),
    applyOntologyChange: vi.fn(),
    listOntologyViolations: vi.fn(),
    listObjects: vi.fn(),
  },
}));

const ONTOLOGY: OntologyView = {
  namespace: 'default',
  version: 7,
  declarations_json: JSON.stringify({
    kinds: [
      {
        kind: 'order',
        table: true,
        predicates: { total: { type: 'number', indexed: true }, status: { type: 'text', enum: ['open', 'late'] } },
      },
      { kind: 'promise', predicates: { status: { type: 'text' } } },
    ],
    relations: [{ name: 'placed_by', family: 'relation', from_kind: 'order', to_kind: 'customer' }],
  }),
};

function liveAs(role: string): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0104',
    capabilities: ['substrate-query'],
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
  } as unknown as StateOfRecord;
}

beforeEach(() => {
  projectionStore.getState().reset();
  projectionStore.getState().hydrate(liveAs('operator'));
  vi.mocked(ipc.getOntology).mockResolvedValue(ONTOLOGY);
  vi.mocked(ipc.listOntologyViolations).mockResolvedValue({
    version: 7,
    truncated: false,
    violations: [{ rule: 'enum', subject: 'kind order.status', reference: 'ki-9', detail: 'a value outside [open late]' }],
  });
});

describe('the Ontology tab', () => {
  it('shows the declarations as data and the violations report', async () => {
    render(<OntologyPane />);
    await waitFor(() => expect(screen.getByLabelText('Declared kinds')).toBeInTheDocument());
    const kinds = screen.getByLabelText('Declared kinds');
    expect(kinds).toHaveTextContent('order');
    expect(kinds).toHaveTextContent('total: number · indexed');
    expect(kinds).toHaveTextContent('status: text · open|late');
    expect(kinds).toHaveTextContent('table · order/…');
    expect(screen.getByLabelText('Declared relations')).toHaveTextContent('order → customer');
    await waitFor(() => expect(screen.getByLabelText('Violation rows')).toHaveTextContent('ki-9'));
  });

  it('dry-runs first, refuses to apply a breaking change, and applies with a reason', async () => {
    const apply = vi.mocked(ipc.applyOntologyChange);
    render(<OntologyPane />);
    await waitFor(() => expect(screen.getByLabelText('Change (JSON)')).toBeInTheDocument());
    const applyButton = () => screen.getByRole('button', { name: 'Apply' });

    fireEvent.change(screen.getByLabelText('Change (JSON)'), { target: { value: '{"kinds":[]}' } });
    expect(applyButton()).toBeDisabled(); // no dry run yet

    apply.mockResolvedValueOnce({
      command_id: '',
      deduped: false,
      applied: false,
      version: 7,
      class: 'breaking',
      changes: [{ class: 'breaking', subject: 'kind order.total', detail: 'value type number -> text' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    await waitFor(() => expect(screen.getByLabelText('Dry run result')).toHaveTextContent('breaking'));
    expect(apply).toHaveBeenLastCalledWith('{"kinds":[]}', '', true);
    fireEvent.change(screen.getByLabelText('Why apply this change'), {
      target: { value: 'tightening the order model for L2' },
    });
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText(/A breaking change is refused by the kernel/)).toBeInTheDocument();

    apply.mockResolvedValueOnce({
      command_id: '',
      deduped: false,
      applied: false,
      version: 7,
      class: 'additive',
      changes: [{ class: 'additive', subject: 'kind order.eta', detail: 'new property' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    await waitFor(() => expect(screen.getByLabelText('Dry run result')).toHaveTextContent('additive'));
    expect(applyButton()).toBeEnabled();

    apply.mockResolvedValueOnce({ command_id: 'cmd-1', deduped: false, applied: true, version: 8, class: 'additive', changes: [] });
    fireEvent.click(applyButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('version 8'));
    expect(apply).toHaveBeenLastCalledWith('{"kinds":[]}', 'tightening the order model for L2', false);
  });

  it('a viewer cannot apply: the kernel would refuse it, so the console says so first', async () => {
    projectionStore.getState().hydrate(liveAs('viewer'));
    render(<OntologyPane />);
    await waitFor(() => expect(screen.getByLabelText('Change (JSON)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByText(/Operator role required to change the ontology/)).toBeInTheDocument();
  });
});

describe('the Objects tab', () => {
  it('lists objects of a declared table kind with typed conditions, sort and paging', async () => {
    const list = vi.mocked(ipc.listObjects);
    list.mockResolvedValueOnce({
      kind: 'order',
      decl_version: 7,
      next_page_token: 'p2',
      rows: [{ entity_id: 'order/O-1', values: [{ property: 'total', value: { type: 'number', display: '72000' } }] }],
    });
    list.mockResolvedValueOnce({
      kind: 'order',
      decl_version: 7,
      next_page_token: '',
      rows: [{ entity_id: 'order/O-2', values: [{ property: 'total', value: { type: 'number', display: '51000' } }] }],
    });
    render(<ObjectsPane />);
    await waitFor(() => expect(screen.getByLabelText('Object kind')).toBeInTheDocument());
    // Only table kinds are offered.
    expect(screen.queryByRole('option', { name: 'promise' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    fireEvent.change(screen.getByLabelText('Condition 1 property'), { target: { value: 'total' } });
    fireEvent.change(screen.getByLabelText('Condition 1 operator'), { target: { value: 'gt' } });
    fireEvent.change(screen.getByLabelText('Condition 1 value'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('Sort property'), { target: { value: 'total' } });
    fireEvent.click(screen.getByRole('button', { name: 'List objects' }));

    await waitFor(() => expect(screen.getByLabelText('Object rows')).toHaveTextContent('order/O-1'));
    expect(list).toHaveBeenLastCalledWith({
      kind: 'order',
      conditions: [{ property: 'total', op: 'gt', values: [{ type: 'number', value: '50000' }] }],
      order_by: [{ property: 'total', desc: false }],
      fields: [],
      page_size: 50,
      page_token: '',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByLabelText('Object rows')).toHaveTextContent('order/O-2'));
    expect(list.mock.calls[1][0].page_token).toBe('p2');
    expect(screen.getByLabelText('Object rows')).toHaveTextContent('order/O-1'); // pages accumulate
  });

  it('says so when no kind has an object table', async () => {
    vi.mocked(ipc.getOntology).mockResolvedValueOnce({ ...ONTOLOGY, declarations_json: '{"kinds":[{"kind":"promise"}]}' });
    render(<ObjectsPane />);
    await waitFor(() => expect(screen.getByText(/No kind is declared with an object table/)).toBeInTheDocument());
  });
});

describe('request builders', () => {
  it('types each literal by its declared property and splits in-lists', () => {
    const order = parseDeclarations(ONTOLOGY.declarations_json).kinds[0];
    expect(
      toConditions(order, [
        { property: 'status', op: 'in', value: 'open, late' },
        { property: 'total', op: 'is_null', value: 'ignored' },
        { property: '', op: 'eq', value: 'dropped' },
      ]),
    ).toEqual([
      { property: 'status', op: 'in', values: [{ type: 'text', value: 'open' }, { type: 'text', value: 'late' }] },
      { property: 'total', op: 'is_null', values: [] },
    ]);
  });
});
