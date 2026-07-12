import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetail } from '@/screens/sessions/SessionDetail';
import { ipc } from '@/ipc';
import type { SessionSummary } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    pauseSession: vi.fn().mockResolvedValue({ deduped: false }),
    resumeSession: vi.fn().mockResolvedValue({ deduped: false }),
    completeSession: vi.fn().mockResolvedValue({ deduped: false }),
  },
}));

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'mock-session',
    title: 'Sample session',
    state: 'active',
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    plan_count: 0,
    agent_mix: [],
    cost: 0,
    ...overrides,
  };
}

describe('SessionDetail mutation errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces a pause error via ErrorState instead of swallowing it', async () => {
    vi.mocked(ipc.pauseSession).mockRejectedValueOnce(new Error('PermissionDenied'));

    render(<SessionDetail session={makeSession({ state: 'active' })} role="operator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause session' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'investigating' } });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
    expect(vi.mocked(ipc.pauseSession)).toHaveBeenCalledWith({
      session_id: 'mock-session',
      reason: 'investigating',
    });
  });

  it('surfaces a complete error via ErrorState', async () => {
    vi.mocked(ipc.completeSession).mockRejectedValueOnce(new Error('PermissionDenied'));

    render(<SessionDetail session={makeSession({ state: 'active' })} role="operator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete session' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'closing out' } });

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PermissionDenied');
  });

  it('does not surface an error on success', async () => {
    render(<SessionDetail session={makeSession({ state: 'active' })} role="operator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause session' }));

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'pausing for review' } });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(vi.mocked(ipc.pauseSession)).toHaveBeenCalledWith({
        session_id: 'mock-session',
        reason: 'pausing for review',
      });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
