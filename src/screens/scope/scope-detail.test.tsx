import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScopeDetail } from '@/screens/scope/ScopeDetail';
import { ipc } from '@/ipc';
import type {
  ScopeDetail as ScopeDetailType,
  BlastRadiusPreviewResponse,
} from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    getScope: vi.fn(),
    setScope: vi.fn().mockResolvedValue({ deduped: false }),
    getBlastRadiusPreview: vi.fn().mockResolvedValue({
      affected_agents: [],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    } as BlastRadiusPreviewResponse),
  },
}));

function makeScope(overrides: Partial<ScopeDetailType> = {}): ScopeDetailType {
  return {
    agent_id: 'agent-1',
    effective_scope: {
      required_tags: ['read:docs'],
      any_of_tags: [],
      forbidden_tags: ['write:secrets'],
    },
    default_write_tags: ['write:docs'],
    caller_scope: {
      required_tags: ['read:docs'],
      any_of_tags: [],
      forbidden_tags: ['write:secrets'],
    },
    k_anonymity_floor: 3,
    scope_change_history: [],
    ...overrides,
  };
}

async function renderAndOpenActions(
  agentId = 'agent-1',
  role: 'operator' | 'viewer' = 'operator',
) {
  render(<ScopeDetail agentId={agentId} role={role} />);
  await waitFor(() => {
    expect(screen.getByText(agentId)).toBeInTheDocument();
  });
  const actionsTab = screen.getByRole('tab', { name: 'Actions' });
  fireEvent.mouseDown(actionsTab);
  fireEvent.click(actionsTab);
}

describe('ScopeDetail Actions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getScope).mockResolvedValue(makeScope());
  });

  it('hides adjust controls for Viewer role', async () => {
    await renderAndOpenActions('agent-1', 'viewer');

    expect(screen.queryByRole('button', { name: 'Adjust scope' })).not.toBeInTheDocument();
    expect(screen.getByText(/require the Operator role/i)).toBeInTheDocument();
  });

  it('shows Adjust scope button for operator', async () => {
    await renderAndOpenActions('agent-1', 'operator');

    expect(screen.getByRole('button', { name: 'Adjust scope' })).toBeInTheDocument();
  });

  it('seeds form inputs with current effective scope values', async () => {
    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));

    expect(screen.getByLabelText(/Required tags/i)).toHaveValue('read:docs');
    expect(screen.getByLabelText(/Any-of tags/i)).toHaveValue('');
    expect(screen.getByLabelText(/Forbidden tags/i)).toHaveValue('write:secrets');
  });

  it('calls setScope with correct params including agent_id on confirm', async () => {
    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));

    fireEvent.change(screen.getByLabelText(/Required tags/i), {
      target: { value: 'read:docs, read:logs' },
    });
    fireEvent.change(screen.getByLabelText(/Any-of tags/i), {
      target: { value: 'write:notes' },
    });
    fireEvent.change(screen.getByLabelText(/Forbidden tags/i), {
      target: { value: 'write:secrets, write:admin' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review scope change' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'expanding read access for audit' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply scope change' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.setScope)).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(ipc.setScope).mock.calls[0][0];
    expect(call.agent_id).toBe('agent-1');
    expect(call.required_tags).toEqual(['read:docs', 'read:logs']);
    expect(call.any_of_tags).toEqual(['write:notes']);
    expect(call.forbidden_tags).toEqual(['write:secrets', 'write:admin']);
    expect(call.reason).toBe('expanding read access for audit');
    expect(typeof call.command_id).toBe('string');
    expect(call.command_id.length).toBeGreaterThan(0);
  });

  it('disables confirm when reason is empty and enables with valid reason', async () => {
    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review scope change' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Apply scope change' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    expect(confirmBtn).not.toBeDisabled();
  });

  it('shows ErrorState on kernel error', async () => {
    vi.mocked(ipc.setScope).mockRejectedValueOnce(new Error('PermissionDenied'));

    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review scope change' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply scope change' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('fetches blast-radius preview for set_scope on review', async () => {
    const previewResp: BlastRadiusPreviewResponse = {
      affected_agents: [
        {
          agent_id: 'agent-1',
          before_effective_scope: {
            required_tags: ['read:docs'],
            any_of_tags: [],
            forbidden_tags: ['write:secrets'],
            resolved_required: ['read:docs'],
            resolved_any_of: [],
            resolved_forbidden: ['write:secrets'],
          },
          after_effective_scope: {
            required_tags: ['read:docs', 'read:logs'],
            any_of_tags: [],
            forbidden_tags: ['write:secrets'],
            resolved_required: ['read:docs', 'read:logs'],
            resolved_any_of: [],
            resolved_forbidden: ['write:secrets'],
          },
          before_default_write_tags: ['write:docs'],
          after_default_write_tags: ['write:docs'],
          impact: 'narrowed',
        },
      ],
      affected_plans: [],
      computed_at: '2026-01-01T00:00:00Z',
      cache_ttl_ms: 5000,
    };
    vi.mocked(ipc.getBlastRadiusPreview).mockResolvedValueOnce(previewResp);

    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));

    fireEvent.change(screen.getByLabelText(/Required tags/i), {
      target: { value: 'read:docs, read:logs' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review scope change' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.getBlastRadiusPreview)).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'set_scope',
          agent_id: 'agent-1',
          scope: {
            required_tags: ['read:docs', 'read:logs'],
            any_of_tags: [],
            forbidden_tags: ['write:secrets'],
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Blast radius preview')).toBeInTheDocument();
    });
    expect(screen.getByText(/Affected agents:/i)).toBeInTheDocument();
  });

  it('closes dialog after successful setScope mutation', async () => {
    await renderAndOpenActions('agent-1', 'operator');

    fireEvent.click(screen.getByRole('button', { name: 'Adjust scope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review scope change' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'needed for task' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply scope change' }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Reason/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders without crashing when scope collections are empty', async () => {
    vi.mocked(ipc.getScope).mockResolvedValue(
      makeScope({
        effective_scope: { required_tags: [], any_of_tags: [], forbidden_tags: [] },
        default_write_tags: [],
        caller_scope: { required_tags: [], any_of_tags: [], forbidden_tags: [] },
        k_anonymity_floor: 0,
        scope_change_history: [],
      }),
    );

    render(<ScopeDetail agentId="agent-1" role="operator" />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });
  });
});