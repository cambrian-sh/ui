import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnroutedApprovals } from './UnroutedApprovals';
import { describeRule, needsHierarchy, unroutedExplanation } from '@/lib/approvalRules';
import type { UnroutedApproval } from '@/ipc/types';

const u = (o: Partial<UnroutedApproval>): UnroutedApproval => ({
  intervention_id: 'appr-1',
  outcome: 'needs_hierarchy',
  kind: '',
  agent_id: 'finance-agent',
  session_id: '',
  summary: 'send_payment',
  rule: 'relationship:supervisor',
  beneficiary: 'user:bob',
  detail: 'no manager for user:bob',
  resolved_at: '',
  ...o,
});

describe('approver rules (ADR-0142 D11)', () => {
  it('renders the kernel rule in plain language', () => {
    expect(describeRule('self | operator')).toBe('the person it is for or any operator');
    expect(describeRule('relationship:supervisor')).toMatch(/supervisor/);
    expect(describeRule('role:compliance')).toBe('anyone with the compliance role');
    expect(describeRule('person:carol')).toBe('carol');
    expect(describeRule('')).toBe('');
    expect(needsHierarchy('self | relationship:supervisor')).toBe(true);
    expect(needsHierarchy('role:compliance')).toBe(false);
  });

  it('explains needs_hierarchy and unroutable differently', () => {
    expect(unroutedExplanation(u({})).title).toMatch(/hierarchy/);
    expect(unroutedExplanation(u({})).body).toMatch(/NOT approved/);
    expect(unroutedExplanation(u({ outcome: 'unroutable' })).title).toMatch(/No approver/);
  });
});

describe('UnroutedApprovals', () => {
  it('shows what ended without an approver, why, and how to fix it; dismiss is local', () => {
    render(<UnroutedApprovals items={[u({}), u({ intervention_id: 'appr-2', outcome: 'unroutable', summary: 'publish_record', rule: '', detail: '' })]} />);
    expect(screen.getByRole('heading', { name: /Ended without an approver \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText('send_payment')).toBeInTheDocument();
    expect(screen.getByText(/no manager in|names no manager/)).toBeInTheDocument();
    expect(screen.getByText(/Kernel: no manager for user:bob/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss send_payment' }));
    expect(screen.queryByText('send_payment')).not.toBeInTheDocument();
    expect(screen.getByText('publish_record')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing unrouted', () => {
    const { container } = render(<UnroutedApprovals items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
