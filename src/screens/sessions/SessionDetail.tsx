
import { useState } from 'react';
import { ipc } from '@/ipc';
import type { Role, SessionSummary } from '@/ipc/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { relativeTime } from '@/lib/relativeTime';
import { useMutation } from '@/lib/useMutation';
import { SessionStatePill } from './SessionStatePill';
import { ConfirmMutationDialog } from './ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';

interface SessionDetailProps {
  session: SessionSummary;
  role: Role | null;
}

type MutationKind = 'pause' | 'resume' | 'complete';

const MUTATION_META: Record<
  MutationKind,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  pause: {
    title: 'Pause session',
    description:
      'The running plan is paused — queued steps stop dispatching — and the session is marked paused. It can be resumed later.',
    confirmLabel: 'Pause',
    destructive: false,
  },
  resume: {
    title: 'Resume session',
    description:
      'The paused plan continues from where it stopped, and the session is marked active again.',
    confirmLabel: 'Resume',
    destructive: false,
  },
  complete: {
    title: 'Complete session',
    description:
      'The session is sealed and moved to the completed state. This is irreversible — a completed session cannot be resumed or reused for new work.',
    confirmLabel: 'Complete',
    destructive: true,
  },
};

export function SessionDetail({ session, role }: SessionDetailProps) {
  const [pending, setPending] = useState<MutationKind | null>(null);
  const isOperator = role === 'operator';

  const canPause = isOperator && session.state === 'active';
  const canResume = isOperator && session.state === 'paused';
  const canComplete = isOperator && session.state !== 'completed';

  const { mutate, isLoading, error } = useMutation(
    async (args: { kind: MutationKind; reason: string }) => {
      if (args.kind === 'pause') {
        return ipc.pauseSession({ session_id: session.session_id, reason: args.reason });
      }
      if (args.kind === 'resume') {
        return ipc.resumeSession({ session_id: session.session_id, reason: args.reason });
      }
      return ipc.completeSession({ session_id: session.session_id, reason: args.reason });
    },
  );

  const handleMutation = async (kind: MutationKind, reason: string) => {
    await mutate({ kind, reason });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SessionStatePill state={session.state} />
              <h2 className="truncate text-sm font-semibold">{session.title}</h2>
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--fg-muted)]">
              {session.session_id}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Created</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(session.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last activity</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(session.last_activity_at)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Plans</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">{session.plan_count}</dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Cost</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              ${session.cost.toFixed(2)}
            </dd>
          </div>
          {session.agent_mix.length > 0 && (
            <div className="col-span-2">
              <dt className="text-[var(--fg-muted)]">Agent mix</dt>
              <dd className="text-[var(--fg-secondary)]">{session.agent_mix.join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>

      <Tabs defaultValue="actions" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
        </TabsList>

        <TabsContent
          value="actions"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Session controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                variant="default"
                disabled={!canPause || isLoading}
                onClick={() => setPending('pause')}
                aria-label="Pause session"
              >
                Pause
              </Button>
              <Button
                variant="default"
                disabled={!canResume || isLoading}
                onClick={() => setPending('resume')}
                aria-label="Resume session"
              >
                Resume
              </Button>
              <Button
                variant="danger"
                disabled={!canComplete || isLoading}
                onClick={() => setPending('complete')}
                aria-label="Complete session"
              >
                Complete
              </Button>
              {error && <ErrorState reason={error} />}
              {!isOperator && (
                <p className="mt-2 text-xs text-[var(--fg-muted)]">
                  These actions require the Operator role.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="checkpoints"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <EmptyState
            title="No checkpoints yet"
            body="Checkpoints are written by the kernel as the session executes, but no read RPC exposes them yet, so none can be listed here."
          />
        </TabsContent>
      </Tabs>

      {pending && (
        <ConfirmMutationDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={MUTATION_META[pending].title}
          description={MUTATION_META[pending].description}
          confirmLabel={MUTATION_META[pending].confirmLabel}
          destructive={MUTATION_META[pending].destructive}
          onConfirm={async (reason) => {
            if (pending) await handleMutation(pending, reason);
          }}
        />
      )}
    </div>
  );
}
