import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MCPFilters, type MCPFiltersState } from '@/screens/mcp/MCPFilters';

const INITIAL: MCPFiltersState = {
  connectionState: 'all',
  search: '',
};

describe('MCPFilters', () => {
  it('toggles a connection state filter on click', () => {
    const onChange = vi.fn();
    render(<MCPFilters filters={INITIAL} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Up' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, connectionState: 'Up' });
  });

  it('disables the reset button when no filters are active', () => {
    render(<MCPFilters filters={INITIAL} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });

  it('enables the reset button when a connection state is selected', () => {
    const onChange = vi.fn();
    render(
      <MCPFilters filters={{ ...INITIAL, connectionState: 'Up' }} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeEnabled();
  });
});
