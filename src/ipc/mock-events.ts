/* `@/ipc/events` in mock mode (VITE_USE_MOCK_IPC=1): the same subscriptions,
 * served by the in-memory mock instead of Tauri's event bus. */
import type { LogRecord } from './types';

export { onKernelState, onKernelToken } from './mock';

/** The mock does not stream logs; history comes from `ipc.queryLogs`. */
export async function onLogRecord(_fn: (r: LogRecord) => void): Promise<() => void> {
  return () => {};
}

export async function onLogTailError(_fn: (reason: string) => void): Promise<() => void> {
  return () => {};
}
