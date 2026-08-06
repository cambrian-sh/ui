// What the discovery surface remembers across a route change.
//
// `DiscoverSource` unmounts when the operator visits another tab, and the
// session it held in `useState` died with it — including a session still
// RUNNING in the kernel. Coming back showed an empty form, so a discovery run
// that was minutes from proposing looked like it had never happened.
//
// The session itself was never lost: it lives in the kernel, keeps probing, and
// answers `GetDiscoverySession` throughout. What was lost was the operator's
// place in it — which id they were watching. That is all this remembers; the
// session is re-fetched on mount, so the kernel stays the single source of truth
// and a stale render can never contradict it.
//
// Module-level and in-memory, following `chatSession.ts` and for the same
// reason: this is session context, not a document. Kernel sessions are in-memory
// too, so persisting an id across an app restart would mostly restore a pointer
// to something that no longer exists.

/** The session the operator was last watching for an ingress, by ingress id. */
const watching = new Map<string, string>();

/** The session id to resume for this ingress, or null on a cold surface. */
export function rememberedDiscovery(ingressId: string): string | null {
  if (!ingressId) return null;
  return watching.get(ingressId) ?? null;
}

export function rememberDiscovery(ingressId: string, sessionId: string | null): void {
  if (!ingressId) return;
  // An empty id is indistinguishable from no entry, and keeping it would leave a
  // pointer that resolves to nothing on the next mount.
  if (!sessionId) watching.delete(ingressId);
  else watching.set(ingressId, sessionId);
}

/** Test seam, and what a disconnect should call — a new kernel has new sessions. */
export function clearDiscoverySessions(): void {
  watching.clear();
}
