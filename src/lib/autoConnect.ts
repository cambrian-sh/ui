import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import type { SavedConnection } from '@/ipc/types';

/**
 * Reconnect to the last Cambrian instance, once per app launch.
 *
 * The Rust core already keeps the last endpoint, username and password in the OS keychain
 * (`op_login_saved` exists precisely for this), but the only caller was the connection panel
 * — so the reconnect happened when you navigated to Settings, not when the app started. On
 * launch the app sat disconnected until you went looking for the screen that would connect it.
 *
 * This runs the attempt from the Shell instead, so it happens at launch regardless of which
 * route is showing.
 *
 * Idempotent by construction: the first caller starts the attempt and every later caller
 * awaits the SAME promise. That matters because both the Shell and the connection panel call
 * it, and two concurrent logins against one kernel would race for the token.
 */
export interface AutoConnectResult {
  /** The saved instance, or null when the keychain holds nothing. */
  saved: SavedConnection | null;
  /** True when a login was actually attempted (i.e. something was saved). */
  attempted: boolean;
  /** Failure reason — an expired or rejected credential, say. Null on success. */
  error: string | null;
}

let inFlight: Promise<AutoConnectResult> | null = null;

async function attempt(): Promise<AutoConnectResult> {
  // A missing keychain entry is the normal first-run case, not an error.
  const saved = await ipc.savedConnection().catch(() => null);
  if (!saved) {
    return { saved: null, attempted: false, error: null };
  }
  try {
    await ipc.loginSaved();
    return { saved, attempted: true, error: null };
  } catch (err) {
    // Report rather than throw: a stale credential must leave the operator on a usable
    // connection panel with the reason visible, not crash the shell at launch.
    return { saved, attempted: true, error: errorMessage(err) };
  }
}

/**
 * Attempt the saved-connection login. Safe to call from anywhere and any number of times;
 * only the first call does work.
 */
export function autoConnectOnce(): Promise<AutoConnectResult> {
  if (!inFlight) {
    inFlight = attempt();
  }
  return inFlight;
}

/** Test seam: forget that an attempt was made. */
export function resetAutoConnectForTests() {
  inFlight = null;
}
