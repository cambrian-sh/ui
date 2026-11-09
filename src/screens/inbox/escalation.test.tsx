import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@/ipc', async () => {
  const { createHierarchyMock } = await import('@/ipc/hierarchy-mock');
  return { ipc: createHierarchyMock() };
});

import { EscalationChain, principalIdOf } from './EscalationChain';

const hydrate = (capabilities: string[]) =>
  projectionStore.getState().hydrate({
    connection: { status: 'live', endpoint: 'k', last_known_state_at: null, reason: null },
    role: 'operator',
    capabilities,
    pending_hitl: [],
  } as unknown as StateOfRecord);

describe('EscalationChain', () => {
  beforeEach(() => {
    queryClient.clear();
    projectionStore.getState().reset();
  });

  it('shows the requester’s manager chain for a supervisor rule', async () => {
    hydrate(['org-directory']);
    render(<EscalationChain rule="relationship:supervisor" beneficiary="user:bob" />);
    expect(await screen.findByText('Escalation chain: Carol Demir → Deniz Kaya')).toBeInTheDocument();
  });

  it('stays silent without the org plane or for a non-relationship rule', () => {
    hydrate([]);
    const { container, rerender } = render(<EscalationChain rule="relationship:supervisor" beneficiary="user:bob" />);
    expect(container).toBeEmptyDOMElement();
    hydrate(['org-directory']);
    rerender(<EscalationChain rule="role:compliance" beneficiary="user:bob" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('maps a principal ref to the registry id', () => {
    expect(principalIdOf('user:bob')).toBe('bob');
    expect(principalIdOf('bob')).toBe('bob');
  });
});
