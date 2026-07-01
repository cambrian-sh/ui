/* Command palette (Cmd/Ctrl-K) — PRD-01 §9.1 + UI-IMPL-14.
 *
 * Global overlay. `Mod+k` toggles it (handled in Shell). Fzf-style
 * filter; the actions are navigable routes + toggles. The palette
 * renders the navigable commands with their shortcut hints.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { NAV_SHORTCUTS, SHORTCUTS } from '@/lib/keyboard';
import { shellStore } from '@/store/shell';

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo(() => {
    const nav = NAV_SHORTCUTS.map((n) => ({
      id: `nav:${n.path}`,
      label: n.label,
      hint: n.keys,
      action: () => {
        navigate({ to: n.path });
        onClose();
      },
    }));
    const shell = [
      {
        id: 'shell:toggle-theme',
        label: 'Toggle theme (light / dark)',
        hint: 't',
        action: () => {
          const next = shellStore.getState().theme === 'dark' ? 'light' : 'dark';
          shellStore.getState().setTheme(next);
          onClose();
        },
      },
      {
        id: 'shell:toggle-density',
        label: 'Toggle density (compact / default / spacious)',
        hint: 'd',
        action: () => {
          const cycle = ['compact', 'default', 'spacious'] as const;
          const cur = shellStore.getState().density;
          const idx = cycle.indexOf(cur);
          const next = cycle[(idx + 1) % cycle.length];
          shellStore.getState().setDensity(next);
          onClose();
        },
      },
      {
        id: 'shell:toggle-right-inspector',
        label: 'Toggle right inspector',
        hint: 'i',
        action: () => {
          shellStore.getState().toggleRightInspector();
          onClose();
        },
      },
    ];
    return [...nav, ...shell];
  }, [navigate, onClose]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-[var(--dialog-overlay-bg)]"
      onClick={onClose}
    >
      <div
        className="w-[36rem] max-w-[90vw] rounded-sm border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              filtered[highlight]?.action();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Type a command…"
          aria-label="Command search"
          className="w-full rounded-t-sm border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--fg-primary)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none"
        />
        <ul role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--fg-muted)]">No matches.</li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={c.action}
                  className={
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ' +
                    (i === highlight ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]')
                  }
                >
                  <span className="truncate text-[var(--fg-primary)]">{c.label}</span>
                  {c.hint && (
                    <kbd className="shrink-0 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
                      {c.hint}
                    </kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function ShortcutPalette({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-[var(--dialog-overlay-bg)]"
      onClick={onClose}
    >
      <div
        className="w-[40rem] max-w-[90vw] rounded-sm border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[var(--border-subtle)] px-3 py-2">
          <h2 className="text-sm font-semibold text-[var(--fg-primary)]">Keyboard shortcuts</h2>
          <p className="text-[10px] text-[var(--fg-muted)]">17 V1 shortcuts. The command palette (Mod+K) lists the navigable subset.</p>
        </header>
        <ul className="max-h-[60vh] grid grid-cols-1 gap-px overflow-y-auto bg-[var(--border-subtle)] sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-2 bg-[var(--bg-surface)] px-3 py-1.5 text-xs">
              <span className="text-[var(--fg-primary)]">{s.label}</span>
              <kbd className="shrink-0 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
