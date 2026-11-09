import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScrollArea,
} from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import type { NotesDocument, NotesSummary } from '@/ipc/types';
import { errorMessage } from '@/lib/errorMessage';
import { codePoints, initNotesEditor, notesEditorReducer, REJECTION_TEXT } from '@/lib/notesEditor';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { formatUnixMs, useCommandGate } from '@/lib/useCommandGate';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { SkillDiff } from '@/screens/skills/SkillDiff';

const NOTES_KEY = ['memory-notes'] as const;
const refreshNotes = () => void queryClient.invalidateQueries({ queryKey: NOTES_KEY });

/**
 * Memory notes (ADR-0139 D14) — the short, always-injected notes a principal
 * (personal) or an organisation (org) carries into every run.
 *
 * An edit lands on the principal's NEXT run; a run in flight keeps its frozen
 * snapshot, and the pane says so. Saves are etag-guarded (see notesEditor.ts):
 * a concurrent save is a conflict with both versions shown, never a silent
 * overwrite. Budgets are code points, per document or per scope default.
 */
export function NotesPane() {
  const [scope, setScope] = useState<'' | 'personal' | 'org'>('');
  const [selected, setSelected] = useState<{ scope: string; owner_id: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useKernelQuery([...NOTES_KEY, 'list', scope], () => ipc.listMemoryNotes({ scope }));

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[340px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-[var(--border-subtle)]">
        <div className="flex flex-none items-center gap-1 px-3 py-2" role="group" aria-label="Notes scope">
          {(['', 'personal', 'org'] as const).map((s) => (
            <Button key={s || 'all'} size="sm" variant={s === scope ? 'default' : 'ghost'} aria-pressed={s === scope} onClick={() => setScope(s)}>
              {s || 'all'}
            </Button>
          ))}
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => { setCreating(true); setSelected(null); }}>
            New
          </Button>
        </div>
        {list.error && <ErrorState className="mx-3" reason={list.error.message} />}
        <ScrollArea className="flex-1">
          <ul className="flex flex-col px-2 pb-4" aria-label="Notes documents">
            {(list.data ?? []).map((n) => (
              <li key={`${n.scope}:${n.owner_id}`}>
                <NotesRow
                  n={n}
                  active={selected?.scope === n.scope && selected.owner_id === n.owner_id}
                  onClick={() => { setCreating(false); setSelected({ scope: n.scope, owner_id: n.owner_id }); }}
                />
              </li>
            ))}
            {!list.isLoading && (list.data ?? []).length === 0 && (
              <li className="px-2 py-3 text-[12px] text-[var(--fg-muted)]">No notes documents yet.</li>
            )}
          </ul>
        </ScrollArea>
        <ScopeDefaultBudget />
      </aside>
      <section className="flex min-h-0 flex-col">
        {creating ? (
          <NewNotes onCreated={(s, o) => { setCreating(false); setSelected({ scope: s, owner_id: o }); }} />
        ) : selected ? (
          <NotesEditorView key={`${selected.scope}:${selected.owner_id}`} scope={selected.scope} ownerId={selected.owner_id} onDeleted={() => setSelected(null)} />
        ) : (
          <EmptyState
            title="Pick a notes document"
            body="Personal notes belong to one principal; org notes to an organisation. Both are injected, as a snapshot, at the start of every run."
          />
        )}
      </section>
    </div>
  );
}

