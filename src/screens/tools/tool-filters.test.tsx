import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolFilters } from '@/screens/tools/ToolFilters';

describe('ToolFilters', () => {
  it('toggles danger only filter on click', () => {
    const onChange = vi.fn();
    render(
      <ToolFilters
        filters={{ dangerOnly: false, search: '' }}
        onChange={onChange}
      />
    );

    const btn = screen.getByRole('button', { name: 'Danger only' });
    fireEvent.click(btn);

    expect(onChange).toHaveBeenCalledWith({
      dangerOnly: true,
      search: '',
    });
  });

  it('disables the reset button when no filters are active', () => {
    render(
      <ToolFilters
        filters={{ dangerOnly: false, search: '' }}
        onChange={vi.fn()}
      />
    );

    const reset = screen.getByRole('button', { name: 'Reset filters' });
    expect(reset).toBeDisabled();
  });

  it('enables the reset button when danger only is active', () => {
    render(
      <ToolFilters
        filters={{ dangerOnly: true, search: '' }}
        onChange={vi.fn()}
      />
    );

    const reset = screen.getByRole('button', { name: 'Reset filters' });
    expect(reset).toBeEnabled();
  });
});
