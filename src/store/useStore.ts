import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";

/**
 * Subscribe a React component to a Zustand vanilla store.
 * The canonical pattern for external stores in React 18+ (per UI-004).
 * Returns the current store state; the component re-renders on every update.
 */
export function useStore<T>(store: StoreApi<T>): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
    () => store.getState(),
  );
}
