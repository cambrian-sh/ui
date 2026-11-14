import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NavChords, toSequence } from '@/components/NavChords';
import { NAV_SHORTCUTS } from '@/lib/keyboard';

// T-20261113-advertised-keyboard-shortcuts-g-chords-a-r-e-on: the shortcut
// sheet listed "g c" … "g x" while nothing bound them.

const navigate = vi.fn();

/** One key press as the browser reports it (react-hotkeys-hook reads `code`). */
function press(key: string, target: Element | Document = document) {
  const code = `Key${key.toUpperCase()}`;
  act(() => {
    fireEvent.keyDown(target, { key, code });
    fireEvent.keyUp(target, { key, code });
  });
}
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));

describe('NavChords (UI-007)', () => {
  beforeEach(() => navigate.mockReset());

  it('translates the sheet notation into a hotkey sequence', () => {
    expect(toSequence('g c')).toBe('g>c');
  });

  it('navigates to the advertised destination for each chord', () => {
    render(<NavChords />);
    for (const s of NAV_SHORTCUTS) {
      navigate.mockClear();
      const [first, second] = s.keys.split(' ');
      press(first);
      press(second);
      expect(navigate, s.keys).toHaveBeenCalledWith({ to: s.path });
    }
  });

  it('does nothing while the operator types in an input', () => {
    render(
      <>
        <NavChords />
        <input aria-label="draft" />
      </>,
    );
    const input = screen.getByLabelText('draft');
    input.focus();
    press('g', input);
    press('c', input);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('has one chord per key sequence', () => {
    const keys = NAV_SHORTCUTS.map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
