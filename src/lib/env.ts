

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
