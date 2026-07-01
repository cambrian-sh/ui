/* Cambrian Web UI — the projection store.
 *
 * Per UI-004 (Zustand) + UI-005 (realtime sync: replace-on-event).
 *
 * The projection store is the webview-side mirror of the Rust core's
 * StateOfRecord. The fold (replace-on-event + selector-level memo on the
 * consumer side) is implemented here:
 *   - mount: hydrate(state) replaces the store with the latest StateOfRecord
 *   - event: fold(state) replaces the store with the next StateOfRecord
 *   - selectors on the consumer side use shallow equality to skip re-renders
 *
 * `RESYNC_REQUIRED` is handled by re-hydrating (drop the store, call
 * op_get_state again, fold the result). See the kernel's contract.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateOfRecord } from '@/ipc/types';

export interface ProjectionState {
  state: StateOfRecord | null;
  isHydrating: boolean;
  /** Replace the store with the latest snapshot (called on mount). */
  hydrate: (state: StateOfRecord) => void;
  /** Replace the store with the next snapshot (called on every kernel event). */
  fold: (state: StateOfRecord) => void;
  /** Drop the store; the next hydrate re-establishes the projection. */
  reset: () => void;
}

export const projectionStore: StoreApi<ProjectionState> = createStore<ProjectionState>(
  (set) => ({
    state: null,
    isHydrating: true,
    hydrate: (state) => set({ state, isHydrating: false }),
    fold: (state) => set({ state }),
    reset: () => set({ state: null, isHydrating: true }),
  }),
);

/** Read the current projection state. Components subscribe via `useStore` (see below). */
export const getProjection = (): StateOfRecord | null => projectionStore.getState().state;

/** Read the hydration status. */
export const isHydrating = (): boolean => projectionStore.getState().isHydrating;
