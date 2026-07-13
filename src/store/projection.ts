

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateOfRecord } from '@/ipc/types';

export interface ProjectionState {
  state: StateOfRecord | null;
  isHydrating: boolean;
  hydrate: (state: StateOfRecord) => void;
  fold: (state: StateOfRecord) => void;
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

export const getProjection = (): StateOfRecord | null => projectionStore.getState().state;

export const isHydrating = (): boolean => projectionStore.getState().isHydrating;
