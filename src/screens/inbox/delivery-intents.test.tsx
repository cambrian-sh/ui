import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryIntentsPanel } from '@/screens/inbox/DeliveryIntentsPanel';
import { projectionStore } from '@/store/projection';
import type { DeliveryIntent, StateOfRecord } from '@/ipc/types';

// ENG-1657 (contract 0118, owner decision 2026-11-20 option A): the Inbox lists replies
// whose delivery is unknown or failed (never their text) and resolves an unknown one
// with a reason — confirm it arrived, or resend it once. A failed one has no action.

const { listDeliveryIntents, resolveDeliveryIntent } = vi.hoisted(() => ({
  listDeliveryIntents: vi.fn(),
  resolveDeliveryIntent: vi.fn(),
}));
vi.mock('@/ipc', () => ({ ipc: { listDeliveryIntents, resolveDeliveryIntent } }));

const amb: DeliveryIntent = {
  key: 'delivery:c1:m1', conversation_id: 'c1', txn_id: 'm1', ingress_agent_id: 'telegram_ingress',
  external_id: 'tg:5512', state: 'ambiguous', attempts: 1, error: 'connection reset mid-send', text_chars: 214,
  created_at_unix_ms: Date.now() - 60_000, updated_at_unix_ms: Date.now() - 60_000,
};
const failed: DeliveryIntent = { ...amb, key: 'delivery:c2:m7', conversation_id: 'c2', state: 'failed', error: 'permanent: bot was blocked', attempts: 3 };

function state(role: 'operator' | 'viewer'): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://k', last_known_state_at: new Date().toISOString(), reason: null },
    role, kernel_version: 'x', contract_version: '0118', capabilities: ['delivery-intents'], contract_skew: 0,
    plugins: [], cursor: 0, plans: [], sessions: [], audit_tail: [], pending_hitl: [], agents: [], tools: [],
    scope: {}, watch_configs: [],
  } as StateOfRecord;
}

describe('DeliveryIntentsPanel (ENG-1657)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    listDeliveryIntents.mockResolvedValueOnce([amb, failed]).mockResolvedValue([failed]);
    resolveDeliveryIntent.mockResolvedValue({ deduped: false });
  });

  it('resends an unknown reply once with a reason; a failed one has no action', async () => {
    projectionStore.getState().hydrate(state('operator'));
    render(<DeliveryIntentsPanel />);
    expect(await screen.findByText('connection reset mid-send')).toBeInTheDocument();
    expect(screen.getByText('permanent: bot was blocked')).toBeInTheDocument();
    // Actions only on the unknown one.
    expect(screen.getAllByRole('button', { name: 'Resend once' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Resend once' })).toBeDisabled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/checked with the customer/), { target: { value: 'never arrived' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resend once' }));
    await waitFor(() => expect(resolveDeliveryIntent).toHaveBeenCalledWith('delivery:c1:m1', 'resend', 'never arrived'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resend once' })).toBeNull());
    expect(listDeliveryIntents).toHaveBeenCalledWith([], 100);
  });

  it('a viewer sees them but cannot resolve', async () => {
    projectionStore.getState().hydrate(state('viewer'));
    render(<DeliveryIntentsPanel />);
    await screen.findByText('connection reset mid-send');
    fireEvent.change(screen.getByPlaceholderText(/checked with the customer/), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Confirm it arrived' })).toBeDisabled();
  });

  it('renders nothing when nothing needs a person', async () => {
    listDeliveryIntents.mockReset().mockResolvedValue([]);
    projectionStore.getState().hydrate(state('operator'));
    const { container } = render(<DeliveryIntentsPanel />);
    await waitFor(() => expect(listDeliveryIntents).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
