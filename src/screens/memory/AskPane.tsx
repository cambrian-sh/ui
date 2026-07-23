import { useState } from 'react';
import { ChatInput } from '@/design-system/components/cambrian/chat-input';
import { EmptyState } from '@/design-system/components/cambrian/empty-state';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { CitedAnswer } from './CitedAnswer';
import { useAsk } from './useAsk';

export interface AskPaneProps {
  disabled: boolean;
  disabledReason?: string;
  /** False when the kernel does not advertise `memory-answer` (ADR-0081). */
  canAnswer: boolean;
}

export function AskPane({ disabled, disabledReason, canAnswer }: AskPaneProps) {
  const [draft, setDraft] = useState('');
  const { question, answer, isAnswering, error, ask } = useAsk();

  const submit = (text: string) => {
    ask(text);
    setDraft('');
  };

  const asked = question !== '';
  const inputDisabled = disabled || !canAnswer;
  const inputReason = !canAnswer
    ? 'This kernel does not serve grounded answers (memory-answer capability off).'
    : disabledReason;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {!canAnswer ? (
          <EmptyState
            title="Answering not available"
            body="This kernel does not advertise the memory-answer capability (ADR-0081). Enable agentic retrieval on the kernel to get grounded, cited answers. Ingest and retrieval still work."
          />
        ) : !asked ? (
          <EmptyState
            title="Ask the corpus"
            body="Ingest documents on the left, then ask a question. The answer is grounded in your documents, with each claim linked to the exact passage it came from — click a highlighted passage to see its source."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">
              Answer
            </h2>
            {isAnswering ? (
              <p className="text-sm text-[var(--fg-muted)]">
                ▏retrieving and grounding an answer…
              </p>
            ) : error ? (
              <ErrorState
                reason={error}
                whatToDo="The answer lane failed. If the kernel lacks the memory-answer capability, enable agentic retrieval; otherwise check the connection."
              />
            ) : answer ? (
              <CitedAnswer answer={answer} />
            ) : null}
          </div>
        )}
      </div>

      <ChatInput
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        disabled={inputDisabled}
        disabledReason={inputReason}
        placeholder="Ask a question about the corpus…"
      />
    </div>
  );
}
