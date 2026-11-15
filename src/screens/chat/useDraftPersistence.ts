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
  // The one unwritten edit, with the key it was TYPED under. A write carries its
  // own key rather than the key of whichever `flush` closure happens to run it:
  // React defers passive effects, so a keystroke can land between the commit
  // that switches the id and the previous id's cleanup. That cleanup used to
  // cancel the new id's debounce timer and write `latest` under the OLD key —
  // the half-written message vanished from the conversation it was typed in and
  // turned up in the one the operator had left (the /chat draft test failed this
  // way under load; T-20261115-readiness-run-failures-bench-pytest-exceeds-2).
  const pending = useRef<{ key: string; value: string } | null>(null);
  const loadedKey = useRef<string>(key(scope, id));

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (!p) return; // nothing typed since the last write: storage already holds it
    try {
      localStorage.setItem(p.key, JSON.stringify({ value: p.value, updatedAt: new Date().toISOString() }));
    } catch {
      // Best effort (quota, private mode): the draft stays in component state.
    }
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  // Re-key: load the new id's draft. Skipped on mount, where the initial state
  // already read it. The outgoing id's edit is safe whatever the timing: it is
  // pending under its own key and `flush` writes it there.
  useEffect(() => {
    const k = key(scope, id);
    if (k === loadedKey.current) return;
    loadedKey.current = k;
    // Write anything still pending first: an edit typed under this new id before
    // this effect ran is then read straight back instead of being replaced.
    flush();
    setValue(readDraft(scope, id));
  }, [scope, id, flush]);

  const onChange = useCallback(
    (next: string) => {
      const k = key(scope, id);
      // An edit pending under another key belongs to that key: write it now
      // rather than let this one overwrite it.
      if (pending.current && pending.current.key !== k) flush();
      setValue(next);
      pending.current = { key: k, value: next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [scope, id, flush],
  );

  return [value, onChange, flush];
}
