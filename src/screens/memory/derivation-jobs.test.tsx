import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DerivationJobsPanel } from '@/screens/memory/DerivationJobsPanel';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

// ENG-2139 (contract 0113): the derivation journal panel lists the backlog and the
// dead jobs with their error, and requeues one with a reason.

const { getDerivationJournal, requeueDerivationJob } = vi.hoisted(() => ({
  getDerivationJournal: vi.fn(),
  requeueDerivationJob: vi.fn(),
}));

vi.mock('@/ipc', () => ({ ipc: { getDerivationJournal, requeueDerivationJob } }));

const dead = {
  kind: 'kg_triplets', document_id: 'source_doc:handbook.pdf', content_digest: 'sha256:aa',
  attempts: 5, last_error: 'provider 503: service unavailable', chunk_count: 42, dead_at_unix_ms: Date.now() - 60_000,
};

function state(role: 'operator' | 'viewer'): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://k', last_known_state_at: new Date().toISOString(), reason: null },
    role, kernel_version: 'x', contract_version: '0113', capabilities: ['derivation-journal'], contract_skew: 0,
    plugins: [], cursor: 0, plans: [], sessions: [], audit_tail: [], pending_hitl: [], agents: [], tools: [],
    scope: {}, watch_configs: [],
  } as StateOfRecord;
}

describe('DerivationJobsPanel (ENG-2139)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    getDerivationJournal
      .mockResolvedValueOnce({
        kinds: [{ kind: 'kg_triplets', pending: 0, retrying: 0, dead: 1, oldest_unix_ms: 0 }],
        dead: [dead], recorded: 3, completed: 2, failed: 5, died: 1, recovered: 0,
      })
      .mockResolvedValue({ kinds: [], dead: [], recorded: 3, completed: 2, failed: 5, died: 1, recovered: 1 });
    requeueDerivationJob.mockResolvedValue({ deduped: false });
  });

  it('shows the dead job with its error and requeues it with a reason', async () => {
    projectionStore.getState().hydrate(state('operator'));
    render(<DerivationJobsPanel />);
    expect(await screen.findByText('provider 503: service unavailable')).toBeInTheDocument();
    expect(screen.getByText('source_doc:handbook.pdf')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Requeue' });
    expect(button).toBeDisabled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/model provider is back/), { target: { value: 'provider recovered' } });
    fireEvent.click(screen.getByRole('button', { name: 'Requeue' }));
    await waitFor(() =>
      expect(requeueDerivationJob).toHaveBeenCalledWith('kg_triplets', 'source_doc:handbook.pdf', 'sha256:aa', 'provider recovered'),
    );
    expect(await screen.findByText(/No jobs waiting/)).toBeInTheDocument();
  });

  it('a viewer sees the dead job but cannot requeue', async () => {
    projectionStore.getState().hydrate(state('viewer'));
    render(<DerivationJobsPanel />);
    await screen.findByText('provider 503: service unavailable');
    fireEvent.change(screen.getByPlaceholderText(/model provider is back/), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Requeue' })).toBeDisabled();
  });
});
