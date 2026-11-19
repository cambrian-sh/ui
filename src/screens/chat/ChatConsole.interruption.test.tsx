import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatConsole } from '@/screens/chat/ChatConsole';
import { TurnInterruptedNotice } from '@/screens/chat/TurnInterruptedNotice';
import { projectionStore } from '@/store/projection';
import { rememberConversation } from '@/screens/chat/chatSession';
import type { StateOfRecord } from '@/ipc/types';

// ENG-2145: a message with role `interruption` (core ENG-2124: the turn ended
// without a reply) is drawn as a notice on the turn, not as an assistant reply.

// vi.mock factories are hoisted above top-level constants: hoist this one too.
const { INTERRUPTED } = vi.hoisted(() => ({
  INTERRUPTED: 'This turn was interrupted because the assistant restarted. Please send your message again.',
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock('@/ipc', () => ({
  ipc: {
    listConversations: vi.fn().mockResolvedValue([
      { id: 'conv-1', title: 'Refund logs', status: 'open', profile: 'operator', updated_at: new Date().toISOString() },
    ]),
    listConversationMessages: vi.fn().mockResolvedValue([
      { id: 'm1', conversation_id: 'conv-1', seq: 1, role: 'user', content: 'anything refunded twice?', created_at: new Date().toISOString() },
      { id: 'm2', conversation_id: 'conv-1', seq: 2, role: 'interruption', content: INTERRUPTED, created_at: new Date().toISOString() },
    ]),
    openConversation: vi.fn().mockResolvedValue('conv-new'),
    sendTurn: vi.fn().mockResolvedValue(null),
    classifyInput: vi.fn().mockResolvedValue({ classification: 'chat', reason: 'a question' }),
    proposePlan: vi.fn(),
    submitPlan: vi.fn(),
  },
}));

function makeState(): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: ['chat'],
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    scope: {},
    watch_configs: [],
  };
}

describe('ChatConsole — interrupted turns (ENG-2145)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    rememberConversation(null);
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(makeState());
  });

  it('renders an interruption message as a turn notice, not a reply', async () => {
    render(<ChatConsole />);
    const note = await waitFor(() => screen.getByRole('note', { name: 'This turn did not complete' }), { timeout: 5000 });
    expect(note).toHaveTextContent(INTERRUPTED);
    expect(note).toHaveTextContent('Turn did not complete');
    // The sentence appears once, inside the notice — never also as an assistant bubble.
    expect(screen.getAllByText(INTERRUPTED)).toHaveLength(1);
  }, 20_000);

  it('the notice shows the kernel sentence and survives a bad timestamp', () => {
    render(<TurnInterruptedNotice text="The provider failed." timestamp="not-a-date" />);
    expect(screen.getByRole('note')).toHaveTextContent('The provider failed.');
  });
});
