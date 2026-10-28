// The chat left rail (`12a` §C.3).
//
// "Conversations grouped **Working now** / **Earlier**, each with live state —
// so the list is a status board, not a history."
//
// That distinction is the whole design of this rail. A history tells you what
// you did; a status board tells you what is waiting. Grouping by whether a
// conversation is still live, and putting the thing that needs you in the
// subtitle, is what turns one into the other.

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import type { ConversationSummary, PlanInFlight, HITLIntervention } from '@/ipc/types';

export interface ConversationRailProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** In-flight plans, for the live state on a working conversation. */
  plans: PlanInFlight[];
  /** Interventions waiting on a human — the "1 waiting on you" half. */
  pendingHitl: HITLIntervention[];
  /** Rendered in the footer: the reach every conversation here inherits. */
  scopeLabel: string;
  role: string | null;
}

/**
 * A conversation's live state, in the operator's terms.
 *
 * The design's examples are `step 3 of 6 · 1 waiting on you` and
 * `paused · needs a tool grant`, both of which describe a PLAN. The kernel does
 * not link a conversation to the session its delegation started, so that join
 * cannot be made here without inventing it — and a rail that guessed which plan
 * belonged to which conversation would put "1 waiting on you" against the wrong
 * row, which is worse than not saying it.
 *
 * So: real plan state when exactly one plan is in flight (the unambiguous case),
 * and otherwise the honest fallback of when the conversation last moved.
 */
export function conversationState(
  conv: ConversationSummary,
  plans: PlanInFlight[],
  pendingHitl: HITLIntervention[],
): string {
  if (conv.status === 'closed') return relativeTime(conv.updated_at);

  // Only claim a plan belongs to this conversation when there is exactly one in
  // flight. Two plans and one open conversation is an ambiguity, not a match.
  if (plans.length === 1) {
    const p = plans[0];
    const done = p.steps?.filter((s) => s.status === 'done').length ?? 0;
    const total = p.step_count || p.steps?.length || 0;
    const waiting = pendingHitl.filter((h) => h.plan_id === p.plan_id).length;

    const parts: string[] = [];
    if (p.status === 'paused') parts.push('paused');
    else if (total > 0) parts.push(`step ${Math.min(done + 1, total)} of ${total}`);
    else parts.push('running');
    if (waiting > 0) parts.push(`${waiting} waiting on you`);
    return parts.join(' · ');
  }

  return relativeTime(conv.updated_at);
}

/** "just now" / "12m ago" / "yesterday" — the resolution an operator reads at. */
export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function ConversationRail({
  conversations,
  activeId,
  onSelect,
  onNew,
  plans,
  pendingHitl,
  scopeLabel,
  role,
}: ConversationRailProps) {
  // "Working now" is what is still open; everything else is history. The split is
  // by STATE rather than by recency, because a conversation paused three days ago
  // still needs you and a question answered a minute ago does not.
  const { working, earlier } = useMemo(() => {
    const working = conversations.filter((c) => c.status === 'open');
    const earlier = conversations.filter((c) => c.status !== 'open');
    return { working, earlier };
  }, [conversations]);

  return (
    <aside className="flex h-full min-h-0 w-[248px] flex-none flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex-none px-3 pb-2 pt-3">
        <Button variant="secondary" size="sm" className="w-full justify-start" onClick={onNew}>
          <Plus className="size-3.5" aria-hidden="true" />
          New conversation
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <RailGroup label="Working now" items={working} activeId={activeId} onSelect={onSelect}
          state={(c) => conversationState(c, plans, pendingHitl)} live />
        <RailGroup label="Earlier" items={earlier} activeId={activeId} onSelect={onSelect}
          state={(c) => conversationState(c, plans, pendingHitl)} />
        {conversations.length === 0 && (
          <p className="px-2 py-3 text-[12px] leading-[1.5] text-[var(--fg-muted)]">
            No conversations yet. Start one — nothing is committed until you approve a plan.
          </p>
        )}
      </div>

      {/* The reach every conversation in this rail inherits. It belongs on the
          list rather than inside a conversation, because it is the same for all
          of them and an operator asks it once. */}
      <div className="flex-none border-t border-[var(--border-subtle)] px-3 py-2.5 text-[12px]">
        <span className="text-[var(--fg-muted)]">Scope </span>
        <span className="inline-block text-[var(--fg-secondary)] first-letter:uppercase">
          {role ?? 'not connected'}
        </span>
        <span className="text-[var(--fg-secondary)]"> · {scopeLabel}</span>
      </div>
    </aside>
  );
}

function RailGroup({
  label,
  items,
  activeId,
  onSelect,
  state,
  live = false,
}: {
  label: string;
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  state: (c: ConversationSummary) => string;
  live?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-1">
      <div className="type-label px-2 pb-1 pt-2.5 text-[var(--fg-muted)]">
        {label}
      </div>
      <ul className="flex flex-col">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={activeId === c.id ? 'true' : undefined}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left',
                'hover:bg-[var(--list-row-bg-hover)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                activeId === c.id && 'bg-[var(--list-row-bg-selected)]',
              )}
            >
              <span className="truncate text-[13px] leading-[1.35] text-[var(--fg-primary)]">
                {c.title || 'Untitled'}
              </span>
              <span
                className={cn(
                  'truncate text-[11.5px]',
                  live ? 'text-[var(--status-live)]' : 'text-[var(--fg-muted)]',
                )}
              >
                {state(c)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
