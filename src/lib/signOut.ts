import { ipc } from '@/ipc';
import type { LogoutOutcome } from '@/ipc/types';
import { errorMessage } from '@/lib/errorMessage';
import { queryClient } from '@/lib/queryClient';
import { clearChatSession } from '@/screens/chat/chatSession';
import { clearDiscoverySessions } from '@/screens/ingress-studio/discoverySession';

/**
 * Sign out (contract 0099 `Logout`, ADR-0130 D5).
 *
 * The Rust core revokes the token on the kernel and then tears the session down
 * exactly as a disconnect does — token, keychain copy, saved credentials, folded
 * state. This half drops what the WEBVIEW holds about that kernel: cached kernel
 * reads and the chat / discovery session pointers, none of which may survive
 * into the next sign-in (possibly as someone else, possibly on another kernel).
 *
 * Call it only when the kernel advertises `logout`; without it, Disconnect is the
 * honest action (the token is forgotten here and stays valid on the kernel).
 *
 * The outcome is kept for the login screen to show once: "signed out, but the
 * kernel did not revoke the token" is worth saying, and the caller navigates
 * away from wherever the operator clicked.
 */
let lastNote: string | null = null;

export async function signOut(): Promise<LogoutOutcome> {
  let outcome: LogoutOutcome;
  try {
    outcome = await ipc.logout();
  } catch (err) {
    // The local teardown failed (it is not supposed to). Still drop the webview's
    // copy, and say so rather than pretending the sign-out was clean.
    outcome = { revoked: false, note: `sign-out did not complete: ${errorMessage(err)}` };
  }
  clearChatSession();
  clearDiscoverySessions();
  queryClient.clear();
  lastNote = outcome.revoked ? null : outcome.note;
  return outcome;
}

/** The note from the last sign-out, returned once and then forgotten. */
export function takeSignOutNote(): string | null {
  const n = lastNote;
  lastNote = null;
  return n;
}
