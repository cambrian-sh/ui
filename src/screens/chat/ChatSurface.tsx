
import { useState, useMemo } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ChatInput } from '@/design-system/components/cambrian/chat-input';
import { InjectInput } from '@/design-system/components/cambrian/inject-input';
import { HITLInline } from '@/design-system/components/cambrian/hitl-inline';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { useMutation } from '@/lib/useMutation';
import { BlockRenderer, type Block } from './BlockRenderer';
import { useDraftPersistence } from './useDraftPersistence';

export function ChatSurface({ sessionId }: { sessionId: string }) {
  const projection = useStore(projectionStore);
  const state = projection.state;

  const [chatDraft, setChatDraft] = useDraftPersistence('chat', sessionId);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [injectDraft, setInjectDraft] = useDraftPersistence('inject', selectedPlanId ?? '_none');

  const plans = state?.plans ?? [];
  const effectivePlanId = selectedPlanId ?? plans[0]?.plan_id ?? null;

  const blocks = useMemo<Block[]>(() => {
    return plans.map((p) => ({
      kind: 'plan_card' as const,
      id: p.plan_id,
      plan: p,
      steps: [],
    }));
  }, [plans]);

  const isOperator = state?.role === 'operator';

  const sessionPlanIds = useMemo(
    () => new Set(plans.filter((p) => p.session_id === sessionId).map((p) => p.plan_id)),
    [plans, sessionId],
  );

  const pendingHitl = useMemo(
    () => (state?.pending_hitl ?? []).filter((h) => sessionPlanIds.has(h.plan_id)),
    [state?.pending_hitl, sessionPlanIds],
  );

  const { mutate: resolveHitl, error: hitlError } = useMutation(
    (interventionId: string, approve: boolean, reason: string) =>
      ipc.resolveHITL({ intervention_id: interventionId, approve, reason }),
  );

  const handleApprove = (interventionId: string, reason: string) => {
    resolveHitl(interventionId, true, reason);
  };

  const handleReject = (interventionId: string, reason: string) => {
    resolveHitl(interventionId, false, reason);
  };

  const send = (text: string) => {
    ipc.sendMessage({ session_id: sessionId, text, reason: 'chat-send' });
    setChatDraft('');
  };

  const inject = (text: string) => {
    if (!effectivePlanId) return;
    ipc.injectCorrection({ session_id: sessionId, instruction: text, reason: 'mid-plan-inject' });
    setInjectDraft('');
  };

  const connection = state?.connection.status ?? 'down';
  const connectionDisabled = connection !== 'live';
  const connectionDisabledReason = connection === 'reconnecting' ? 'Reconnecting…' : 'Kernel unreachable';

  const chatDisabled = connectionDisabled || !isOperator;
  const chatDisabledReason = connectionDisabled
    ? connectionDisabledReason
    : isOperator
      ? undefined
      : 'Operator role required to send messages.';

  const injectDisabled = connectionDisabled || !effectivePlanId || !isOperator;
  const injectDisabledReason = connectionDisabled
    ? connectionDisabledReason
    : !effectivePlanId
      ? 'No plan to inject into'
      : isOperator
        ? undefined
        : 'Operator role required to send messages.';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 min-h-0 overflow-y-auto p-3"
      >
        {blocks.length === 0 && pendingHitl.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--fg-muted)]">
            No blocks yet. The plan view appears here when a plan starts.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {blocks.map((b) => (
              <BlockRenderer key={b.id} block={b} />
            ))}
            {pendingHitl.map((h) => (
              <HITLInline
                key={`hitl-${h.intervention_id}`}
                intervention={h}
                onApprove={isOperator ? handleApprove : undefined}
                onReject={isOperator ? handleReject : undefined}
              />
            ))}
            {hitlError && (
              <ErrorState
                reason={hitlError}
                whatToDo="The kernel rejected this HITL resolution. Review the reason and retry."
              />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col border-t border-[var(--border-subtle)]">
        <ChatInput
          value={chatDraft}
          onChange={setChatDraft}
          onSubmit={send}
          disabled={chatDisabled}
          disabledReason={chatDisabledReason}
          placeholder="Send a message…"
        />
        {plans.length > 0 && (
          <InjectInput
            plans={plans}
            selectedPlanId={effectivePlanId}
            onPlanChange={setSelectedPlanId}
            value={injectDraft}
            onChange={setInjectDraft}
            onSubmit={inject}
            disabled={injectDisabled}
            disabledReason={injectDisabledReason}
          />
        )}
      </div>
    </div>
  );
}
