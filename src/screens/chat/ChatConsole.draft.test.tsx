import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatConsole } from '@/screens/chat/ChatConsole';
import { projectionStore } from '@/store/projection';
import { rememberConversation } from '@/screens/chat/chatSession';
import type { StateOfRecord } from '@/ipc/types';

// UI-009 / PRD-03 §11, Story 53: a draft survives a refresh and a restart.
//
// The task surface (/tasks/$taskId) had this from the start; the /chat screen —
// the composer an operator actually types into most — kept its text in
// `useState('')`, so a restart lost it. These tests drive the real screen
// against a jsdom localStorage: nothing here reaches into the hook, so a
// future change that swaps the storage keeps passing only if a remount still
// shows what was typed.

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock('@/ipc', () => ({
  ipc: {
    listConversations: vi.fn().mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Refund logs',
        status: 'open',
        profile: 'operator',
        updated_at: new Date().toISOString(),
      },
    ]),
    listConversationMessages: vi.fn().mockResolvedValue([]),
    openConversation: vi.fn().mockResolvedValue('conv-new'),
    sendTurn: vi.fn().mockResolvedValue(null),
    classifyInput: vi.fn().mockResolvedValue({ classification: 'chat', reason: 'a question' }),
    proposePlan: vi.fn(),
    submitPlan: vi.fn(),
  },
}));

function makeState(): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    // `chat` is what makes the screen list and select a conversation at all.
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
    skills: [],
    scope: {},
    watch_configs: [],
    lifecycle: {
      scheduler_state: 'idle',
      pending_jobs: 0,
      last_consolidation: null,
      dormancy_events: [],
    },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
    },
  };
}

const composer = () => screen.getByLabelText('What do you want') as HTMLTextAreaElement;

// Two full mounts of the chat screen plus a debounced write: alone that is ~1.5 s,
// under the full suite's parallel load it has exceeded vitest's 5 s default.
const TEST_TIMEOUT_MS = 20_000;

/** The persisted draft for a conversation, found by key suffix so the test does not restate the hook's key format. */
function storedDraft(conversationId: string): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('draft:') && k.endsWith(`:chat:${conversationId}`)) {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as { value?: string }).value ?? '' : null;
    }
  }
  return null;
}

async function renderAndSettle() {
  const view = render(<ChatConsole />);
  // The screen selects the remembered (or first) conversation after listing;
  // the draft is keyed by that id, so wait until the composer belongs to it.
  // The title is rendered twice (rail entry and header); the heading is the
  // one that means "this conversation is active".
  await waitFor(
    () => expect(screen.getByRole('heading', { name: 'Refund logs' })).toBeInTheDocument(),
    { timeout: 5000 },
  );
  return view;
}

describe('ChatConsole — draft persistence (UI-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    rememberConversation(null);
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(makeState());
  });

  it('restores a half-written message after the screen is torn down and rebuilt', async () => {
    const first = await renderAndSettle();
    fireEvent.change(composer(), { target: { value: 'anything refunded twice?' } });

    // The write is debounced (200 ms); it must have landed before the "restart".
    // Generous timeout: under the full suite's load a 1 s default has lapsed.
    await waitFor(() => expect(storedDraft('conv-1')).toBe('anything refunded twice?'), {
      timeout: 5000,
    });

    // Unmount is the closest jsdom gets to a restart: the component's state is
    // gone, and only what reached storage can come back.
    first.unmount();
    await renderAndSettle();

    expect(composer().value).toBe('anything refunded twice?');
  }, TEST_TIMEOUT_MS);

  it('clears the persisted draft once the message is sent', async () => {
    await renderAndSettle();
    fireEvent.change(composer(), { target: { value: 'send me' } });
    await waitFor(() => expect(storedDraft('conv-1')).toBe('send me'), { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(composer().value).toBe(''), { timeout: 5000 });
    // A sent message left in storage would come back as a draft on the next
    // launch and get sent twice.
    await waitFor(() => expect(storedDraft('conv-1')).toBe(''), { timeout: 5000 });
  }, TEST_TIMEOUT_MS);
});
