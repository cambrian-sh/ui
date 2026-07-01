import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SessionFilters,
  type SessionFiltersState,
} from '@/screens/sessions/SessionFilters';

const INITIAL: SessionFiltersState = {
  states: [],
  timeRange: 'all',
  agents: [],
  search: '',
};

describe('SessionFilters', () => {
  it('toggles a state filter on click', () => {
    const onChange = vi.fn();
    render(<SessionFilters filters={INITIAL} onChange={onChange} availableAgents={['a1']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, states: ['active'] });
  });

  it('disables the reset button when no filters are active', () => {
    render(<SessionFilters filters={INITIAL} onChange={() => {}} availableAgents={[]} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });
});
