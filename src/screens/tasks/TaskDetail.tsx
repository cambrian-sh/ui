
import { useState } from 'react';
import { ipc } from '@/ipc';
import type { Role, SessionSummary } from '@/ipc/types';
import {
  Button,
  EmptyState,
  KeyValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { relativeTime } from '@/lib/relativeTime';
import { useMutation } from '@/lib/useMutation';
import { TaskStatePill } from './TaskStatePill';
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
    title: 'Pause task',
    description:
      'The running plan is paused — queued steps stop dispatching — and the task is marked paused. It can be resumed later.',
    confirmLabel: 'Pause',
    destructive: false,
  },
  resume: {
    title: 'Resume task',
    description:
      'The paused plan continues from where it stopped, and the task is marked active again.',
    confirmLabel: 'Resume',
    destructive: false,
  },
  complete: {
    title: 'Complete task',
    description:
      'The task is sealed and moved to the completed state. This is irreversible — a completed task cannot be resumed or reused for new work.',
    confirmLabel: 'Complete',
    destructive: true,
  },
};

export function TaskDetail({ session, role }: SessionDetailProps) {
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
      <div className="border-b border-[var(--border-subtle)] px-5 pb-4 pt-5">
        <TaskStatePill state={session.state} />
        <h2 className="mt-2 text-[15px] font-semibold leading-[1.35] text-[var(--fg-primary)]">
          {session.title}
        </h2>
        <p className="mt-0.5 font-mono text-[11.5px] text-[var(--fg-muted)]">
          {session.session_id}
        </p>
        <KeyValue
          className="mt-4 text-[12.5px]"
          items={[
            { label: 'Created', value: relativeTime(session.created_at) },
            { label: 'Last activity', value: relativeTime(session.last_activity_at) },
            {
              label: 'Plans',
              value: <span className="tabular-nums">{session.plan_count}</span>,
            },
            {
              label: 'Cost',
              value: <span className="tabular-nums">${session.cost.toFixed(2)}</span>,
            },
            ...(session.agent_mix.length > 0
              ? [{ label: 'Agent mix', value: session.agent_mix.join(', '), mono: true }]
              : []),
          ]}
        />
      </div>

      <Tabs defaultValue="actions" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="px-5">
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
        </TabsList>

        <TabsContent
          value="actions"
          className="flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-none"
        >
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="type-section-title text-[var(--fg-primary)]">Task controls</h3>
              <p className="mt-0.5 text-[12.5px] text-[var(--fg-secondary)]">
                Each change asks for a reason, which goes into the audit log.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!canPause || isLoading}
                onClick={() => setPending('pause')}
                aria-label="Pause task"
              >
                Pause
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canResume || isLoading}
                onClick={() => setPending('resume')}
                aria-label="Resume task"
              >
                Resume
              </Button>
              {/* Irreversible, so it reads as a warning here; the confirm
                  dialog carries the filled danger button. */}
              <Button
                size="sm"
                variant="secondary"
                className="text-[var(--status-err)]"
                disabled={!canComplete || isLoading}
                onClick={() => setPending('complete')}
                aria-label="Complete task"
              >
                Complete
              </Button>
            </div>
            {error && <ErrorState reason={error} />}
            {!isOperator && (
              <p className="text-[12.5px] text-[var(--fg-muted)]">
                These actions require the Operator role.
              </p>
            )}
          </section>
        </TabsContent>

        <TabsContent
          value="checkpoints"
          className="flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-none"
        >
          <EmptyState
            title="No checkpoints yet"
            body="The kernel writes checkpoints as the task runs, but no read RPC exposes them yet, so none can be listed here."
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
