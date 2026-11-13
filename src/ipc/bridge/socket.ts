/* Dev bridge client — the browser end of src-tauri/src/dev_bridge.
 *
 * Development only. When the webview runs in a plain browser tab (no Tauri
 * internals), Vite resolves `@tauri-apps/api/core` and `/event` to these
 * modules, which carry invoke/listen over a WebSocket to the running Studio's
 * Rust core. Inside the native window they delegate to the real Tauri API, so
 * one dev server serves both. Production builds never include this.
 */

export const BRIDGE_URL = 'ws://127.0.0.1:1430';

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
type Handler = (payload: unknown) => void;

const pending = new Map<number, Pending>();
const handlers = new Map<string, Set<Handler>>();
const queue: string[] = [];
let socket: WebSocket | null = null;
let nextId = 1;
let retry = 500;

function unreachable(): string {
  return 'Dev bridge not reachable at ' + BRIDGE_URL + '. Start Studio with `bun run studio`.';
}

function connect(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const ws = new WebSocket(BRIDGE_URL);
  socket = ws;
  ws.onopen = () => {
    retry = 500;
    while (queue.length) ws.send(queue.shift()!);
  };
  ws.onmessage = (msg) => {
    const frame = JSON.parse(String(msg.data));
    if (typeof frame.event === 'string') {
      handlers.get(frame.event)?.forEach((h) => h(frame.payload));
      return;
    }
    const p = pending.get(frame.id);
    if (!p) return;
    pending.delete(frame.id);
    if (frame.ok) p.resolve(frame.value);
    else p.reject(frame.error);
  };
  ws.onclose = () => {
    socket = null;
    // In-flight calls will never be answered; fail them the way Tauri would,
    // with a string, so the screens show their normal error state.
    pending.forEach((p) => p.reject(unreachable()));
    pending.clear();
    queue.length = 0;
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 10_000);
  };
  return ws;
}

export function bridgeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const ws = connect();
  const id = nextId++;
  const frame = JSON.stringify({ id, cmd, args: args ?? {} });
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    else queue.push(frame);
  });
}

export function bridgeListen(event: string, handler: Handler): () => void {
  connect();
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(handler);
  return () => set!.delete(handler);
}

export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
