/**
 * Normalize a caught value into a displayable message.
 *
 * Tauri's `invoke` rejects with a plain STRING (the Rust command's `Err(String)`),
 * not an `Error`. Code that only checks `instanceof Error` therefore throws away
 * every message the kernel sent and shows a generic fallback — which is exactly
 * the silent-failure the honesty rule forbids.
 */
export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err === null || err === undefined) return fallback;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
