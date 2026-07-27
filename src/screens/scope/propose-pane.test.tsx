import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProposePane } from '@/screens/scope/ProposePane';
import type { LinkSpec, PolicyProposal, PolicySpec } from '@/ipc/types';

const proposePolicy = vi.fn();
const savePolicy = vi.fn();
const linkPolicy = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    proposePolicy: (r: string) => proposePolicy(r),
    savePolicy: (p: PolicySpec) => savePolicy(p),
    linkPolicy: (l: LinkSpec) => linkPolicy(l),
  },
}));

function proposal(over: Partial<PolicyProposal> = {}): PolicyProposal {
  return {
    rationale: 'Support agents should not read secrets.',
    policy: {
      id: 'support-no-secrets',
      name: 'Support boundary',
      version: 0,
      rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['secrets'], granted_tags: [] },
      effects: { allow: [], deny: [] },
      mode: 'report_only',
      expires_at_unix_ms: 0,
      granted_by: '',
      updated_at_unix_ms: 0,
    },
    links: [
      {
        policy_id: 'support-no-secrets',
        container_kind: 'group',
        target_id: 'support-team',
        enforced: false,
        order: 0,
        expires_at_unix_ms: 0,
        granted_by: '',
      },
    ],
    problems: [],
    simulation: { decisions: [], newly_denied: 0, newly_allowed: 0, unchanged: 0 },
    simulation_basis: 0,
    blocking: false,
    ...over,
  };
}

async function draft(text = 'support agents should not read secrets') {
  fireEvent.change(screen.getByLabelText(/what should be allowed or denied/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: /draft a policy/i }));
  await waitFor(() => expect(proposePolicy).toHaveBeenCalled());
}

describe('ProposePane (ADR-0092)', () => {
  beforeEach(() => {
    proposePolicy.mockReset().mockResolvedValue(proposal());
    savePolicy.mockReset().mockResolvedValue({ ok: true, error: '', version: 1 });
    linkPolicy.mockReset().mockResolvedValue(undefined);
  });

  it('shows the terms and the containers, not just the prose', async () => {
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();

    expect(screen.getByText('secrets')).toBeInTheDocument();
    expect(screen.getByText(/group support-team/)).toBeInTheDocument();
    // The rationale is present as context — but it is not what makes the pane
    // useful. Matched on its own wording, since the request text I typed above is
    // deliberately similar and lives in the textarea.
    expect(screen.getByText(/^Support agents should not read secrets\.$/)).toBeInTheDocument();
  });

  // The single most important control in the pane: a blocking problem must make
  // approval impossible, not merely discouraged.
  it('refuses to approve a blocking proposal', async () => {
    proposePolicy.mockResolvedValue(
      proposal({
        blocking: true,
        problems: [{ severity: 'blocking', message: 'tag "sekrets" is coined' }],
      }),
    );
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();

    expect(screen.getByText(/coined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
  });

  it('surfaces a warning without blocking approval', async () => {
    proposePolicy.mockResolvedValue(
      proposal({ problems: [{ severity: 'warning', message: 'this policy GRANTS airline' }] }),
    );
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();

    expect(screen.getByText(/GRANTS airline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });

  // Approving goes through the ordinary write path, policy first then links. If it
  // ever grew its own apply RPC, the model's output would become a write.
  it('approves by saving the policy and then its links', async () => {
    const onChanged = vi.fn();
    render(<ProposePane role="operator" onChanged={onChanged} />);
    await draft();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    expect(savePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'support-no-secrets', mode: 'report_only' }),
    );
    expect(linkPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ policy_id: 'support-no-secrets', target_id: 'support-team' }),
    );
  });

  // A refused policy must not leave links pointing at something that was never saved.
  it('does not link when the policy is refused', async () => {
    savePolicy.mockResolvedValue({ ok: false, error: 'unsatisfiable rule', version: 0 });
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/unsatisfiable/));
    expect(linkPolicy).not.toHaveBeenCalled();
  });

  // Zero counts over an empty journal mean "nothing to compare". Rendering them as
  // three zeroes would read as "this change is safe", which is the opposite claim.
  it('says the blast radius is unknown rather than zero on an empty journal', async () => {
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();
    expect(screen.getByText(/no journalled decisions to replay/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown/)).toBeInTheDocument();
  });

  it('reports a measured blast radius when there is history', async () => {
    proposePolicy.mockResolvedValue(
      proposal({
        simulation_basis: 40,
        simulation: { decisions: [], newly_denied: 3, newly_allowed: 0, unchanged: 37 },
      }),
    );
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();
    expect(screen.getByText(/3 newly denied/)).toBeInTheDocument();
    expect(screen.getByText(/against 40 recent decisions/i)).toBeInTheDocument();
  });

  // The landing has to be stated where approval happens, not somewhere else.
  it('states that approval lands report-only', async () => {
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();
    expect(screen.getByRole('button', { name: /approve as report-only/i })).toBeInTheDocument();
  });

  it('is read-only for a viewer', async () => {
    render(<ProposePane role="viewer" onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /draft a policy/i })).toBeDisabled();
    expect(screen.getByText(/needs the operator role/i)).toBeInTheDocument();
  });

  // An unconfigured assistant is Unimplemented from the kernel. It must read as
  // unavailable, not as a broken console.
  it('shows the kernel error when no LLM is configured', async () => {
    proposePolicy.mockRejectedValue(new Error('policy proposals need an LLM; none is configured'));
    render(<ProposePane role="operator" onChanged={() => {}} />);
    await draft();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/need an LLM/i),
    );
  });
});
