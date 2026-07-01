/* Cambrian Web UI — the IPC module barrel.
 *
 * Re-exports the typed Tauri IPC client (`./client.ts`) and the event
 * channel listeners (`./events.ts`) under the single `@/ipc` entry point
 * that the rest of the webview uses.
 *
 * Conventions:
 *   - Commands (9 existing + 2 new Tauri RPCs): `import { ipc } from "@/ipc"`.
 *   - Event listeners (kernel://state, kernel://token): `import { onKernelState, onKernelToken } from "@/ipc"`.
 *   - Types (StateOfRecord, params, responses): `import type { ... } from "@/ipc/types"`
 *     (kept on a separate import path so type-only imports stay explicit and
 *     the mock can mirror the same shape without circular exports).
 *   - Tests use `@/ipc/mock`, not `@/ipc` (the mock is a drop-in replacement
 *     for `./client.ts`, not a re-export of the production client).
 *
 * Per EC-4: gRPC lives in the Rust core only. The webview talks to the
 * Rust core exclusively through this IPC layer.
 */

export { ipc, type IPC } from './client';
export { onKernelState, onKernelToken } from './events';
