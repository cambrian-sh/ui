import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopeFilters } from './ScopeFilters';

describe('ScopeFilters', () => {
  it('renders search input and disabled reset button initially', () => {
    const onChange = vi.fn();
    render(<ScopeFilters filters={{ search: '' }} onChange={onChange} />);

    expect(screen.getByRole('searchbox', { name: 'Search agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });

  it('calls onChange when search input changes', () => {
    const onChange = vi.fn();
    render(<ScopeFilters filters={{ search: '' }} onChange={onChange} />);

    const input = screen.getByRole('searchbox', { name: 'Search agents' });
    fireEvent.change(input, { target: { value: 'alpha' } });

    expect(onChange).toHaveBeenCalledWith({ search: 'alpha' });
  });

  it('enables reset button when search is active and resets on click', () => {
    const onChange = vi.fn();
    render(<ScopeFilters filters={{ search: 'alpha' }} onChange={onChange} />);

    const resetBtn = screen.getByRole('button', { name: 'Reset filters' });
    expect(resetBtn).toBeEnabled();

    fireEvent.click(resetBtn);
    expect(onChange).toHaveBeenCalledWith({ search: '' });
  });
});
