/* Chat surface (PRD-03) — the centre column of the shell.
 *
 * Linear-convention reverse-chronological flow. The 12-block taxonomy
 * (BlockRenderer) renders each block. The chat input lives at the bottom
 * of the centre column; the inject input is a separate bar above the right
 * inspector (LD-6). Both inputs use localStorage-backed draft recovery
 * (UI-009). The session state strip below the chat input is a placeholder
 * for UI-IMPL-09+.
 */
import { useState, useMemo } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ChatInput } from '@/design-system/components/cambrian/chat-input';
import { InjectInput } from '@/design-system/components/cambrian/inject-input';
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
  const disabled = connection !== 'live';
  const disabledReason = connection === 'reconnecting' ? 'Reconnecting…' : 'Kernel unreachable';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 min-h-0 overflow-y-auto p-3"
      >
        {blocks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--fg-muted)]">
            No blocks yet. The plan view appears here when a plan starts.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {blocks.map((b) => (
              <BlockRenderer key={b.id} block={b} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col border-t border-[var(--border-subtle)]">
        <ChatInput
          value={chatDraft}
          onChange={setChatDraft}
          onSubmit={send}
          disabled={disabled}
          disabledReason={disabledReason}
          placeholder="Send a message…"
        />
        <InjectInput
          plans={plans}
          selectedPlanId={effectivePlanId}
          onPlanChange={setSelectedPlanId}
          value={injectDraft}
          onChange={setInjectDraft}
          onSubmit={inject}
          disabled={disabled || !effectivePlanId}
          disabledReason={disabled ? disabledReason : 'No plan to inject into'}
        />
      </div>
    </div>
  );
}
