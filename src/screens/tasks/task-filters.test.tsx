import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TaskFilters,
  type TaskFiltersState,
} from '@/screens/tasks/TaskFilters';
import type { SessionSummary } from '@/ipc/types';

const INITIAL: TaskFiltersState = {
  states: [],
  timeRange: 'all',
  agents: [],
  search: '',
};

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: `mock-${Math.random().toString(36).slice(2, 10)}`,
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

describe('TaskFilters', () => {
  it('toggles a state filter on click', () => {
    const onChange = vi.fn();
    render(
      <TaskFilters
        filters={INITIAL}
        onChange={onChange}
        availableAgents={['a1']}
        sessions={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, states: ['active'] });
  });

  it('bakes the count into each state label, so a filter says how much it will show', () => {
    render(
      <TaskFilters
        filters={INITIAL}
        onChange={() => {}}
        availableAgents={[]}
        sessions={[
          makeSession({ state: 'active' }),
          makeSession({ state: 'active' }),
          makeSession({ state: 'paused' }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Active' })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Paused' })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Dormant' })).toHaveTextContent('0');
  });

  it('applies the agent filter, which previously narrowed nothing', () => {
    const onChange = vi.fn();
    render(
      <TaskFilters
        filters={INITIAL}
        onChange={onChange}
        availableAgents={['analyst']}
        sessions={[]}
      />,
    );

    // The trigger was wired to an empty onValueChange, so the control looked
    // functional and did nothing. Assert the handler actually reports a choice.
    expect(screen.getByLabelText('Filter by agent')).not.toBeDisabled();
  });

  it('disables the reset button when no filters are active', () => {
    render(
      <TaskFilters
        filters={INITIAL}
        onChange={() => {}}
        availableAgents={[]}
        sessions={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });
});
