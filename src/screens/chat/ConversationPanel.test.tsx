import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationPanel } from '@/screens/chat/ConversationPanel';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    openConversation: vi.fn().mockResolvedValue('conv-1'),
    sendTurn: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    listConversationMessages: vi.fn().mockResolvedValue([]),
  },
}));

import { ipc } from '@/ipc';

function makeState(capabilities: string[]): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0062',
    capabilities,
    contract_skew: 0,
    plugins: [],
    sessions: [],
    plans: [],
    agents: [],
    hitl: [],
    audit: [],
    llm_health: [],
    memory_writes: [],
    tools: [],
    skills: [],
    watches: [],
  } as unknown as StateOfRecord;
}

describe('ConversationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.openConversation).mockResolvedValue('conv-1');
    vi.mocked(ipc.listConversations).mockResolvedValue([]);
    vi.mocked(ipc.listConversationMessages).mockResolvedValue([]);
    projectionStore.getState().reset();
  });

  it('is hidden when the kernel does not advertise the chat capability', () => {
    projectionStore.getState().hydrate(makeState([]));
    render(<ConversationPanel />);
    expect(screen.getByTestId('chat-unavailable')).toBeInTheDocument();
    expect(ipc.listConversations).not.toHaveBeenCalled();
  });

  // With no existing conversations, the panel auto-starts a fresh one so the operator can
  // type immediately (ChatGPT-style).
  it('starts a new conversation when the list is empty', async () => {
    projectionStore.getState().hydrate(makeState(['chat']));
    render(<ConversationPanel />);
    await waitFor(() => expect(ipc.listConversations).toHaveBeenCalled());
    await waitFor(() => expect(ipc.openConversation).toHaveBeenCalled());
  });

  // An existing conversation is selected and its transcript loaded.
  it('selects the most recent conversation and loads its messages', async () => {
    vi.mocked(ipc.listConversations).mockResolvedValue([
      { id: 'c-existing', title: 'Prior chat', status: 'open', profile: 'operator', updated_at: new Date().toISOString() },
    ]);
    vi.mocked(ipc.listConversationMessages).mockResolvedValue([
      { id: 'm1', conversation_id: 'c-existing', seq: 1, role: 'user', content: 'earlier question', created_at: new Date().toISOString() },
    ]);
    projectionStore.getState().hydrate(makeState(['chat']));
    render(<ConversationPanel />);

    expect(await screen.findByText('Prior chat')).toBeInTheDocument();
    expect(await screen.findByText('earlier question')).toBeInTheDocument();
    expect(ipc.listConversationMessages).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c-existing' }),
    );
    // A pre-existing conversation is NOT auto-created.
    expect(ipc.openConversation).not.toHaveBeenCalled();
  });

  // Sending a turn shows the user message and appends the agent reply.
  it('sends a turn and renders the reply', async () => {
    vi.mocked(ipc.sendTurn).mockImplementation(async () => ({
      id: 'm2', conversation_id: 'conv-1', seq: 2, role: 'agent', content: 'hello back', created_at: new Date().toISOString(),
    }));
    projectionStore.getState().hydrate(makeState(['chat']));
    render(<ConversationPanel />);

    // wait for the auto-started conversation (input enabled)
    await waitFor(() => expect(ipc.openConversation).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'hi there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(ipc.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hi there', reason: 'chat-turn' }),
    ));
    expect(await screen.findByText('hi there')).toBeInTheDocument();
    expect(await screen.findByText('hello back')).toBeInTheDocument();
  });

  // The "New chat" button opens another conversation.
  it('starts another conversation via the New chat button', async () => {
    projectionStore.getState().hydrate(makeState(['chat']));
    render(<ConversationPanel />);
    await waitFor(() => expect(ipc.openConversation).toHaveBeenCalledTimes(1)); // auto-start
    fireEvent.click(screen.getByTestId('new-conversation'));
    await waitFor(() => expect(ipc.openConversation).toHaveBeenCalledTimes(2));
  });
});
