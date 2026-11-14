import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from '@tanstack/react-router';
import { NAV_SHORTCUTS } from '@/lib/keyboard';

/**
 * Binds the "g <key>" navigation chords listed in `NAV_SHORTCUTS` (UI-007).
 *
 * The shortcut sheet and the command palette advertised these for a long time
 * while nothing bound them (T-20261113-advertised-keyboard-shortcuts-g-chords-a-r-e-on).
 * Each one does exactly what its palette entry does — navigate to a rail
 * destination — so binding it adds no new authority: the Shell's
 * `routeAllowedForRole` guard and each screen's own capability gate still
 * decide what renders there.
 *
 * One component per chord keeps `useHotkeys` at a fixed call site per binding
 * (rules of hooks) while the list stays data in `lib/keyboard.ts`. Typing in an
 * input never triggers a chord: react-hotkeys-hook ignores form fields unless
 * told otherwise.
 */
export function NavChords() {
  return (
    <>
      {NAV_SHORTCUTS.map((s) => (
        <NavChord key={s.keys} keys={s.keys} path={s.path} />
      ))}
    </>
  );
}

/** "g c" (the sheet's notation) → "g>c" (react-hotkeys-hook's sequence syntax). */
export function toSequence(keys: string): string {
  return keys.trim().split(/\s+/).join('>');
}

function NavChord({ keys, path }: { keys: string; path: string }) {
  const navigate = useNavigate();
  useHotkeys(toSequence(keys), (e) => {
    e.preventDefault();
    void navigate({ to: path });
  });
  return null;
}
