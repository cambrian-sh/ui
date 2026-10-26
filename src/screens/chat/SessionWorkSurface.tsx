import { useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { HITLInline } from '@/design-system/components/cambrian/hitl-inline';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { Button } from '@/design-system/components/ui/button';
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
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[26px] py-[22px]"
      >
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--fg-muted)]">
            No blocks yet. The plan view appears here when a plan starts.
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

      {sessionMutation.error && (
        <div className="flex-none px-[26px] pb-2">
          <ErrorState reason={sessionMutation.error} />
        </div>
      )}

      {sendError && (
        <div className="flex-none px-[26px] pb-2">
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
          title={confirming === 'resume' ? 'Resume session' : 'Pause session'}
          description={
            confirming === 'resume'
              ? 'The session resumes accepting work from where it stopped.'
              : 'The session stops accepting new work. Running steps finish; nothing new starts.'
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
  const isActive = state === 'active';
  const tone = isActive
    ? 'var(--status-live)'
    : state === 'paused'
      ? 'var(--status-warn)'
      : 'var(--status-idle)';

  return (
    <header className="flex-none px-[26px] pb-3.5 pt-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
      <div className="flex items-center gap-2 text-[11px]">
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', isActive && 'cambrian-live-pulse')}
          style={{ background: tone }}
        />
        <span
          className="type-label"
          style={{ color: tone }}
        >
          {state ?? 'unknown'}
        </span>
        <span className="font-mono text-[10.5px] text-[color-mix(in_srgb,var(--fg-muted)_35%,transparent)]">
          {sessionId}
        </span>
        {openedAt && (
          <span className="text-[var(--fg-muted)]">opened {formatRelativeTime(openedAt)}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The heading is a derived subject; the goal is always shown verbatim
              beneath it. A 200-character instruction is not a title, but the
              operator still has to be able to read exactly what they asked for. */}
          <h1 className="type-page-title max-w-[760px] text-pretty">
            {sessionSubject(goal)}
          </h1>
          {goal && (
            <p className="mt-1 line-clamp-2 max-w-[760px] text-[12.5px] leading-[1.5] text-[var(--fg-primary)] opacity-55">
              “{goal}”
            </p>
          )}
        </div>

        <div className="flex flex-none items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onPause} disabled={!canMutate || busy}>
            Pause session
          </Button>
          <Button size="sm" variant="ghost" onClick={onResume} disabled={!canMutate || busy}>
            Resume
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {agents.map((agent, i) => (
          <span
            key={agent}
            className={cn(
              'rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none',
              i === 0
                ? 'bg-[color-mix(in_srgb,var(--accent-bg)_14%,transparent)] text-[var(--color-accent-400)]'
                : 'text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]',
            )}
          >
            {agent}
          </span>
        ))}
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          {formatTokenCount(cost)} this session
        </span>
      </div>
    </header>
  );
}
