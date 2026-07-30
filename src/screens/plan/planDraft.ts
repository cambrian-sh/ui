// The handoff between the chat proposal card and the builder (`12a` §C.2 →
// `12b`).
//
// "Open in the builder" has to carry the proposed steps across a route change.
// A module-level slot rather than a URL parameter or a store subscription: a
// plan is too large to put in a query string, and this is a ONE-SHOT handoff —
// the builder takes it on mount and clears it, so a later visit does not
// silently reopen a plan the operator already dealt with.

import type { AuthoredStep } from '@/ipc/types';

export interface PlanDraft {
  title: string;
  steps: AuthoredStep[];
}

let pending: PlanDraft | null = null;

/** Hand a proposal to the builder. Overwrites any undelivered draft. */
export function setPlanDraft(draft: PlanDraft): void {
  pending = draft;
}

/**
 * Take the pending draft, if any. Consuming it clears the slot — reopening the
 * builder later should show what the operator left there, not resurrect a
 * proposal from an earlier conversation.
 */
export function takePlanDraft(): PlanDraft | null {
  const d = pending;
  pending = null;
  return d;
}

/** Test seam. */
export function clearPlanDraft(): void {
  pending = null;
}
