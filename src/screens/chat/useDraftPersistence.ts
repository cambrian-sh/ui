
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

export function useDraftPersistence(scope: 'chat' | 'inject', id: string): [string, (next: string) => void, Flush] {
  const [value, setValue] = useState<string>(() => readDraft(scope, id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string>(value);

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
