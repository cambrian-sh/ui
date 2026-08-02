import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudioStatus } from '@/ipc/types';

// The console shell pulls in the router; these tests exercise the panes,
// where the gate's acceptance criteria actually land.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

const setCredential = vi.fn().mockResolvedValue({ ok: true, error: '', detail: 'stored' });
const lifecycle = vi.fn().mockResolvedValue({ ok: false, error: 'lifecycle: no transition ARMED → DRAFT', detail: '' });

vi.mock('@/ipc', () => ({
  ipc: {
    studioLifecycle: (...args: unknown[]) => lifecycle(...args),
    studioArm: vi.fn(),
    studioRollback: vi.fn(),
    studioSetCredential: (...args: unknown[]) => setCredential(...args),
    studioClearCredential: vi.fn(),
  },
}));

import { LifecyclePane } from './LifecyclePane';
import { StateBadge } from './IngressStudioConsole';

function status(over: Partial<StudioStatus> = {}): StudioStatus {
  return {
    summary: {
      ingress_id: 'gh',
      display_name: 'GitHub',
      state: 'DRY_RUN',
      health: 'ok',
      pinned_release: '',
    },
    latest_transport_revision: 1,
    latest_mapping_revision: 1,
    release_id: '',
    armed_transport_revision: 0,
    armed_mapping_revision: 0,
    capture_samples: 2,
    failure_count: 0,
    credentials: [{ name: 'secret', configured: false, last_four: '' }],
    egress_policy_json: '',
    ...over,
  };
}

describe('LifecyclePane', () => {
  it('shows the arm form only in DRY_RUN, and arming demands a reason', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRY_RUN" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    // The arm form is present with revision inputs and a disabled button
    // until the reason gate is satisfied.
    expect(screen.getByText('Arm', { selector: 'button' })).toBeDisabled();
    expect(screen.getByLabelText('Transport revision')).toBeInTheDocument();
    expect(screen.getByLabelText('Mapping revision')).toBeInTheDocument();
  });

  it('never renders an arm form outside DRY_RUN — pause appears when armed', () => {
    render(
      <LifecyclePane ingressId="gh" state="ARMED" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    expect(screen.queryByLabelText('Transport revision')).not.toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('renders the kernel-named refusal inline, never a generic error', async () => {
    render(
      <LifecyclePane ingressId="gh" state="ARMED" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() =>
      expect(screen.getByText('lifecycle: no transition ARMED → DRAFT')).toBeInTheDocument(),
    );
  });

  it('reports an unconfigured credential as the 503 it causes', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRAFT" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    expect(screen.getByText(/not configured — deliveries answer 503/)).toBeInTheDocument();
  });

  it('clears the credential input on success — a secret never lingers', async () => {
    render(
      <LifecyclePane ingressId="gh" state="DRAFT" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    const input = screen.getByLabelText('Credential secret') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'whsec_xyz' } });
    fireEvent.click(screen.getByText('Store'));
    await waitFor(() => expect(input.value).toBe(''));
    expect(setCredential).toHaveBeenCalledWith('gh', 'secret', 'whsec_xyz');
  });

  it('offers no mutating controls to a read-only role', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRY_RUN" status={status()} readOnly={true} onChanged={() => {}} />,
    );
    expect(screen.queryByText('Arm', { selector: 'button' })).not.toBeInTheDocument();
    expect(screen.queryByText('Store')).not.toBeInTheDocument();
  });
});

describe('StateBadge', () => {
  it('renders every lifecycle state by name', () => {
    for (const s of ['DRAFT', 'CAPTURING', 'MAPPED', 'DRY_RUN', 'ARMED', 'PAUSED', 'RETIRED']) {
      const { unmount } = render(<StateBadge state={s} />);
      expect(screen.getByText(s)).toBeInTheDocument();
      unmount();
    }
  });
});
