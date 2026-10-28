import { useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { HITLInline } from '@/design-system/components/cambrian/hitl-inline';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { Button } from '@/design-system/components/ui/button';
import { Badge } from '@/design-system/components/ui/badge';
import { TaskStatePill } from '@/screens/tasks/TaskStatePill';
import type { SessionState } from '@/ipc/types';
import { Inspector } from '@/components/InspectorSlot';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { useMutation } from '@/lib/useMutation';
import { errorMessage } from '@/lib/errorMessage';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { formatTokenCount, formatRelativeTime, sessionSubject } from '@/lib/format';
import { stepsOf, withApprovals } from '@/lib/planSteps';
import { cn } from '@/design-system/lib/utils';
import { Composer, type ComposerMode } from './Composer';
import { ExecutionPlanBlock } from './ExecutionPlanBlock';
import { StepInspector } from './StepInspector';
import { useDraftPersistence } from './useDraftPersistence';

export interface SessionWorkSurfaceProps {
  sessionId: string;
  /** The selected step, as `?step=` — the inspector exists only when it is set. */
  selectedStep?: number;
  onSelectStep?: (index: number | null) => void;
}

/**
 * Talk to a session and watch its plan execute, in one column.
 *
 * This replaces the split where the conversation lived in the main pane and the
 * plan lived in a permanently-mounted aside that said "no plan in flight" most
 * of the time. The plan is now a block *in* the transcript, and the only thing
 * that gets its own panel is a step you have explicitly selected.
 */
export function SessionWorkSurface({
  sessionId,
  selectedStep,
  onSelectStep,
}: SessionWorkSurfaceProps) {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const isMobile = useBreakpoint() === 'mobile';

  const [mode, setMode] = useState<ComposerMode>('message');
  const [localStep, setLocalStep] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<'pause' | 'resume' | null>(null);

  const plans = useMemo(
    () => (state?.plans ?? []).filter((p) => p.session_id === sessionId),
    [state?.plans, sessionId],
  );
  const session = state?.sessions.find((s) => s.session_id === sessionId) ?? null;

  const activePlan =
    plans.find((p) => p.status === 'running' || p.status === 'forming') ?? plans[0] ?? null;

  const [chatDraft, setChatDraft] = useDraftPersistence('chat', sessionId);
  const [injectDraft, setInjectDraft] = useDraftPersistence(
    'inject',
    activePlan?.plan_id ?? '_none',
  );

  const sessionPlanIds = useMemo(
    () => new Set(plans.map((p) => p.plan_id)),
    [plans],
  );
  const pendingHitl = useMemo(
    () => (state?.pending_hitl ?? []).filter((h) => sessionPlanIds.has(h.plan_id)),
    [state?.pending_hitl, sessionPlanIds],
  );

  // The step index lives in the URL when the host route provides it, so a
  // selection is deep-linkable and the palette can jump straight to it. The
  // local fallback keeps the component usable on its own (mobile, tests).
  const stepIndex = onSelectStep ? (selectedStep ?? null) : localStep;
  const setStepIndex = (next: number | null) => {
    if (onSelectStep) onSelectStep(next);
    else setLocalStep(next);
  };

  const role = state?.role ?? null;
  const isOperator = role === 'operator';
  const connection = state?.connection.status ?? 'down';
  const connectionDown = connection !== 'live';

  const resolveHitl = useMutation(ipc.resolveHITL);
  const sessionMutation = useMutation(
    async (args: { kind: 'pause' | 'resume'; reason: string }) =>
      args.kind === 'pause'
        ? ipc.pauseSession({ session_id: sessionId, reason: args.reason })
        : ipc.resumeSession({ session_id: sessionId, reason: args.reason }),
  );

  const composerDisabledReason = connectionDown
    ? connection === 'reconnecting'
      ? 'Reconnecting…'
      : 'Kernel unreachable'
    : !isOperator
      ? 'Operator role required to send messages.'
      : mode === 'inject' && !activePlan
        ? 'No plan to inject into'
        : undefined;

  const hitlDisabledReason = connectionDown
    ? connection === 'reconnecting'
      ? 'Reconnecting — the kernel is not accepting commands right now.'
      : 'Kernel unreachable.'
    : !isOperator
      ? 'Operator role required to resolve an intervention.'
      : undefined;

  // Both sends were `void`ed, so a rejected command vanished: the draft cleared, the
  // composer looked like it had worked, and nothing ever said otherwise. That is only
  // half the story the kernel tells — an ASYNC failure (the model provider refusing,
  // say) arrives later on the ADR-0098 progress channel and renders as a terminal
  // note — but a send that never left the machine has no progress channel to arrive
  // on, so swallowing it here is the one failure the user can never find out about.
  const [sendError, setSendError] = useState<string | null>(null);

  const submit = (text: string) => {
    setSendError(null);
    if (mode === 'inject') {
      if (!activePlan) return;
      ipc
        .injectCorrection({ session_id: sessionId, instruction: text, reason: 'mid-plan-inject' })
        .catch((e: unknown) => setSendError(`Could not send that correction. ${errorMessage(e)}`));
      setInjectDraft('');
      return;
    }
    ipc
      .sendMessage({ session_id: sessionId, text, reason: 'chat-send' })
      .catch((e: unknown) => setSendError(`Could not send that message. ${errorMessage(e)}`));
    setChatDraft('');
  };

  const selectedPlan = activePlan;
  const selectedSteps = useMemo(
    () => (selectedPlan ? withApprovals(stepsOf(selectedPlan), pendingHitl) : []),
    [selectedPlan, pendingHitl],
  );
  const selectedStepData =
    stepIndex != null ? selectedSteps.find((s) => s.index === stepIndex) ?? null : null;

  const isEmpty = plans.length === 0 && pendingHitl.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionHeader
        sessionId={sessionId}
        goal={session?.title ?? ''}
        state={session?.state ?? null}
        openedAt={session?.created_at ?? null}
        agents={session?.agent_mix ?? []}
        cost={session?.cost ?? 0}
        canMutate={isOperator && !connectionDown}
        busy={sessionMutation.isLoading}
        onPause={() => setConfirming('pause')}
        onResume={() => setConfirming('resume')}
      />

      <div
        aria-live="polite"
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className={cn(WORK_COLUMN, 'flex min-h-full flex-col gap-5 py-6')}>
        {isEmpty ? (
          <div className="my-auto py-10 text-center text-[13.5px] text-[var(--fg-muted)]">
            Nothing has started yet. The plan appears here as soon as one forms.
          </div>
        ) : (
          <>
            {plans.map((plan) => (
              <div key={plan.plan_id} className="flex-none">
                <ExecutionPlanBlock
                  plan={plan}
                  collapsible={isMobile}
                  steps={withApprovals(stepsOf(plan), pendingHitl)}
                  selectedIndex={plan.plan_id === selectedPlan?.plan_id ? stepIndex : null}
                  onSelectStep={(index) =>
                    setStepIndex(index === stepIndex ? null : index)
                  }
                />
              </div>
            ))}

            {pendingHitl.map((h) => (
              <div key={`hitl-${h.intervention_id}`} className="flex-none">
                <HITLInline
                  intervention={h}
                  disabledReason={hitlDisabledReason}
                  busy={resolveHitl.isLoading}
                  onApprove={(id, reason) =>
                    void resolveHitl.mutate({
                      intervention_id: id,
                      approve: true,
                      reason,
                    })
                  }
                  onReject={(id, reason) =>
                    void resolveHitl.mutate({
                      intervention_id: id,
                      approve: false,
                      reason,
                    })
                  }
                />
              </div>
            ))}

            {resolveHitl.error && (
              <div className="flex-none">
                <ErrorState
                  reason={resolveHitl.error}
                  whatToDo="The kernel rejected this HITL resolution. Review the reason and retry."
                />
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {sessionMutation.error && (
        <div className={cn(WORK_COLUMN, 'flex-none pb-2')}>
          <ErrorState reason={sessionMutation.error} />
        </div>
      )}

      {sendError && (
        <div className={cn(WORK_COLUMN, 'flex-none pb-2')}>
          <ErrorState reason={sendError} />
        </div>
      )}

      <Composer
        mode={mode}
        onModeChange={setMode}
        value={mode === 'inject' ? injectDraft : chatDraft}
        onChange={mode === 'inject' ? setInjectDraft : setChatDraft}
        onSubmit={submit}
        planId={activePlan?.plan_id ?? null}
        disabled={Boolean(composerDisabledReason)}
        disabledReason={composerDisabledReason}
        className={WORK_COLUMN}
      />

      {/* The inspector exists only while a step is selected. */}
      {selectedStepData && selectedPlan && (
        <Inspector label="Step detail">
          <StepInspector
            step={selectedStepData}
            planId={selectedPlan.plan_id}
            onInject={isOperator && !connectionDown ? () => setMode('inject') : undefined}
            injectDisabledReason={
              isOperator && !connectionDown ? undefined : composerDisabledReason
            }
          />
        </Inspector>
      )}

      {confirming && (
        <ConfirmMutationDialog
          open
          onOpenChange={(o) => !o && setConfirming(null)}
          title={confirming === 'resume' ? 'Resume task' : 'Pause task'}
          description={
            confirming === 'resume'
              ? 'The task resumes accepting work from where it stopped.'
              : 'The task stops accepting new work. Running steps finish; nothing new starts.'
          }
          confirmLabel={confirming === 'resume' ? 'Resume' : 'Pause'}
          onConfirm={async (reason) => {
            await sessionMutation.mutate({ kind: confirming, reason });
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}

/** The task page reads as one centred column, like Chat. */
const WORK_COLUMN = 'mx-auto w-full max-w-[880px] px-[var(--page-gutter)]';

function SessionHeader({
  sessionId,
  goal,
  state,
  openedAt,
  agents,
  cost,
  canMutate,
  busy,
  onPause,
  onResume,
}: {
  sessionId: string;
  goal: string;
  state: string | null;
  openedAt: string | null;
  agents: string[];
  cost: number;
  canMutate: boolean;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const subject = sessionSubject(goal);

  return (
    <header className="flex-none border-b border-[var(--border-subtle)]">
      <div className={cn(WORK_COLUMN, 'pb-4 pt-5')}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--fg-muted)]">
          {state ? <TaskStatePill state={state as SessionState} /> : <Badge>Unknown</Badge>}
          <span className="font-mono text-[11.5px]">{sessionId}</span>
          {openedAt && <span>Opened {formatRelativeTime(openedAt)}</span>}
        </div>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* The heading is a derived subject; the goal is always shown verbatim
                beneath it. A 200-character instruction is not a title, but the
                operator still has to be able to read exactly what they asked for. */}
            <h1 className="type-page-title text-pretty text-[var(--fg-primary)]">{subject}</h1>
            {goal && subject !== goal.trim() && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-[var(--fg-secondary)]">
                “{goal}”
              </p>
            )}
          </div>

          <div className="flex flex-none items-center gap-2">
            {state === 'paused' ? (
              <Button size="sm" onClick={onResume} disabled={!canMutate || busy}>
                Resume
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={onPause} disabled={!canMutate || busy}>
                  Pause task
                </Button>
                <Button size="sm" variant="ghost" onClick={onResume} disabled={!canMutate || busy}>
                  Resume
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {agents.map((agent, i) => (
            <span
              key={agent}
              className={cn(
                'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[11px] leading-none',
                i === 0 ? 'text-[var(--fg-primary)]' : 'text-[var(--fg-muted)]',
              )}
            >
              {agent}
            </span>
          ))}
          <span className="ml-1 text-[12px] tabular-nums text-[var(--fg-muted)]">
            {formatTokenCount(cost)} so far
          </span>
        </div>
      </div>
    </header>
  );
}
