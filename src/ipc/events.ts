

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { LogRecord, StateOfRecord, TokenChunk } from './types';

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

/**
 * Each tailed log record, as the Rust core receives it (contract 0082).
 *
 * Live-only, like token chunks: the tail carries what happens NEXT. History
 * comes from `queryLogs`, and the two are joined on `seq`.
 */
export async function onLogRecord(fn: (r: LogRecord) => void) {
  return await listen<LogRecord>('kernel://log', (event) => {
    fn(event.payload);
  });
}

/** Where a tail reports that it stopped, and why. */
export async function onLogTailError(fn: (reason: string) => void) {
  return await listen<string>('kernel://log-error', (event) => {
    fn(event.payload);
  });
}
