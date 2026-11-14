import { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

/**
 * Binds the single-key shortcuts the sheet lists (owner decision 2026-11-14,
 * T-20261113-advertised-keyboard-shortcuts-g-chords-a-r-e-on): c, i, /, n,
 * j/k, Enter and the plan keys +/-/0 and Mod+g. a/r/e (approve/reject/edit)
 * stay mouse-only — an approval needs its reason and confirm step — and are not
 * on the sheet.
 *
 * Two mechanisms, chosen per key:
 *  - DOM targets for generic moves: `/` focuses the screen's filter
 *    (`[data-shortcut="filter"]`, else the first search input), `n` clicks
 *    `[data-shortcut="new"]`, j/k move focus across `[data-shortcut-row]`
 *    rows and Enter on a focused row clicks it.
 *  - A `cambrian:shortcut` window event for keys a screen must interpret: the
 *    composer focuses itself for `chat` / `inject`, the pipeline graph zooms
 *    for `zoom-in` / `zoom-out` / `zoom-reset`, and a plan view toggles on
 *    `plan-view-toggle`. A screen that does not listen ignores the key.
 *
 * Typing never triggers these: react-hotkeys-hook ignores form fields by
 * default, so `c` in a message is just a letter.
 */
export function ShortcutKeys() {
  useHotkeys('c', (e) => fire(e, 'chat'));
  useHotkeys('i', (e) => fire(e, 'inject'));
  useHotkeys('slash', (e) => {
    if (focusFirst('[data-shortcut="filter"]', 'input[type="search"]')) e.preventDefault();
  });
  useHotkeys('n', (e) => {
    const el = document.querySelector<HTMLElement>('[data-shortcut="new"]');
    if (el) {
      e.preventDefault();
      el.click();
    }
  });
  useHotkeys('j', (e) => {
    if (moveRow(1)) e.preventDefault();
  });
  useHotkeys('k', (e) => {
    if (moveRow(-1)) e.preventDefault();
  });
  useHotkeys('enter', (e) => {
    const el = document.activeElement as HTMLElement | null;
    if (el?.hasAttribute('data-shortcut-row')) {
      e.preventDefault();
      el.click();
    }
  });
  useHotkeys(['equal', 'shift+equal', 'plus', 'numpadadd'], (e) => fire(e, 'zoom-in'));
  useHotkeys(['minus', 'numpadsubtract'], (e) => fire(e, 'zoom-out'));
  useHotkeys(['0', 'numpad0'], (e) => fire(e, 'zoom-reset'));
  useHotkeys('mod+g', (e) => fire(e, 'plan-view-toggle'));
  return null;
}

/** The ids a `cambrian:shortcut` event carries. */
export type ShortcutId = 'chat' | 'inject' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'plan-view-toggle';

export const SHORTCUT_EVENT = 'cambrian:shortcut';

function fire(e: KeyboardEvent, id: ShortcutId) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent<ShortcutId>(SHORTCUT_EVENT, { detail: id }));
}

/** Subscribe a screen to one shortcut id. */
export function useShortcut(id: ShortcutId, handler: () => void) {
  useEffect(() => {
    const on = (ev: Event) => {
      if ((ev as CustomEvent<ShortcutId>).detail === id) handler();
    };
    window.addEventListener(SHORTCUT_EVENT, on);
    return () => window.removeEventListener(SHORTCUT_EVENT, on);
  }, [id, handler]);
}

function focusFirst(...selectors: string[]): boolean {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) {
      el.focus();
      return true;
    }
  }
  return false;
}

/** Move focus to the next (+1) or previous (-1) `[data-shortcut-row]`. */
export function moveRow(step: 1 | -1): boolean {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'));
  if (rows.length === 0) return false;
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
  rows[next].focus();
  return true;
}
