import { describe, expect, it, beforeEach } from 'vitest';
import {
  EMPTY_WORK,
  clearChatSession,
  rememberConversation,
  rememberWork,
  rememberedConversation,
  rememberedWork,
} from './chatSession';
import type { ClassifiedInput, SubmitPlanResult } from '@/ipc/types';

const classified: ClassifiedInput = {
  classification: 'plan',
  why: 'asks for a file',
  confidence: 0.9,
};

const started: SubmitPlanResult = {
  command_id: 'c1',
  deduped: false,
  accepted: true,
  session_id: 'sess-1',
  plan_id: 'p1',
  issues: [],
  execution_order: [0, 1],
};

beforeEach(() => clearChatSession());

describe('chatSession', () => {
  it('remembers which conversation the operator was in', () => {
    expect(rememberedConversation()).toBeNull();
    rememberConversation('conv-a');
    expect(rememberedConversation()).toBe('conv-a');
  });

  it('keeps work per conversation, so a proposal cannot cross over', () => {
    rememberWork('conv-a', { ...EMPTY_WORK, classified });
    rememberWork('conv-b', { ...EMPTY_WORK, accessNote: 'b only' });

    expect(rememberedWork('conv-a').classified).toEqual(classified);
    // Approving conv-a's plan while reading conv-b is the failure this prevents.
    expect(rememberedWork('conv-b').classified).toBeNull();
    expect(rememberedWork('conv-b').accessNote).toBe('b only');
  });

  it('survives the run outcome, which is what a route change was throwing away', () => {
    rememberWork('conv-a', { ...EMPTY_WORK, started });
    expect(rememberedWork('conv-a').started?.session_id).toBe('sess-1');
  });

  it('returns empty for an unknown conversation rather than undefined', () => {
    expect(rememberedWork('never-seen')).toEqual(EMPTY_WORK);
    expect(rememberedWork(null)).toEqual(EMPTY_WORK);
  });

  it('does not retain an entry that holds nothing', () => {
    rememberWork('conv-a', { ...EMPTY_WORK, classified });
    rememberWork('conv-a', EMPTY_WORK);
    // Clearing must actually clear — a stale classification reappearing after the
    // operator dismissed it is worse than losing it.
    expect(rememberedWork('conv-a').classified).toBeNull();
  });
});
