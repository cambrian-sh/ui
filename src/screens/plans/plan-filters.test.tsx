import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanFilters, type PlanFiltersState } from '@/screens/plans/PlanFilters';

const INITIAL: PlanFiltersState = {
  statuses: [],
  session: null,
  search: '',
};

describe('PlanFilters', () => {
  it('toggles a status filter on click', () => {
    const onChange = vi.fn();
    render(<PlanFilters filters={INITIAL} onChange={onChange} availableSessions={[{ id: 's1', title: 'Session 1' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Running' }));
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, statuses: ['running'] });
  });

  it('toggles a status filter off when clicked again', () => {
    const onChange = vi.fn();
    render(
      <PlanFilters
        filters={{ ...INITIAL, statuses: ['running'] }}
        onChange={onChange}
        availableSessions={[{ id: 's1', title: 'Session 1' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Running' }));
    expect(onChange).toHaveBeenCalledWith({ statuses: [], session: null, search: '' });
  });

  it('disables the reset button when no filters are active', () => {
    render(<PlanFilters filters={INITIAL} onChange={() => {}} availableSessions={[{ id: 's1', title: 'Session 1' }]} />);
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  });

  it('enables the reset button when a status filter is active', () => {
    render(
      <PlanFilters
        filters={{ ...INITIAL, statuses: ['running'] }}
        onChange={() => {}}
        availableSessions={[{ id: 's1', title: 'Session 1' }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reset filters' })).not.toBeDisabled();
  });

  it('updates search input', () => {
    const onChange = vi.fn();
    render(<PlanFilters filters={INITIAL} onChange={onChange} availableSessions={[{ id: 's1', title: 'Session 1' }]} />);

    const search = screen.getByPlaceholderText(/Search subject/);
    fireEvent.change(search, { target: { value: 'migrate' } });
    expect(onChange).toHaveBeenCalledWith({ ...INITIAL, search: 'migrate' });
  });
});
