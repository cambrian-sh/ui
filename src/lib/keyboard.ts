
import type { Role } from '@/ipc/types';

export type ShortcutScope = 'global' | 'chat' | 'plan' | 'memory' | 'audit' | 'shell';

export interface Shortcut {
  keys: string;
  label: string;
  scope: ShortcutScope;
  roles?: Role[];
}

export interface Command {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  action: () => void;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'c', label: 'Focus chat input', scope: 'global' },
  { keys: 'i', label: 'Focus inject input', scope: 'global' },
  { keys: 'j', label: 'Next list row', scope: 'global' },
  { keys: 'k', label: 'Previous list row', scope: 'global' },
  { keys: 'Enter', label: 'Open focused item', scope: 'global' },
  { keys: 'Esc', label: 'Close panel / palette', scope: 'global' },
  { keys: '/', label: 'Focus filter bar', scope: 'global' },
  { keys: 'n', label: 'New tag', scope: 'memory' },
  { keys: 'a', label: 'Approve HITL', scope: 'global' },
  { keys: 'r', label: 'Reject HITL', scope: 'global' },
  { keys: 'e', label: 'Edit HITL', scope: 'global' },
  { keys: '+', label: 'Zoom in', scope: 'plan' },
  { keys: '-', label: 'Zoom out', scope: 'plan' },
  { keys: '0', label: 'Reset zoom', scope: 'plan' },
  { keys: 'Mod+g', label: 'Toggle plan view mode (DAG ↔ list)', scope: 'plan' },
  { keys: 'Mod+k', label: 'Open command palette', scope: 'global' },
  { keys: '?', label: 'Open shortcut palette', scope: 'global' },
];

// The bindings are unchanged — they simply stopped being drawn at 10px next to
// every rail label, and are looked up here, in the palette and the shortcut
// sheet instead.
export const NAV_SHORTCUTS: Array<{ keys: string; label: string; path: string }> = [
  { keys: 'g n', label: 'Go to Now', path: '/' },
  { keys: 'g i', label: 'Go to Inbox', path: '/inbox' },
  { keys: 'g s', label: 'Go to Tasks', path: '/tasks' },
  { keys: 'g p', label: 'Go to Plans', path: '/plans' },
  { keys: 'g a', label: 'Go to Runtime — Agents', path: '/agents' },
  { keys: 'g t', label: 'Go to Runtime — Tools & Skills', path: '/tools' },
  { keys: 'g m', label: 'Go to Runtime — MCP', path: '/mcp' },
  { keys: 'g y', label: 'Go to Memory', path: '/memory' },
  { keys: 'g o', label: 'Go to Scope', path: '/scope' },
  { keys: 'g w', label: 'Go to Watch', path: '/watch' },
  { keys: 'g l', label: 'Go to Lifecycle', path: '/lifecycle' },
  { keys: 'g v', label: 'Go to Verifier', path: '/verifier' },
  { keys: 'g c', label: 'Go to Cost', path: '/cost' },
  { keys: 'g u', label: 'Go to Audit', path: '/audit' },
  { keys: 'g x', label: 'Go to Settings', path: '/settings' },
];
