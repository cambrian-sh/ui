
import { useState } from 'react';
import { ipc } from '@/ipc';
import type { MemoryDocument } from '@/design-system/components/cambrian/memory-list';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';
import { MemoryBlastRadius } from './MemoryBlastRadius';

type PendingAction = 'tag' | 'delete' | null;

export function MemoryDetail({ doc }: { doc: MemoryDocument }) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionReason, setActionReason] = useState('');

  const askTag = () => setPendingAction('tag');
  const askDelete = () => setPendingAction('delete');
  const cancel = () => {
    setPendingAction(null);
    setActionReason('');
  };

  const confirm = () => {
    if (pendingAction === 'tag') {
      ipc.setToolGrant({ agent_id: 'memory:' + doc.doc_id, tool_name: 'tag:user', granted: true, reason: actionReason.trim() });
    } else if (pendingAction === 'delete') {
      ipc.setToolGrant({ agent_id: 'memory:' + doc.doc_id, tool_name: 'delete:user', granted: true, reason: actionReason.trim() });
    }
    cancel();
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono break-all">{doc.doc_id}</CardTitle>
          <CardDescription>
            {doc.doc_type} · {doc.scope_tags.join(', ') || 'no scope'} · {Math.round(doc.activation_strength * 100)}% activation
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">FACT</div>
            <p className="font-mono text-xs text-[var(--fg-primary)] whitespace-pre-wrap break-words">
              {doc.content_preview}
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">SCENE</div>
            <p className="font-mono text-[11px] text-[var(--fg-secondary)]">
              Session {doc.session_id ?? '—'} · created {doc.created_at}
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">Graph neighbours</div>
            <p className="text-[10px] text-[var(--fg-muted)]">
              Inline graph view lands when UI-012's React Flow graph ships.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mutating actions</CardTitle>
          <CardDescription>All actions are operator-only and audited. The blast-radius panel must be read before Tag or Delete.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pendingAction === null ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={askTag}
                className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
              >
                Tag
              </button>
              <button
                type="button"
                onClick={() => {
                  ipc.setToolGrant({ agent_id: 'memory:' + doc.doc_id, tool_name: 'promote:user', granted: true, reason: 'promote' });
                }}
                className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
              >
                Promote
              </button>
              <button
                type="button"
                onClick={() => {
                  ipc.setToolGrant({ agent_id: 'memory:' + doc.doc_id, tool_name: 'supersede:user', granted: true, reason: 'supersede' });
                }}
                className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
              >
                Supersede
              </button>
              <button
                type="button"
                onClick={askDelete}
                className="rounded-sm border border-[var(--status-err)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--status-err)] hover:bg-[var(--bg-surface)]"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <MemoryBlastRadius
                mutation={{
                  kind: 'tag_memory',
                  doc_id: doc.doc_id,
                  tag: pendingAction === 'tag' ? 'user:tag' : 'user:delete',
                  add: pendingAction === 'tag',
                }}
              />
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={`Reason (mandatory for ${pendingAction})`}
                aria-label="Action reason"
                className="w-full rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
              <div
                role="alert"
                className="rounded-sm border border-[var(--status-warn)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[11px] text-[var(--fg-primary)]"
              >
                {pendingAction === 'tag'
                  ? 'Tagging this memory with the chosen tag will update the EffectiveScope of the affected agents (see above).'
                  : 'Deleting this memory is destructive. The action is audited and cannot be undone.'}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancel}
                  className="flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!actionReason.trim()}
                  className="flex-1 rounded-sm bg-[var(--button-primary-bg)] px-2 py-1 text-[11px] font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm {pendingAction}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
