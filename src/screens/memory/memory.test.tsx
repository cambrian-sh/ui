import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryDetail } from './MemoryDetail';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import type { MemoryDocument } from '@/design-system/components/cambrian/memory-list';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    setToolGrant: vi.fn(),
    getBlastRadiusPreview: vi.fn().mockResolvedValue({
      affected_agents: [],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    }),
  },
}));

function makeDoc(): MemoryDocument {
  return {
    doc_id: 'mem-123',
    doc_type: 'mnemonic_fact',
    scope_tags: ['global'],
    activation_strength: 0.9,
    session_id: 'ses-456',
    created_at: new Date().toISOString(),
    content_preview: 'Test memory content',
  };
}

function makeState(role: 'operator' | 'viewer' = 'operator'): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
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
    lifecycle: {
      scheduler_state: 'idle',
      pending_jobs: 0,
      last_consolidation: null,
      dormancy_events: [],
    },
    verifier_pool: {
      pool_agents: [],
      recent_rounds: [],
      surveillance_triggers: [],
    },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

describe('MemoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
  });

  it('renders without crashing when the document has sparse fields', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    const doc = makeDoc();
    doc.content_preview = '';
    doc.scope_tags = [];
    doc.session_id = '';

    render(<MemoryDetail doc={doc} />);

    expect(screen.getByText('mem-123')).toBeInTheDocument();
    expect(screen.getByText(/no scope/i)).toBeInTheDocument();
    expect(screen.getByText('FACT')).toBeInTheDocument();
  });

  it('calls setToolGrant with tag mutation when confirming tag via dialog', async () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<MemoryDetail doc={makeDoc()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tag memory' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'user requested tag' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.setToolGrant)).toHaveBeenCalledWith({
        agent_id: 'memory:mem-123',
        tool_name: 'tag:user',
        granted: true,
        reason: 'user requested tag',
      });
    });
  });

  it('calls setToolGrant with delete mutation when confirming delete via dialog', async () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<MemoryDetail doc={makeDoc()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete memory' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'obsolete' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.setToolGrant)).toHaveBeenCalledWith({
        agent_id: 'memory:mem-123',
        tool_name: 'delete:user',
        granted: true,
        reason: 'obsolete',
      });
    });
  });

  it('disables mutating buttons and shows role notice for Viewer role', () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    render(<MemoryDetail doc={makeDoc()} />);

    expect(screen.getByRole('button', { name: 'Tag memory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete memory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Promote memory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Supersede memory' })).toBeDisabled();

    expect(screen.getByText(/These actions require the Operator role/)).toBeInTheDocument();
  });

  it('does not call setToolGrant when Viewer clicks a button', () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    render(<MemoryDetail doc={makeDoc()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tag memory' }));

    expect(ipc.setToolGrant).not.toHaveBeenCalled();
  });

  it('surfaces ErrorState on mutation failure', async () => {
    vi.mocked(ipc.setToolGrant).mockRejectedValueOnce(new Error('PermissionDenied'));
    projectionStore.getState().hydrate(makeState('operator'));
    render(<MemoryDetail doc={makeDoc()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tag memory' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'user requested' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState('operator'));
    const { container } = render(<MemoryDetail doc={makeDoc()} />);
    await waitFor(() => {
      expect(screen.getByText('mem-123')).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
