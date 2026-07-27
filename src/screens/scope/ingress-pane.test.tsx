import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IngressPane } from '@/screens/scope/IngressPane';
import { TagPicker } from '@/screens/scope/TagPicker';
import type { IngressSpec } from '@/ipc/types';

const listIngresses = vi.fn();
const registerIngress = vi.fn();
const deregisterIngress = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listIngresses: () => listIngresses(),
    registerIngress: (i: IngressSpec) => registerIngress(i),
    deregisterIngress: (id: string) => deregisterIngress(id),
  },
}));

const tg: IngressSpec = {
  agent_id: 'telegram_ingress',
  surface_kind: 'chat',
  surface_id: 'telegram',
  namespace: ['tg:'],
};

describe('IngressPane (ADR-0090)', () => {
  beforeEach(() => {
    listIngresses.mockReset().mockResolvedValue([tg]);
    registerIngress.mockReset().mockResolvedValue({ ok: true, error: '', version: 0 });
    deregisterIngress.mockReset().mockResolvedValue(undefined);
  });

  it('shows what surface an ingress stamps and who it may speak for', async () => {
    render(<IngressPane role="operator" />);
    await waitFor(() => expect(screen.getByText('telegram_ingress')).toBeInTheDocument());

    expect(screen.getByText('chat:telegram')).toBeInTheDocument();
    expect(screen.getByText('tg:')).toBeInTheDocument();
  });

  // An empty namespace is safe with one ingress and an impersonation route with two,
  // so it is called out rather than rendered as blank.
  it('warns when an ingress may speak for any identity', async () => {
    listIngresses.mockResolvedValue([{ ...tg, namespace: [] }]);
    render(<IngressPane role="operator" />);

    await waitFor(() =>
      expect(screen.getByText(/unrestricted namespace/i)).toBeInTheDocument(),
    );
  });

  // A deployment with no ingress is correct, not unfinished — and the empty state
  // has to say what the deployment IS.
  it('explains the empty state as a valid deployment', async () => {
    listIngresses.mockResolvedValue([]);
    render(<IngressPane role="operator" />);

    await waitFor(() =>
      expect(screen.getByText(/correct deployment, not a missing step/i)).toBeInTheDocument(),
    );
  });

  it('registers an ingress and reloads', async () => {
    render(<IngressPane role="operator" />);
    await waitFor(() => expect(screen.getByText('telegram_ingress')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /register an ingress/i }));
    fireEvent.change(screen.getByPlaceholderText('telegram_ingress'), { target: { value: 'slack_ingress' } });
    fireEvent.change(screen.getByPlaceholderText('telegram'), { target: { value: 'slack' } });
    fireEvent.change(screen.getByPlaceholderText('tg:'), { target: { value: 'slack:' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(registerIngress).toHaveBeenCalled());
    const sent = registerIngress.mock.calls[0][0] as IngressSpec;
    expect(sent.agent_id).toBe('slack_ingress');
    expect(sent.namespace).toEqual(['slack:']);
  });

  // A refused registration is an authoring outcome with a specific fix, so it must
  // land next to the form rather than in a toast that disappears.
  it('renders a refusal inline and keeps the form open', async () => {
    registerIngress.mockResolvedValue({
      ok: false,
      error: 'a surface is required, otherwise the registration is inert',
      version: 0,
    });
    render(<IngressPane role="operator" />);
    await waitFor(() => expect(screen.getByText('telegram_ingress')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /register an ingress/i }));
    fireEvent.change(screen.getByPlaceholderText('telegram_ingress'), { target: { value: 'broken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/inert/));
    // Still editable, so the operator can fix the thing they were told about.
    expect(screen.getByPlaceholderText('telegram_ingress')).toBeInTheDocument();
  });

  // The kernel enforces role; the UI reflects it (ADR-0047).
  it('hides mutating controls from a viewer', async () => {
    render(<IngressPane role="viewer" />);
    await waitFor(() => expect(screen.getByText('telegram_ingress')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /register an ingress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deregister/i })).not.toBeInTheDocument();
  });
});

describe('TagPicker closed-tag affordance (ADR-0091)', () => {
  const vocab = (closed: string[]) => ({
    tags: ['airline', 'public'],
    configured: true,
    closed: new Set(closed),
    loading: false,
    error: null,
  });

  // Closed-ness changes what every other term means, so it has to be visible where
  // tags are chosen — not only in an ADR.
  it('marks closed tags and explains what the marker means', () => {
    render(
      <TagPicker
        label="Required"
        hint="h"
        selected={[]}
        onChange={() => {}}
        vocabulary={vocab(['airline'])}
      />,
    );
    expect(screen.getAllByLabelText('closed tag').length).toBeGreaterThan(0);
    expect(screen.getByText(/nobody\s+reaches it unless a policy grants it/i)).toBeInTheDocument();
  });

  // The grant field may only offer closed tags: the kernel refuses a grant on an
  // open tag, so offering one hands the author a rejection from a valid-looking form.
  it('offers only closed tags in a grant field', () => {
    render(
      <TagPicker
        label="Grants"
        hint="h"
        selected={[]}
        onChange={() => {}}
        vocabulary={vocab(['airline'])}
        closedOnly
      />,
    );
    expect(screen.getByRole('button', { name: /airline/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ public/ })).not.toBeInTheDocument();
  });

  // "Nothing to grant" is not an empty list — it means no tag is deny-by-default.
  it('explains why a grant field is empty when nothing is closed', () => {
    render(
      <TagPicker
        label="Grants"
        hint="h"
        selected={[]}
        onChange={() => {}}
        vocabulary={vocab([])}
        closedOnly
      />,
    );
    expect(screen.getByText(/No tag is closed, so there is nothing to grant/i)).toBeInTheDocument();
  });
});

describe('surface link targets (ADR-0090/0091)', () => {
  // A surface link typed by hand is the free-text-tag defect wearing another hat:
  // `console` instead of `operator`, or a typo, silently never applies. The one an
  // operator granting themselves needs — a bare `operator` matching
  // `operator:console` — is not guessable from an empty text box.
  it('offers well-known surfaces and the surfaces registered ingresses stamp', async () => {
    const { WELL_KNOWN_SURFACE_TARGETS } = await import('@/screens/scope/PoliciesPane');
    expect(WELL_KNOWN_SURFACE_TARGETS).toContain('operator');
    expect(WELL_KNOWN_SURFACE_TARGETS).toContain('chat:*');
    expect(WELL_KNOWN_SURFACE_TARGETS).toContain('agent');
  });
});
