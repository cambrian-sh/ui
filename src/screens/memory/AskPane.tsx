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
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-[var(--page-gutter)] py-6">
        {!canAnswer ? (
          <EmptyState
            className="my-auto"
            title="Answering not available"
            body="This kernel does not advertise the memory-answer capability (ADR-0081). Enable agentic retrieval on the kernel to get grounded, cited answers. Ingest and retrieval still work."
          />
        ) : !asked ? (
          <EmptyState
            className="my-auto"
            title="Ask your documents"
            body="Add documents on the left, then ask a question. The answer is grounded in your documents, with each claim linked to the exact passage it came from — click a highlighted passage to see its source."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="self-end rounded-[var(--radius-xl)] rounded-tr-[var(--radius-sm)] bg-[var(--list-row-bg-selected)] px-3.5 py-2 text-[14px] leading-[1.55] text-[var(--fg-primary)]">
              {question}
            </p>
            <h2 className="type-label mt-2 text-[var(--fg-muted)]">Answer</h2>
            {isAnswering ? (
              <p className="flex items-center gap-2 text-[13.5px] text-[var(--fg-muted)]">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-[var(--status-live)]" />
                Finding the answer in your documents…
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
      </div>

      <ChatInput
        className="mx-auto w-full max-w-[760px] px-[var(--page-gutter)] pb-4 pt-2"
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        disabled={inputDisabled}
        disabledReason={inputReason}
        placeholder="Ask a question about your documents…"
      />
    </div>
  );
}
