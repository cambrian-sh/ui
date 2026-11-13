

import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  themeAttr,
  densityAttr,
  type Theme,
  type ThemePreference,
  type Density,
} from '@/design-system';

// Shared with public/theme-boot.js, which applies the theme before React mounts.
const THEME_KEY = 'cambrian-studio:theme';
const DENSITY_KEY = 'cambrian-studio:density';

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice
    // still applies for this session.
  }
}

const darkQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function resolveTheme(pref: ThemePreference): Theme {
  if (pref !== 'system') return pref;
  return darkQuery?.matches ? 'dark' : 'light';
}

const DEFAULT_LEFT_RAIL_W = 240;   // px (PRD-02 §3.1)
const DEFAULT_INSPECTOR_W = 360;  // px (PRD-02 §3.1)
const COMPACT_INSPECTOR_W = 280;  // px (PRD-02 §3.1)

/**
 * Before the Studio redesign, appearance lived as one JSON object under this key
 * (main's per-viewer persistence). Read it once so an operator's saved choice
 * survives the move to the per-preference keys public/theme-boot.js reads.
 */
const LEGACY_APPEARANCE_KEY = 'cambrian.shell.appearance';

function migrateLegacyAppearance() {
  try {
    if (localStorage.getItem(THEME_KEY) || localStorage.getItem(DENSITY_KEY)) return;
    const raw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { theme?: string; density?: string };
    if (v.theme) writePref(THEME_KEY, v.theme);
    if (v.density) writePref(DENSITY_KEY, v.density);
    localStorage.removeItem(LEGACY_APPEARANCE_KEY);
  } catch {
    /* best-effort: defaults apply */
  }
}
migrateLegacyAppearance();

export interface ShellState {
  leftRailCollapsed: boolean;
  rightInspectorCollapsed: boolean;
  leftRailWidth: number;
  rightInspectorWidth: number;
  density: Density;
  /** The operator's choice. */
  themePreference: ThemePreference;
  /** What is rendered — the preference with `system` resolved. */
  theme: Theme;
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

export const shellStore: StoreApi<ShellState & ShellActions> = createStore<
  ShellState & ShellActions
>((set, get) => ({
  leftRailCollapsed: false,
  rightInspectorCollapsed: false,
  leftRailWidth: DEFAULT_LEFT_RAIL_W,
  rightInspectorWidth: DEFAULT_INSPECTOR_W,
  density: readPref<Density>(DENSITY_KEY, ['compact', 'default', 'spacious'], 'compact'),
  themePreference: readPref<ThemePreference>(
    THEME_KEY,
    ['system', 'light', 'dark', 'nocturne'],
    'system',
  ),
  theme: resolveTheme(
    readPref<ThemePreference>(THEME_KEY, ['system', 'light', 'dark', 'nocturne'], 'system'),
  ),

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
    writePref(DENSITY_KEY, d);
    applyToDocument(get().theme, d);
  },

  setTheme: (pref) => {
    const theme = resolveTheme(pref);
    set({ themePreference: pref, theme });
    writePref(THEME_KEY, pref);
    applyToDocument(theme, get().density);
  },
}));

// Follow the OS while the preference is `system`.
darkQuery?.addEventListener?.('change', () => {
  const { themePreference, setTheme } = shellStore.getState();
  if (themePreference === 'system') setTheme('system');
});

export function useShellSelector<T>(selector: (s: ShellState & ShellActions) => T): T {
  // This is a vanilla store; the React hook is wired in UI-IMPL-08 (the shell)
  // with a thin subscription. For now, callers can use shellStore.getState().
  return selector(shellStore.getState());
}

// Apply the stored appearance at startup (theme-boot.js already did, before React mounted).
applyToDocument(shellStore.getState().theme, shellStore.getState().density);
