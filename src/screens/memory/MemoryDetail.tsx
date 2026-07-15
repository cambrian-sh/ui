import { useState } from 'react';
import { ipc } from '@/ipc';
import type { MemoryDocument } from '@/design-system/components/cambrian/memory-list';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';
import { MemoryBlastRadius } from './MemoryBlastRadius';
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';

type PendingAction = 'tag' | 'delete' | 'promote' | 'supersede' | null;

const MUTATION_META: Record<
  NonNullable<PendingAction>,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  tag: {
    title: 'Tag memory',
    description:
      'Tagging this memory with the chosen tag will update the EffectiveScope of the affected agents.',
    confirmLabel: 'Tag',
    destructive: false,
  },
  delete: {
    title: 'Delete memory',
    description:
      'Deleting this memory is destructive. The action is audited and cannot be undone.',
    confirmLabel: 'Delete',
    destructive: true,
  },
  promote: {
    title: 'Promote memory',
    description:
      'Promoting this memory will increase its rank in the memory hierarchy.',
    confirmLabel: 'Promote',
    destructive: false,
  },
  supersede: {
    title: 'Supersede memory',
    description:
      'This memory will be superseded by a newer or more accurate version.',
    confirmLabel: 'Supersede',
    destructive: false,
  },
};

export function MemoryDetail({ doc }: { doc: MemoryDocument }) {
  const role = useStore(projectionStore)?.state?.role ?? null;
  const isOperator = role === 'operator';

  const [pending, setPending] = useState<PendingAction>(null);

  const { mutate, isLoading, error: mutationError } = useMutation(
    async (args: { tool_name: string; reason: string }) => {
      return ipc.setToolGrant({
        agent_id: 'memory:' + doc.doc_id,
        tool_name: args.tool_name,
        granted: true,
        reason: args.reason,
      });
    },
  );

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
          {pending && (
            <MemoryBlastRadius
              mutation={{
                kind: 'tag_memory',
                doc_id: doc.doc_id,
                tag: pending === 'delete' ? 'user:delete' : 'user:tag',
                add: pending === 'tag',
              }}
            />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!isOperator || isLoading}
              onClick={() => setPending('tag')}
              aria-label="Tag memory"
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tag
            </button>
            <button
              type="button"
              disabled={!isOperator || isLoading}
              onClick={() => setPending('delete')}
              aria-label="Delete memory"
              className="rounded-sm border border-[var(--status-err)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--status-err)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={!isOperator || isLoading}
              onClick={() => setPending('promote')}
              aria-label="Promote memory"
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Promote
            </button>
            <button
              type="button"
              disabled={!isOperator || isLoading}
              onClick={() => setPending('supersede')}
              aria-label="Supersede memory"
              className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Supersede
            </button>
          </div>
          {!isOperator && (
            <p className="mt-2 text-xs text-[var(--fg-muted)]">
              These actions require the Operator role.
            </p>
          )}
          {mutationError && <ErrorState reason={mutationError} />}
        </CardContent>
      </Card>

      {pending && (
        <ConfirmMutationDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={MUTATION_META[pending].title}
          description={MUTATION_META[pending].description}
          confirmLabel={MUTATION_META[pending].confirmLabel}
          destructive={MUTATION_META[pending].destructive}
          onConfirm={async (reason) => {
            if (pending) {
              await mutate({ tool_name: pending + ':user', reason });
            }
          }}
        />
      )}
    </div>
  );
}
