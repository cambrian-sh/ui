// What the chat screen remembers across a route change.
//
// `ChatConsole` unmounts when the operator visits another tab, and everything it
// held in `useState` died with it: which conversation they were in, the router's
// reading of their sentence, the proposal they were weighing, and the outcome of
// the run they had just approved. Coming back re-listed the conversations and
// selected `list[0]` — so the screen either jumped to a different conversation
// than the one they left, or looked like the history had been wiped.
//
// The MESSAGES were never lost; they are durable in the kernel and re-fetched on
// every mount. What was lost was the *place* and the *work in progress* around
// them, which is what makes it read as lost history.
//
// Deliberately module-level and in-memory rather than `localStorage`: this is
// session context, not a document. Reopening the app on a new day should not
// restore a half-approved proposal from the last one — see `useDraftPersistence`
// for the things that DO deserve to outlive the process.

import type {
  ClassifiedInput,
  InterviewQuestion,
  PlanProposal,
  SubmitPlanResult,
} from '@/ipc/types';

/**
 * The shaping state around a conversation: what the router made of the last
 * sentence and what came of it. Per conversation, because carrying a proposal
 * from one conversation into another is how you approve the wrong plan.
 */
export interface ChatWorkState {
  /** The sentence the router read. The interview and an overrule both act on
   *  it, long after the composer has been cleared. */
  goal: string;
  classified: ClassifiedInput | null;
  proposal: PlanProposal | null;
  questions: InterviewQuestion[];
  answers: string[];
  accessNote: string;
  started: SubmitPlanResult | null;
}

export const EMPTY_WORK: ChatWorkState = {
  goal: '',
  classified: null,
  proposal: null,
  questions: [],
  answers: [],
  accessNote: '',
  started: null,
};

let activeConversationId: string | null = null;
const work = new Map<string, ChatWorkState>();

/** The conversation the operator was last in, or null on a cold screen. */
export function rememberedConversation(): string | null {
  return activeConversationId;
}

export function rememberConversation(id: string | null): void {
  activeConversationId = id;
}

/** The shaping state for a conversation. Never null — an unknown id is empty. */
export function rememberedWork(id: string | null): ChatWorkState {
  if (!id) return EMPTY_WORK;
  return work.get(id) ?? EMPTY_WORK;
}

export function rememberWork(id: string | null, state: ChatWorkState): void {
  if (!id) return;
  // An entry that holds nothing is indistinguishable from no entry, and keeping
  // it would grow the map for every conversation the operator merely glanced at.
  const empty =
    !state.classified &&
    !state.proposal &&
    state.questions.length === 0 &&
    !state.accessNote &&
    !state.started;
  if (empty) work.delete(id);
  else work.set(id, state);
}

/** Test seam, and what a disconnect should call — none of this survives a kernel change. */
export function clearChatSession(): void {
  activeConversationId = null;
  work.clear();
}
