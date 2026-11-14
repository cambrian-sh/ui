import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { ShortcutKeys, SHORTCUT_EVENT, useShortcut, type ShortcutId } from '@/components/ShortcutKeys';
import { SHORTCUTS } from '@/lib/keyboard';

// Owner decision 2026-11-14 (T-20261113-advertised-keyboard-shortcuts-g-chords-a-r-e-on):
// bind c, i, /, n, j/k, Enter and the plan keys; a/r/e stay mouse-only and
// leave the sheet.

function press(key: string, code: string, target: Element | Document = document, extra: object = {}) {
  act(() => {
    fireEvent.keyDown(target, { key, code, ...extra });
    fireEvent.keyUp(target, { key, code, ...extra });
  });
}

function Listener({ id, onFire }: { id: ShortcutId; onFire: () => void }) {
  useShortcut(id, onFire);
  return null;
}

describe('ShortcutKeys', () => {
  it('the sheet no longer lists approve/reject/edit', () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    for (const k of ['a', 'r', 'e']) expect(keys).not.toContain(k);
    for (const k of ['c', 'i', 'j', 'k', 'Enter', '/', 'n', '+', '-', '0', 'Mod+g']) expect(keys).toContain(k);
  });

  it('c, i and the plan keys reach the screen that listens', () => {
    const fired: string[] = [];
    const ids: ShortcutId[] = ['chat', 'inject', 'zoom-in', 'zoom-out', 'zoom-reset', 'plan-view-toggle'];
    render(
      <>
        <ShortcutKeys />
        {ids.map((id) => (
          <Listener key={id} id={id} onFire={() => fired.push(id)} />
        ))}
      </>,
    );
    press('c', 'KeyC');
    press('i', 'KeyI');
    press('=', 'Equal');
    press('-', 'Minus');
    press('0', 'Digit0');
    press('g', 'KeyG', document, { ctrlKey: true });
    expect(fired).toEqual(expect.arrayContaining(['chat', 'inject', 'zoom-in', 'zoom-out', 'zoom-reset']));
    expect(SHORTCUT_EVENT).toBe('cambrian:shortcut');
  });

  it('/ focuses the filter, n clicks new, j/k move across rows and Enter opens one', () => {
    const onNew = vi.fn();
    const onOpen = vi.fn();
    const { getByLabelText, getAllByRole } = render(
      <>
        <ShortcutKeys />
        <input aria-label="filter" data-shortcut="filter" />
        <button data-shortcut="new" onClick={onNew}>new</button>
        <button data-shortcut-row onClick={onOpen}>row 1</button>
        <button data-shortcut-row>row 2</button>
      </>,
    );
    press('/', 'Slash');
    expect(document.activeElement).toBe(getByLabelText('filter'));
    (document.activeElement as HTMLElement).blur();
    press('n', 'KeyN');
    expect(onNew).toHaveBeenCalled();
    const rows = getAllByRole('button').filter((b) => b.hasAttribute('data-shortcut-row'));
    press('j', 'KeyJ');
    expect(document.activeElement).toBe(rows[0]);
    press('j', 'KeyJ');
    expect(document.activeElement).toBe(rows[1]);
    press('k', 'KeyK');
    expect(document.activeElement).toBe(rows[0]);
    press('Enter', 'Enter', rows[0]);
    expect(onOpen).toHaveBeenCalled();
  });

  it('typing in a form field never triggers a shortcut', () => {
    const fired = vi.fn();
    const { getByLabelText } = render(
      <>
        <ShortcutKeys />
        <Listener id="chat" onFire={fired} />
        <input aria-label="message" />
      </>,
    );
    press('c', 'KeyC', getByLabelText('message'));
    expect(fired).not.toHaveBeenCalled();
  });
});
