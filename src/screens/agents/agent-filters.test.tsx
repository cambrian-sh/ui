import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentFilters, type AgentFiltersState } from '@/screens/agents/AgentFilters';

const INITIAL: AgentFiltersState = {
  traits: [],
  timeRange: 'all',
  search: '',
};

describe('AgentFilters', () => {
  it('toggles a trait filter on click', () => {
    const onChange = vi.fn();
    render(<AgentFilters filters={INITIAL} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cognitive' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, traits: ['Cognitive'] });
  });

  it('disables the reset button when no filters are active', () => {
    render(<AgentFilters filters={INITIAL} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });

  it('enables the reset button when a trait is selected', () => {
    const onChange = vi.fn();
    render(
      <AgentFilters filters={{ ...INITIAL, traits: ['Cognitive'] }} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeEnabled();
  });
});
