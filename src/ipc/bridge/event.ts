/* Stand-in for `@tauri-apps/api/event` in dev — see ./socket.ts. */
import { listen as tauriListen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';
import { bridgeListen, inTauri } from './socket';

export * from '@tauri-apps/api/event';

let nextEventId = 1;

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (inTauri()) return tauriListen<T>(event, handler);
  return bridgeListen(event, (payload) =>
    handler({ event, id: nextEventId++, payload: payload as T }),
  );
}
