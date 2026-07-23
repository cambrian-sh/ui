import { useCallback, useState } from 'react';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import type { AnswerMemory } from '@/ipc/types';

export interface AskState {
  question: string;
  answer: AnswerMemory | null;
  isAnswering: boolean;
  error: string | null;
}

const EMPTY: AskState = { question: '', answer: null, isAnswering: false, error: null };

/**
 * Drives one question against the grounded answer lane (ADR-0081).
 *
 * `answerMemory` runs the agentic retrieval loop kernel-side and returns a
 * grounded, [n]-cited answer with the evidence each marker resolves to. This
 * replaces the option-(A) chat-lane hack, whose answer went through the planner
 * (hollow turns, ADR-0080) and whose citations were a separate, non-causal pass.
 * The answer and its citations now come from the SAME synthesis.
 */
export function useAsk() {
  const [state, setState] = useState<AskState>(EMPTY);

  const ask = useCallback(async (question: string) => {
    setState({ question, answer: null, isAnswering: true, error: null });
    try {
      const answer = await ipc.answerMemory({
        query: question,
        top_k: 8,
        source: '',
        session: '',
        min_importance: 0,
      });
      setState({ question, answer, isAnswering: false, error: null });
    } catch (err) {
      setState({ question, answer: null, isAnswering: false, error: errorMessage(err) });
    }
  }, []);

  return { ...state, ask };
}
