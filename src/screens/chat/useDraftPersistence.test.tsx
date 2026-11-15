import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftPersistence } from './useDraftPersistence';

// UI-009 drafts. The race these tests pin (T-20261115-readiness-run-failures-bench-pytest-exceeds-2):
// React runs passive effects after the commit, so a keystroke can land between the
// render that switches the conversation id and the previous id's effect cleanup. The
// late cleanup used to cancel the new id's debounce and write the text under the OLD
// key, so the message vanished from the conversation it was typed in. Under act() the
// cleanup cannot be delayed, so the tests call the previous id's `flush` by hand at
// the point where the delayed cleanup would run.

function stored(scope: 'chat' | 'inject', id: string): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('draft:') && k.endsWith(`:${scope}:${id}`)) {
      const raw = localStorage.getItem(k);
      return raw ? ((JSON.parse(raw) as { value?: string }).value ?? '') : null;
    }
  }
  return null;
}

describe('useDraftPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a late flush from the previous id does not steal an edit typed under the new id', () => {
    const { result, rerender } = renderHook(({ id }) => useDraftPersistence('chat', id), {
      initialProps: { id: 'new' },
    });
    const flushOfPreviousId = result.current[2];
    rerender({ id: 'conv-1' });

    act(() => result.current[1]('anything refunded twice?'));
    act(() => flushOfPreviousId()); // the previous id's cleanup, arriving late
    act(() => vi.advanceTimersByTime(500));

    expect(stored('chat', 'conv-1')).toBe('anything refunded twice?');
    expect(stored('chat', 'new')).toBeNull();
    expect(result.current[0]).toBe('anything refunded twice?');
  });

  it('switching ids writes the outgoing edit under its own key and loads the incoming draft', () => {
    const seed = renderHook(() => useDraftPersistence('chat', 'b'));
    act(() => seed.result.current[1]('kept for b'));
    seed.unmount();
    const { result, rerender } = renderHook(({ id }) => useDraftPersistence('chat', id), {
      initialProps: { id: 'a' },
    });
    act(() => result.current[1]('typed in a'));
    rerender({ id: 'b' }); // before the 200 ms debounce fires

    expect(stored('chat', 'a')).toBe('typed in a');
    expect(result.current[0]).toBe('kept for b');
    act(() => vi.advanceTimersByTime(500));
    expect(stored('chat', 'b')).toBe('kept for b');
  });

  it('debounces writes and survives a remount', () => {
    const first = renderHook(() => useDraftPersistence('inject', 's1'));
    act(() => first.result.current[1]('half'));
    expect(stored('inject', 's1')).toBeNull();
    act(() => vi.advanceTimersByTime(250));
    expect(stored('inject', 's1')).toBe('half');
    act(() => first.result.current[1]('half written'));
    first.unmount(); // unmount flushes the pending edit

    const second = renderHook(() => useDraftPersistence('inject', 's1'));
    expect(second.result.current[0]).toBe('half written');
  });
});
