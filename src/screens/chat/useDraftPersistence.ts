import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 200;

function instanceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  return (window.location.hostname || 'localhost') + ':' + (window.location.port || '1420');
}

function key(scope: 'chat' | 'inject', id: string): string {
  return `draft:${instanceId()}:${scope}:${id}`;
}

function readDraft(scope: 'chat' | 'inject', id: string): string {
  try {
    const raw = localStorage.getItem(key(scope, id));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { value?: string };
    return parsed.value ?? '';
  } catch {
    return '';
  }
}

type Flush = () => void;

/**
 * A composer draft that outlives the process (UI-009 / PRD-03 §11, Story 53).
 *
 * Keyed by `scope` and `id`, so each conversation (or session, or plan inject)
 * keeps its own half-written sentence. The id may CHANGE while the component
 * stays mounted — the /chat screen swaps conversations in place rather than
 * remounting — and when it does, the outgoing draft is flushed under its own
 * key and the incoming conversation's draft is loaded. Without that, switching
 * conversations carried the text across, and the draft of the one you left was
 * overwritten by the one you arrived in.
 */
export function useDraftPersistence(scope: 'chat' | 'inject', id: string): [string, (next: string) => void, Flush] {
  const [value, setValue] = useState<string>(() => readDraft(scope, id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string>(value);
  const loadedKey = useRef<string>(key(scope, id));

  useEffect(() => {
    latest.current = value;
  }, [value]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      localStorage.setItem(key(scope, id), JSON.stringify({ value: latest.current, updatedAt: new Date().toISOString() }));
    } catch {
    }
  }, [scope, id]);

  useEffect(() => {
    const onBeforeUnload = () => flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  // Re-key: the cleanup above has already flushed the previous id's draft
  // (React runs every cleanup before any new effect body), so what is held now
  // belongs to the new id. Skipped on mount, where the initial state already
  // read it.
  useEffect(() => {
    const k = key(scope, id);
    if (k === loadedKey.current) return;
    loadedKey.current = k;
    const next = readDraft(scope, id);
    latest.current = next;
    setValue(next);
  }, [scope, id]);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  return [value, onChange, flush];
}
