import { useSyncExternalStore, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";

export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => Object.is(val, (b as unknown as typeof a)[i]));
  }
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}


export function useStore<T>(store: StoreApi<T>): T;
export function useStore<T, U>(store: StoreApi<T>, selector: (state: T) => U): U;
export function useStore<T, U>(store: StoreApi<T>, selector?: (state: T) => U): T | U {
  if (!selector) {
    return useSyncExternalStore(
      (cb) => store.subscribe(cb),
      () => store.getState(),
      () => store.getState(),
    );
  }

  // With selector: use ref to track last value
  const snapRef = useRef<U>(undefined as unknown as U);
  const initRef = useRef(false);

  return useSyncExternalStore(
    (cb) =>
      store.subscribe(() => {
        const next = selector(store.getState());
        if (!initRef.current || !shallow(snapRef.current, next)) {
          snapRef.current = next;
          initRef.current = true;
          cb();
        }
      }),
    () => {
      if (!initRef.current) {
        snapRef.current = selector(store.getState());
        initRef.current = true;
      }
      return snapRef.current;
    },
    () => {
      if (!initRef.current) {
        snapRef.current = selector(store.getState());
        initRef.current = true;
      }
      return snapRef.current;
    },
  );
}
