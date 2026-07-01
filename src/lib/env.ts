/* Cambrian Web UI — runtime environment helpers.
 *
 * Per the spec §5.1 + §6.2: detect whether the webview is running inside
 * the Tauri shell or in the browser with the mock IPC (dev mode
 * `VITE_USE_MOCK_IPC=1`).
 *
 * Use sparingly — most of the code should NOT branch on environment.
 * The IPC layer is the only place that needs to know, and it handles
 * the swap at build time via the Vite alias in `vite.config.ts`.
 *
 * These helpers exist for the test setup (UI-IMPL-15) and for any
 * future surface that genuinely needs to know (e.g. showing a
 * "mock mode" pill in the status strip — out of scope for V1).
 */

export function isTauri(): boolean {
  // Tauri 2 injects `__TAURI_INTERNALS__` on the window when running
  // inside the Tauri shell. In a plain browser (dev mock mode) it's absent.
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isMockIPC(): boolean {
  // Vite bakes `VITE_USE_MOCK_IPC=1` into the bundle at build time when
  // the env var is set; otherwise it's `undefined`. The Vite alias for
  // `@/ipc` reads the same env var at build time.
  return import.meta.env.VITE_USE_MOCK_IPC === '1';
}
