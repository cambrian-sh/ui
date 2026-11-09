import { describe, expect, it } from 'vitest';
import type { NotesDocument, NotesWriteResult } from '@/ipc/types';
import { codePoints, initNotesEditor, notesEditorReducer as r } from './notesEditor';
import { diffStats, lineDiff } from './lineDiff';

const doc = (o: Partial<NotesDocument> = {}): NotesDocument => ({
  scope: 'personal', owner_id: 'alice', content: 'v1', size_chars: 2, budget_chars: 100, etag: 'e1',
  updated_at_unix_ms: 0, updated_by: 'alice', budget_overridden: false, ...o,
});
const result = (o: Partial<NotesWriteResult>): NotesWriteResult => ({
  deduped: false, accepted: true, rejection: '', detail: '', etag: 'e2', size_chars: 2, budget_chars: 100, ...o,
});

describe('notes editor etag flow', () => {
  it('saves and re-bases on the new etag', () => {
    let s = initNotesEditor(doc());
    s = r(s, { type: 'edit', draft: 'v2' });
    expect(s.status).toBe('dirty');
    s = r(s, { type: 'save' });
    s = r(s, { type: 'result', result: result({ etag: 'e2' }) });
    expect(s.status).toBe('saved');
    expect(s.base.etag).toBe('e2');
    expect(s.base.content).toBe('v2');
  });

  it('on conflict holds both versions; keep mine re-bases on theirs so the next save is explicit', () => {
    let s = r(initNotesEditor(doc()), { type: 'edit', draft: 'mine' });
    s = r(s, { type: 'save' });
    s = r(s, { type: 'result', result: result({ accepted: false, rejection: 'conflict' }) });
    expect(s.status).toBe('conflict');
    // A save while the choice is open is ignored.
    expect(r(s, { type: 'save' })).toBe(s);
    s = r(s, { type: 'conflict_loaded', theirs: doc({ content: 'theirs', etag: 'e9' }) });
    expect(s.theirs?.content).toBe('theirs');
    const kept = r(s, { type: 'keep_mine' });
    expect(kept.status).toBe('dirty');
    expect(kept.draft).toBe('mine');
    expect(kept.base.etag).toBe('e9');
    const taken = r(s, { type: 'take_theirs' });
    expect(taken.status).toBe('clean');
    expect(taken.draft).toBe('theirs');
  });

  it('keeps the draft on a content rejection', () => {
    let s = r(initNotesEditor(doc()), { type: 'edit', draft: 'too long' });
    s = r(s, { type: 'save' });
    s = r(s, { type: 'result', result: result({ accepted: false, rejection: 'over_budget' }) });
    expect(s.status).toBe('rejected');
    expect(s.draft).toBe('too long');
  });

  it('a reload never eats an unsaved draft', () => {
    const s = r(initNotesEditor(doc()), { type: 'edit', draft: 'wip' });
    expect(r(s, { type: 'reload', doc: doc({ content: 'remote' }) })).toBe(s);
    const clean = initNotesEditor(doc());
    expect(r(clean, { type: 'reload', doc: doc({ content: 'remote' }) }).draft).toBe('remote');
  });

  it('discard returns to the base version', () => {
    const s = r(initNotesEditor(doc()), { type: 'edit', draft: 'wip' });
    const d = r(s, { type: 'discard' });
    expect(d.status).toBe('clean');
    expect(d.draft).toBe('v1');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(codePoints('a😀')).toBe(2);
  });
});

describe('lineDiff', () => {
  it('finds the minimal line changes', () => {
    const d = lineDiff('a\nb\nc', 'a\nc\nd');
    expect(d).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
  });

  it('treats an empty base as all-added', () => {
    expect(diffStats(lineDiff('', 'x\ny'))).toEqual({ added: 2, removed: 0 });
  });
});
