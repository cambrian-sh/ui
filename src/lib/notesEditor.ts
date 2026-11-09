import type { NotesDocument, NotesWriteResult } from '@/ipc/types';

/**
 * The memory-notes editor's state machine (ADR-0139 D14).
 *
 * Saves are optimistic-concurrency: the editor sends the etag it STARTED from as
 * `if_match`. If someone (an operator, or the agent writing through
 * ProposeMemoryNote) saved in between, the kernel answers `accepted=false,
 * rejection="conflict"`. The editor then fetches the current version and holds
 * BOTH: the operator chooses to keep their draft (re-save against the new etag —
 * a deliberate overwrite) or take theirs (discard the draft). Nothing is merged
 * silently, and nothing is overwritten without the choice.
 *
 * Other rejections (over_budget, injection_flagged, scope_denied) keep the draft
 * and say why; `injection_flagged` can be overridden by an operator with a reason.
 */

export type NotesEditorStatus = 'clean' | 'dirty' | 'saving' | 'conflict' | 'rejected' | 'saved';

export interface NotesEditorState {
  status: NotesEditorStatus;
  /** The version the draft was started from (its etag is the if_match). */
  base: NotesDocument;
  draft: string;
  /** On conflict: the version that won. */
  theirs: NotesDocument | null;
  rejection: string;
  detail: string;
}

export type NotesEditorEvent =
  | { type: 'edit'; draft: string }
  | { type: 'save' }
  | { type: 'result'; result: NotesWriteResult }
  | { type: 'conflict_loaded'; theirs: NotesDocument }
  | { type: 'keep_mine' }
  | { type: 'take_theirs' }
  | { type: 'error'; detail: string }
  | { type: 'discard' }
  | { type: 'reload'; doc: NotesDocument };

export function initNotesEditor(doc: NotesDocument): NotesEditorState {
  return { status: 'clean', base: doc, draft: doc.content, theirs: null, rejection: '', detail: '' };
}

export function notesEditorReducer(s: NotesEditorState, e: NotesEditorEvent): NotesEditorState {
  switch (e.type) {
    case 'edit':
      if (s.status === 'saving') return s;
      return {
        ...s,
        draft: e.draft,
        status: s.status === 'conflict' ? 'conflict' : e.draft === s.base.content ? 'clean' : 'dirty',
      };
    case 'save':
      if (s.status === 'saving' || s.status === 'conflict') return s;
      return { ...s, status: 'saving', rejection: '', detail: '' };
    case 'result': {
      const r = e.result;
      if (r.accepted) {
        return {
          ...s,
          status: 'saved',
          base: { ...s.base, content: s.draft, etag: r.etag, size_chars: r.size_chars, budget_chars: r.budget_chars },
          theirs: null,
          rejection: '',
          detail: '',
        };
      }
      if (r.rejection === 'conflict') {
        // Wait for the current version before offering the choice.
        return { ...s, status: 'conflict', rejection: 'conflict', detail: r.detail };
      }
      return { ...s, status: 'rejected', rejection: r.rejection, detail: r.detail };
    }
    case 'conflict_loaded':
      return { ...s, status: 'conflict', theirs: e.theirs };
    case 'keep_mine':
      // Re-base the draft on the winning version, so the next save's if_match is
      // the etag that is current NOW: the overwrite is explicit, not a race.
      if (!s.theirs) return s;
      return { ...s, status: 'dirty', base: s.theirs, theirs: null, rejection: '', detail: '' };
    case 'take_theirs':
      if (!s.theirs) return s;
      return initNotesEditor(s.theirs);
    case 'error':
      return { ...s, status: s.draft === s.base.content ? 'clean' : 'dirty', rejection: 'error', detail: e.detail };
    case 'discard':
      return initNotesEditor(s.base);
    case 'reload':
      // A reload must never eat an unsaved draft.
      if (s.status === 'dirty' || s.status === 'saving' || s.status === 'conflict' || s.status === 'rejected') return s;
      return initNotesEditor(e.doc);
  }
}

/** Code points, the unit the kernel's budget counts in. */
export function codePoints(text: string): number {
  return [...text].length;
}

export const REJECTION_TEXT: Record<string, string> = {
  conflict: 'Someone saved these notes after you opened them.',
  over_budget: 'The notes are over their budget. Shorten them or raise the budget.',
  injection_flagged:
    'The injection scan flagged this content. An operator can store it anyway, with a reason; it is audited.',
  scope_denied: 'You may not write this notes document.',
  error: 'The save did not reach the kernel.',
};
