

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

/** What the operator chose. `system` follows the OS (prefers-color-scheme). */
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'cambrian.shell.appearance';

function systemTheme(): Theme {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(pref: ThemePreference): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

/**
 * Appearance is a per-viewer convenience, so it lives in localStorage — it used
 * to live only in memory, and every restart came back dark. Every access is
 * guarded: storage can be absent or throw.
 */
function loadAppearance(): { theme: ThemePreference; density: Density } {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const v = JSON.parse(raw) as { theme?: string; density?: string };
      const theme = v.theme === 'light' || v.theme === 'dark' || v.theme === 'system' ? v.theme : 'dark';
      const density = v.density === 'default' || v.density === 'spacious' || v.density === 'compact' ? v.density : 'compact';
      return { theme, density };
    }
  } catch {
    /* fall through to defaults */
  }
  return { theme: 'dark', density: 'compact' };
}

function saveAppearance(theme: ThemePreference, density: Density) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, density }));
  } catch {
    /* best-effort: a private window simply forgets */
  }
}

export interface ShellState {
  leftRailCollapsed: boolean;
  rightInspectorCollapsed: boolean;
  leftRailWidth: number;
  rightInspectorWidth: number;
  density: Density;
  /** The resolved theme applied to the document. */
  theme: Theme;
  /** What the operator picked (may be `system`). */
  themePreference: ThemePreference;
}

export interface ShellActions {
  toggleLeftRail: () => void;
  toggleRightInspector: () => void;
  setLeftRailWidth: (w: number) => void;
  setRightInspectorWidth: (w: number) => void;
  setDensity: (d: Density) => void;
  setTheme: (t: ThemePreference) => void;
}

function applyToDocument(theme: Theme, density: Density) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(themeAttr, theme);
    document.documentElement.setAttribute(densityAttr, density);
  }
}

const initial = loadAppearance();

export const shellStore: StoreApi<ShellState & ShellActions> = createStore<
  ShellState & ShellActions
>((set, get) => ({
  leftRailCollapsed: false,
  rightInspectorCollapsed: false,
  leftRailWidth: DEFAULT_LEFT_RAIL_W,
  rightInspectorWidth: DEFAULT_INSPECTOR_W,
  density: initial.density,
  theme: resolveTheme(initial.theme),
  themePreference: initial.theme,

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
    saveAppearance(get().themePreference, d);
  },

  setTheme: (pref) => {
    const t = resolveTheme(pref);
    set({ theme: t, themePreference: pref });
    applyToDocument(t, get().density);
    saveAppearance(pref, get().density);
  },
}));

export function useShellSelector<T>(selector: (s: ShellState & ShellActions) => T): T {
  // This is a vanilla store; the React hook is wired in UI-IMPL-08 (the shell)
  // with a thin subscription. For now, callers can use shellStore.getState().
  return selector(shellStore.getState());
}

// Apply the stored appearance at startup, and follow the OS while `system` is chosen.
applyToDocument(shellStore.getState().theme, shellStore.getState().density);
try {
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    const { themePreference, density } = shellStore.getState();
    if (themePreference !== 'system') return;
    const t = resolveTheme('system');
    shellStore.setState({ theme: t });
    applyToDocument(t, density);
  });
} catch {
  /* no matchMedia (tests) */
}
