import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlideToConfirm } from './slide-to-confirm';

/**
 * This component exists to make an accidental confirmation impossible, so the
 * tests are mostly about what must NOT fire. A slide-to-confirm that a tap can
 * trigger is worse than a button, because it looks safer than it is.
 */
function setup(props: Partial<React.ComponentProps<typeof SlideToConfirm>> = {}) {
  const onConfirm = vi.fn();
  render(<SlideToConfirm label="Slide to approve" onConfirm={onConfirm} {...props} />);
  const rail = screen.getByRole('slider');
  // jsdom gives every element a zero-size rect, so pointer maths cannot be
  // exercised here — the keyboard path covers the same commit logic.
  return { onConfirm, rail };
}

describe('SlideToConfirm', () => {
  it('does not confirm on a click', () => {
    const { onConfirm, rail } = setup();
    fireEvent.click(rail);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not confirm on a tap-like pointer down and up in place', () => {
    // The exact gesture a pocket or a mis-scroll produces.
    const { onConfirm, rail } = setup();
    fireEvent.pointerDown(rail, { clientX: 0 });
    fireEvent.pointerUp(rail, { clientX: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not confirm from a partial travel', () => {
    const { onConfirm, rail } = setup();
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    fireEvent.keyDown(rail, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms once the rail is taken all the way', () => {
    const { onConfirm, rail } = setup();
    fireEvent.keyDown(rail, { key: 'End' });
    fireEvent.keyDown(rail, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('springs back after a partial attempt so the next touch cannot finish it', () => {
    const { rail } = setup();
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    fireEvent.keyDown(rail, { key: 'Enter' });
    expect(rail).toHaveAttribute('aria-valuenow', '0');
  });

  it('does not confirm twice', () => {
    const { onConfirm, rail } = setup();
    fireEvent.keyDown(rail, { key: 'End' });
    fireEvent.keyDown(rail, { key: 'Enter' });
    fireEvent.keyDown(rail, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cannot be operated at all when disabled, and says why', () => {
    const { onConfirm, rail } = setup({
      disabled: true,
      disabledReason: 'A reason is required before this can be approved.',
    });
    fireEvent.keyDown(rail, { key: 'End' });
    fireEvent.keyDown(rail, { key: 'Enter' });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText('A reason is required before this can be approved.'),
    ).toBeInTheDocument();
  });

  it('exposes slider semantics so it is operable without a pointer', () => {
    const { rail } = setup();
    expect(rail).toHaveAttribute('aria-valuemin', '0');
    expect(rail).toHaveAttribute('aria-valuemax', '100');
    expect(rail).toHaveAccessibleName('Slide to approve');
  });
});