function NotesRow({ n, active, onClick }: { n: NotesSummary; active: boolean; onClick: () => void }) {
  const pct = n.budget_chars ? Math.min(100, Math.round((n.size_chars / n.budget_chars) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left hover:bg-[var(--list-row-bg-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        active && 'bg-[color-mix(in_srgb,var(--accent-bg)_12%,transparent)]',
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-medium">{n.owner_id}</span>
        <span className="font-mono text-[10px] uppercase text-[var(--fg-muted)]">{n.scope}</span>
        {n.over_budget && <span className="font-mono text-[10px] text-[var(--status-err)]">over budget</span>}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1 flex-1 overflow-hidden rounded bg-[var(--border-subtle)]" aria-hidden="true">
          <span
            className="block h-full"
            style={{ width: `${pct}%`, background: n.over_budget ? 'var(--status-err)' : 'var(--accent-bg)' }}
          />
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {n.size_chars}/{n.budget_chars}
        </span>
      </span>
    </button>
  );
}

function NotesEditorView({ scope, ownerId, onDeleted }: { scope: string; ownerId: string; onDeleted: () => void }) {
  const doc = useKernelQuery([...NOTES_KEY, 'doc', scope, ownerId], () => ipc.getMemoryNotes({ scope, owner_id: ownerId }));
  if (doc.error) return <ErrorState className="m-4" reason={doc.error.message} whatToDo="A document you may not read is reported as not found." />;
  if (!doc.data) return <p className="p-4 text-[12px] text-[var(--fg-muted)]">Loading…</p>;
  return <Editor doc={doc.data} onDeleted={onDeleted} />;
}

function Editor({ doc, onDeleted }: { doc: NotesDocument; onDeleted: () => void }) {
  const gate = useCommandGate('edit notes');
  const [s, dispatch] = useReducer(notesEditorReducer, doc, initNotesEditor);
  const [confirm, setConfirm] = useState<'save' | 'override' | 'delete' | 'budget' | null>(null);
  const [budget, setBudget] = useState(String(doc.budget_chars));
  const [error, setError] = useState<string | null>(null);

  // A refetch (after our own save, or a reconnect) must not eat a draft — the
  // reducer ignores a reload unless the editor is clean.
  useEffect(() => dispatch({ type: 'reload', doc }), [doc]);

  const size = codePoints(s.draft);
  const over = size > s.base.budget_chars;

  const save = async (reason: string, overrideInjection = false) => {
    dispatch({ type: 'save' });
    try {
      const r = await ipc.setMemoryNotes({
        scope: s.base.scope,
        owner_id: s.base.owner_id,
        content: s.draft,
        if_match: s.base.etag,
        override_injection_flag: overrideInjection,
        reason,
      });
      dispatch({ type: 'result', result: r });
      if (r.rejection === 'conflict') {
        const theirs = await ipc.getMemoryNotes({ scope: s.base.scope, owner_id: s.base.owner_id });
        dispatch({ type: 'conflict_loaded', theirs });
      }
      if (r.accepted) refreshNotes();
    } catch (e) {
      dispatch({ type: 'error', detail: errorMessage(e) });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none flex-wrap items-baseline gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <h2 className="text-[15px] font-medium">{s.base.owner_id}</h2>
        <span className="font-mono text-[10.5px] uppercase text-[var(--fg-muted)]">{s.base.scope}</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          updated {formatUnixMs(s.base.updated_at_unix_ms)} by {s.base.updated_by || '—'}
        </span>
        <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">Edits apply from the next run.</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {s.status === 'conflict' && (
          <div role="alert" className="flex flex-col gap-2 rounded-md p-3 tint-wash tint-ring" style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}>
            <p className="text-[12.5px] text-[var(--status-warn)]">
              {REJECTION_TEXT.conflict}{' '}
              {s.theirs ? `${s.theirs.updated_by || 'Someone'} saved at ${formatUnixMs(s.theirs.updated_at_unix_ms)}.` : 'Loading their version…'}
            </p>
            {s.theirs && (
              <>
                <SkillDiff before={s.theirs.content} after={s.draft} />
                <p className="text-[11.5px] text-[var(--fg-muted)]">
                  The diff reads from their version (−) to your draft (+).
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => dispatch({ type: 'keep_mine' })}>
                    Keep mine (then save)
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'take_theirs' })}>
                    Take theirs
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {(s.status === 'rejected' || s.rejection === 'error') && (
          <ErrorState
            reason={REJECTION_TEXT[s.rejection] ?? s.rejection}
            whatToDo={s.detail || undefined}
          />
        )}
        {error && <ErrorState reason={error} />}

        <label htmlFor="notes-editor" className="text-[11.5px] text-[var(--fg-secondary)]">
          Notes (markdown; “## ” headings are sections)
        </label>
        <textarea
          id="notes-editor"
          value={s.draft}
          onChange={(e) => dispatch({ type: 'edit', draft: e.target.value })}
          disabled={Boolean(gate) || s.status === 'saving'}
          className="min-h-[260px] flex-1 resize-y rounded-md bg-[var(--bg-canvas)] p-3 font-mono text-[12.5px] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
        <p className={cn('font-mono text-[11px]', over ? 'text-[var(--status-err)]' : 'text-[var(--fg-muted)]')} aria-live="polite">
          {size} / {s.base.budget_chars} characters{over ? ' — over budget; the kernel will refuse this save' : ''}
          {s.status === 'saved' && ' · saved'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={Boolean(gate) || s.status !== 'dirty'} onClick={() => setConfirm('save')}>
            Save
          </Button>
          {s.rejection === 'injection_flagged' && (
            <Button size="sm" variant="danger" disabled={Boolean(gate)} onClick={() => setConfirm('override')}>
              Store anyway
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={s.status !== 'dirty' && s.status !== 'rejected'} onClick={() => dispatch({ type: 'discard' })}>
            Discard changes
          </Button>
          <Button size="sm" variant="secondary" disabled={Boolean(gate)} onClick={() => setConfirm('delete')}>
            Clear notes
          </Button>
          <span className="ml-2 flex items-center gap-1.5">
            <label htmlFor="notes-budget" className="text-[11.5px] text-[var(--fg-secondary)]">
              Budget
            </label>
            <Input id="notes-budget" type="number" min={1} value={budget} onChange={(e) => setBudget(e.target.value)} className="h-8 w-[100px]" />
            <Button size="sm" variant="secondary" disabled={Boolean(gate) || !(Number(budget) > 0)} onClick={() => setConfirm('budget')}>
              Set
            </Button>
            {doc.budget_overridden ? (
              <span className="text-[11px] text-[var(--fg-muted)]">own budget</span>
            ) : (
              <span className="text-[11px] text-[var(--fg-muted)]">scope default</span>
            )}
          </span>
          {gate && <span className="text-[11.5px] text-[var(--fg-muted)]">{gate}</span>}
        </div>
      </div>

      <ConfirmMutationDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === 'delete' ? 'Clear these notes'
            : confirm === 'budget' ? `Set the budget to ${budget}`
            : confirm === 'override' ? 'Store flagged content'
            : 'Save notes'
        }
        description={
          confirm === 'delete'
            ? 'The document is cleared. The cleared text is kept in the audit record, so an operator can recover it.'
            : confirm === 'budget'
              ? 'Lowering a budget truncates nothing stored; later writes over it are refused and the run snapshot is cut to the budget.'
              : confirm === 'override'
                ? 'The injection scan flagged this content. Storing it is your judgement and is audited with your reason.'
                : 'The notes apply from the principal’s next run.'
        }
        confirmLabel={confirm === 'delete' ? 'Clear' : confirm === 'budget' ? 'Set budget' : confirm === 'override' ? 'Store anyway' : 'Save'}
        destructive={confirm === 'delete' || confirm === 'override'}
        onConfirm={async (reason) => {
          const kind = confirm;
          setConfirm(null);
          setError(null);
          try {
            if (kind === 'save') await save(reason);
            else if (kind === 'override') await save(reason, true);
            else if (kind === 'delete') {
              await ipc.deleteMemoryNotes({ scope: s.base.scope, owner_id: s.base.owner_id, reason });
              refreshNotes();
              onDeleted();
            } else if (kind === 'budget') {
              await ipc.setMemoryNotesBudget({ scope: s.base.scope, owner_id: s.base.owner_id, budget_chars: Number(budget), reason });
              refreshNotes();
            }
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function NewNotes({ onCreated }: { onCreated: (scope: string, owner: string) => void }) {
  const gate = useCommandGate('create notes');
  const [scope, setScope] = useState<'personal' | 'org'>('personal');
  const [owner, setOwner] = useState('');
  const [content, setContent] = useState('## Notes\n');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex max-w-[720px] flex-col gap-3 p-4">
      <h2 className="text-[15px] font-medium">New notes document</h2>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
          Scope
          <select value={scope} onChange={(e) => setScope(e.target.value as 'personal' | 'org')} className="h-8 rounded-md border border-[var(--button-secondary-border)] bg-[var(--bg-surface)] px-2 text-[12.5px]">
            <option value="personal">personal (a principal)</option>
            <option value="org">org (an organisation)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
          {scope === 'personal' ? 'Principal id' : 'Org id'}
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 w-[240px]" />
        </label>
      </div>
      <textarea
        aria-label="Notes content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[200px] rounded-md bg-[var(--bg-canvas)] p-3 font-mono text-[12.5px] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
      />
      {error && <ErrorState reason={error} />}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={Boolean(gate) || !owner.trim()} onClick={() => setConfirm(true)}>
          Create
        </Button>
        {gate && <span className="text-[11.5px] text-[var(--fg-muted)]">{gate}</span>}
      </div>
      <ConfirmMutationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Create ${scope} notes for ${owner}`}
        description="The notes apply from the next run."
        confirmLabel="Create"
        onConfirm={async (reason) => {
          setConfirm(false);
          try {
            const r = await ipc.setMemoryNotes({ scope, owner_id: owner.trim(), content, reason });
            if (!r.accepted) setError(REJECTION_TEXT[r.rejection] ?? r.rejection);
            else {
              refreshNotes();
              onCreated(scope, owner.trim());
            }
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function ScopeDefaultBudget() {
  const gate = useCommandGate('set budgets');
  const [scope, setScope] = useState<'personal' | 'org'>('personal');
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const valid = useMemo(() => Number(value) > 0, [value]);
  return (
    <div className="flex flex-none flex-col gap-1.5 p-3 shadow-[inset_0_1px_0_var(--border-subtle)]">
      <span className="text-[11.5px] text-[var(--fg-secondary)]">Scope default budget</span>
      <div className="flex items-center gap-1.5">
        <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value as 'personal' | 'org')} className="h-8 rounded-md border border-[var(--button-secondary-border)] bg-[var(--bg-surface)] px-2 text-[12px]">
          <option value="personal">personal</option>
          <option value="org">org</option>
        </select>
        <Input aria-label="Default budget (characters)" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-[90px]" />
        <Button size="sm" variant="secondary" disabled={Boolean(gate) || !valid} onClick={() => setConfirm(true)}>
          Set
        </Button>
      </div>
      {msg && <p className="text-[11px] text-[var(--fg-muted)]">{msg}</p>}
      <ConfirmMutationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Set the ${scope} default budget to ${value}`}
        description="Applies to every document of this scope that has no budget of its own."
        confirmLabel="Set default"
        onConfirm={async (reason) => {
          setConfirm(false);
          try {
            await ipc.setMemoryNotesBudget({ scope, budget_chars: Number(value), reason });
            setMsg('Default updated.');
            refreshNotes();
          } catch (e) {
            setMsg(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
