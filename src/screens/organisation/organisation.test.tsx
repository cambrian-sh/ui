import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';
import type { Role, StateOfRecord } from '@/ipc/types';

// A fresh mock plane per test: the mock is stateful (saves persist).
const holder = vi.hoisted(() => ({ ipc: null as unknown }));
vi.mock('@/ipc', () => ({
  get ipc() {
    return holder.ipc;
  },
}));
import { createHierarchyMock } from '@/ipc/hierarchy-mock';

import { ScimPane } from './ScimPane';
import { MappingRulesPane } from './MappingRulesPane';
import { OrgTreePane } from './OrgTreePane';
import { ApproversPane } from './ApproversPane';

const REASON = 'quarterly directory change';

function hydrate(role: Role) {
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'k', last_known_state_at: null, reason: null },
    role,
    kernel_version: '',
    contract_version: '',
    capabilities: ['org-directory'],
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  } as StateOfRecord);
}

beforeEach(() => {
  holder.ipc = createHierarchyMock();
  queryClient.clear();
  projectionStore.getState().reset();
  hydrate('operator');
});

describe('SCIM token: shown once', () => {
  it('shows the bearer after create, never in the listing, and forgets it on done', async () => {
    render(<ScimPane />);
    expect(await screen.findByText('Entra ID')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Okta' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));

    const dialog = await screen.findByRole('dialog', { name: /Okta — shown once/ });
    const token = (within(dialog).getByLabelText('Token') as HTMLInputElement).value;
    expect(token).toMatch(/^scim_/);
    // The listing row for the new connection carries only the last four.
    await waitFor(() => expect(screen.getByText(new RegExp(`token …${token.slice(-4)}`))).toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole('button', { name: /I have stored it/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(token);
  });

  it('a viewer cannot create, rotate or revoke', async () => {
    hydrate('viewer');
    render(<ScimPane />);
    await screen.findByText('Entra ID');
    expect(screen.getByRole('button', { name: 'Create connection' })).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: /Rotate token|Revoke/ })) expect(b).toBeDisabled();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });
});

describe('mapping rule: preview before save', () => {
  it('requires a preview of exactly the rule being saved', async () => {
    render(<MappingRulesPane />);
    await screen.findByText('Finance department');
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Treasury' } });
    fireEvent.change(screen.getByLabelText('Departments'), { target: { value: 'Finance' } });
    fireEvent.change(screen.getByLabelText('Policy groups'), { target: { value: 'treasury' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });

    const save = screen.getByRole('button', { name: 'Save and apply' });
    expect(save).toBeDisabled();
    expect(screen.getByText(/Preview the rule first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    expect(await screen.findByText(/This rule would change: 2 people/)).toBeInTheDocument();
    expect(screen.getByText(/Carol Demir: \+group treasury/)).toBeInTheDocument();
    expect(save).toBeEnabled();

    // Editing after the preview withdraws Save until it is previewed again.
    fireEvent.change(screen.getByLabelText('Roles'), { target: { value: 'operator' } });
    expect(save).toBeDisabled();
    expect(screen.getByText(/mark it privileged/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Roles'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await screen.findByText(/This rule would change/);
    fireEvent.click(save);
    expect(await screen.findByText(/Saved and applied — changed: 2 people/)).toBeInTheDocument();
  });
});

describe('org tree', () => {
  it('renders units, heads and members; a directory-owned person is read-only', async () => {
    render(<OrgTreePane />);
    expect(await screen.findByRole('tree', { name: 'Organisation units' })).toBeInTheDocument();
    expect(screen.getByText('Municipality')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Finance' }));
    fireEvent.click(screen.getByRole('button', { name: /^Carol Demir/ }));
    expect(await screen.findByText(/Comes from the directory \(SCIM\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Manager')).toBeDisabled();
  });

  it('an editor-owned person can be given a manager, with a reason', async () => {
    render(<OrgTreePane />);
    await screen.findByText('Not in a unit');
    fireEvent.click(screen.getByRole('button', { name: /^Eve Arslan/ }));
    fireEvent.change(await screen.findByLabelText('Manager'), { target: { value: 'rana' } });
    const save = screen.getByRole('button', { name: 'Save person' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByLabelText('Reason')).toHaveValue(''));
  });
});

describe('who approves what', () => {
  it('shows the chain and where an above-limit payment goes', async () => {
    render(<ApproversPane />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(2));
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'bob' } });
    expect(await screen.findByRole('list', { name: 'Managers, nearest first' })).toHaveTextContent('Carol Demir');
    expect(screen.getByText('payment with amount above 5000')).toBeInTheDocument();
  });

  it('warns when nobody could approve above the limit', async () => {
    render(<ApproversPane />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(2));
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'eve' } });
    expect(await screen.findByText(/No manager/)).toBeInTheDocument();
    expect(screen.getByText('nobody')).toBeInTheDocument();
  });
});
