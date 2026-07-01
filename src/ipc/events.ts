/* Cambrian Web UI — the Tauri event channel listeners.
 *
 * Per EC-4 + the technical document §5.2.
 * Two event channels: kernel://state (full StateOfRecord snapshots) +
 * kernel://token (live-only token chunks, never replayed).
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { StateOfRecord, TokenChunk } from './types';

export async function onKernelState(
  fn: (state: StateOfRecord) => void,
): Promise<UnlistenFn> {
  return await listen<StateOfRecord>('kernel://state', (event) => {
    fn(event.payload);
  });
}

export async function onKernelToken(
  fn: (chunk: TokenChunk) => void,
): Promise<UnlistenFn> {
  return await listen<TokenChunk>('kernel://token', (event) => {
    fn(event.payload);
  });
}
