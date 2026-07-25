// ConversationPanel — the OSS chat lane surface (ADR-0084 D9), ChatGPT-style.
//
// A two-pane layout: a sidebar listing the operator's conversations (+ "New chat") and a
// main thread for the active conversation. Distinct from the task-session chat (which drives
// the planner): a conversation turn is owned by a single agent loop on the kernel's chat
// worker pool and is never decomposed into a plan (ADR-0080).
//
// Gated on the "chat" capability — a kernel with the chat pool disabled does not advertise
// it and this screen shows an unavailable state rather than a broken surface.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatInput, EmptyState } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { ConversationMessage, ConversationSummary } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { errorMessage } from '@/lib/errorMessage';

/** Whether the kernel advertises the conversation lane. */
export function useChatCapability(): boolean {
  const projection = useStore(projectionStore);
  return projection.state?.capabilities?.includes('chat') ?? false;
}

export function ConversationPanel() {
  const chatEnabled = useChatCapability();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      setConversations(await ipc.listConversations({ limit: 100 }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const startNewConversation = useCallback(async () => {
    const id = crypto.randomUUID();
    try {
      await ipc.openConversation({
        conversation_id: id,
        title: 'New conversation',
        profile: 'operator',
        policy: '',
        reason: 'open-conversation',
      });
      setActiveId(id);
      setMessages([]);
      void refreshList();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [refreshList]);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setError(null);
    try {
      setMessages(await ipc.listConversationMessages({ conversation_id: id, after_seq: 0, limit: 0 }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // On mount (once the lane is available): load the list, then select the most recent
  // conversation or start a fresh one so the operator can type immediately.
  useEffect(() => {
    if (!chatEnabled) return;
    let cancelled = false;
    void (async () => {
      let list: ConversationSummary[] = [];
      try {
        list = await ipc.listConversations({ limit: 100 });
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
      if (cancelled) return;
      setConversations(list);
      if (list.length > 0) void selectConversation(list[0].id);
      else void startNewConversation();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatEnabled]);

  // Keep the newest turn in view. Guard scrollTo — jsdom (tests) does not implement it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  const onSubmit = useCallback(
    async (text: string) => {
      if (sending || !activeId) return;
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: `local-${prev.length}`, conversation_id: activeId, seq: prev.length + 1, role: 'user', content: text, created_at: now },
      ]);
      setDraft('');
      setSending(true);
      setError(null);
      try {
        const reply = await ipc.sendTurn({ conversation_id: activeId, text, reason: 'chat-turn' });
        if (reply) setMessages((prev) => [...prev, reply]);
        void refreshList();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSending(false);
      }
    },
    [sending, activeId, refreshList],
  );

  if (!chatEnabled) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="chat-unavailable">
        <EmptyState
          title="Conversation lane not enabled"
          body="This kernel does not advertise the chat capability. Enable the chat worker pool (execution.chat_pool_size > 0) to converse here."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="conversation-panel">
      {/* Sidebar — conversation list */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-subtle)]">
        <div className="p-2">
          <button
            className="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm hover:bg-[var(--bg-elevated)]"
            onClick={() => void startNewConversation()}
            data-testid="new-conversation"
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-1 text-xs text-[var(--fg-muted)]">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => void selectConversation(c.id)}
                    className={`w-full truncate rounded-sm px-2 py-1.5 text-left text-sm ${
                      c.id === activeId
                        ? 'bg-[var(--bg-elevated)] text-[var(--fg-primary)]'
                        : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]'
                    }`}
                    aria-current={c.id === activeId ? 'true' : undefined}
                  >
                    {c.title || 'Conversation'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread — active conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 p-4">
            {messages.length === 0 ? (
              <EmptyState title="No messages yet" body="Send a message to start the conversation." />
            ) : (
              messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  author={m.role === 'user' ? 'operator' : 'runtime'}
                  text={m.content}
                  timestamp={m.created_at}
                />
              ))
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmit}
            disabled={sending || !activeId}
            disabledReason={!activeId ? 'Select or start a conversation' : 'Sending…'}
            placeholder="Message…"
          />
          {error && (
            <div className="px-4 pb-2 text-xs text-[var(--fg-danger)]" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
