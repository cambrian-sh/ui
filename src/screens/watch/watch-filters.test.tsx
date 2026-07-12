import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WatchFilters, type WatchFiltersState } from '@/screens/watch/WatchFilters';

const INITIAL: WatchFiltersState = {
  statuses: [],
  search: '',
};

describe('WatchFilters', () => {
  it('toggles a status filter on click', () => {
    const onChange = vi.fn();
    render(<WatchFilters filters={INITIAL} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, statuses: ['ok'] });
  });

  it('disables the reset button when no filters are active', () => {
    render(<WatchFilters filters={INITIAL} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });

  it('enables the reset button when a status is selected', () => {
    const onChange = vi.fn();
    render(
      <WatchFilters filters={{ ...INITIAL, statuses: ['ok'] }} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeEnabled();
  });
});
