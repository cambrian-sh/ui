/* Stand-in for `@tauri-apps/api/core` in dev — see ./socket.ts. */
import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core';
import { bridgeInvoke, inTauri } from './socket';

export * from '@tauri-apps/api/core';

export function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  if (inTauri()) return tauriInvoke<T>(cmd, args);
  return bridgeInvoke<T>(cmd, args as Record<string, unknown> | undefined);
}
