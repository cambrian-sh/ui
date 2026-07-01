/* Cambrian Web UI — the shell chrome slice.
 *
 * Per PRD-02 §3.3 (panel widths persisted per operator per device) +
 * PRD-02 §4.7 (density + theme on the shell).
 *
 * State: panel collapse, panel widths, density, theme. Actions: toggle,
 * set, persist. The shell consumes this store; the nav-rail footer's
 * theme + density toggles write to it.
 *
 * Persistence (localStorage) is a follow-on; V1 holds the values in memory
 * and re-applies the data-theme / data-density attributes on <html> on change.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  themeAttr,
  densityAttr,
  type Theme,
  type Density,
} from '@/design-system';

const DEFAULT_LEFT_RAIL_W = 240;   // px (PRD-02 §3.1)
const DEFAULT_INSPECTOR_W = 360;  // px (PRD-02 §3.1)
const COMPACT_INSPECTOR_W = 280;  // px (PRD-02 §3.1)

export interface ShellState {
  leftRailCollapsed: boolean;
  rightInspectorCollapsed: boolean;
  leftRailWidth: number;
  rightInspectorWidth: number;
  density: Density;
  theme: Theme;
}

export interface ShellActions {
  toggleLeftRail: () => void;
  toggleRightInspector: () => void;
  setLeftRailWidth: (w: number) => void;
  setRightInspectorWidth: (w: number) => void;
  setDensity: (d: Density) => void;
  setTheme: (t: Theme) => void;
}

function applyToDocument(theme: Theme, density: Density) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(themeAttr, theme);
    document.documentElement.setAttribute(densityAttr, density);
  }
}

export const shellStore: StoreApi<ShellState & ShellActions> = createStore<
  ShellState & ShellActions
>((set, get) => ({
  leftRailCollapsed: false,
  rightInspectorCollapsed: false,
  leftRailWidth: DEFAULT_LEFT_RAIL_W,
  rightInspectorWidth: DEFAULT_INSPECTOR_W,
  density: 'compact',
  theme: 'dark',

  toggleLeftRail: () => set((s) => ({ leftRailCollapsed: !s.leftRailCollapsed })),

  toggleRightInspector: () =>
    set((s) => ({ rightInspectorCollapsed: !s.rightInspectorCollapsed })),

  setLeftRailWidth: (w) => set({ leftRailWidth: Math.max(56, Math.min(480, w)) }),

  setRightInspectorWidth: (w) => {
    const density = get().density;
    const cap = density === 'compact' ? COMPACT_INSPECTOR_W : DEFAULT_INSPECTOR_W;
    set({ rightInspectorWidth: Math.max(0, Math.min(cap, w)) });
  },

  setDensity: (d) => {
    set({ density: d });
    applyToDocument(get().theme, d);
  },

  setTheme: (t) => {
    set({ theme: t });
    applyToDocument(t, get().density);
  },
}));

/** React hook for subscribing to the shell store with a selector. */
export function useShellSelector<T>(selector: (s: ShellState & ShellActions) => T): T {
  // This is a vanilla store; the React hook is wired in UI-IMPL-08 (the shell)
  // with a thin subscription. For now, callers can use shellStore.getState().
  return selector(shellStore.getState());
}
