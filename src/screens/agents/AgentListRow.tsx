import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { AgentSummary, SurveillanceTrigger } from '@/ipc/types';
import { AgentTraitPill } from './AgentTraitPill';

interface AgentListRowProps {
  agent: AgentSummary;
  selected: boolean;
  onClick: () => void;
  /** Set when this agent is under 100% verification surveillance. */
  surveillance?: SurveillanceTrigger | null;
  /** Set when the agent is blocked waiting on a tool grant. */
  wantsGrant?: string | null;
}

/**
 * One agent, as a row.
 *
 * Trust is a **bar** rather than a number because the question is comparative —
 * which of these would win work — and two decimals side by side do not answer
 * that at a glance.
 *
 * The two states that change what an operator does are called out as kickers
 * rather than left to be inferred from a score: an agent under surveillance is
 * being verified on every task and its cause is worth reading, and an agent
 * blocked on a grant is not idle, it is *waiting for you*.
 */
export function AgentListRow({
  agent,
  selected,
  onClick,
  surveillance,
  wantsGrant,
}: AgentListRowProps) {
  const tinted = Boolean(surveillance || wantsGrant);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        'shadow-[inset_0_-1px_0_var(--border-subtle)]',
        'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        tinted && 'tint-wash',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
      style={tinted ? ({ '--tint': 'var(--status-warn)' } as React.CSSProperties) : undefined}
    >
      <div className="min-w-0 flex-1">
        {surveillance && (
          <div className="type-status mb-1 text-[var(--status-warn)]">
            Under surveillance — {surveillance.reason || 'recent outcomes fell below threshold'}
          </div>
        )}
        {!surveillance && wantsGrant && (
          <div className="type-status mb-1 text-[var(--status-warn)]">
            WANTS A GRANT — blocked on {wantsGrant}
          </div>
        )}

        <div className="flex items-center gap-2">
          <AgentTraitPill trait={agent.trait} />
          <span className="truncate font-mono text-[13.5px] text-[var(--fg-primary)]">
            {agent.id}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--fg-muted)]">
          <span className="max-w-48 truncate">
            {agent.scope_summary || 'no scope reported'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(agent.last_activity_at)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <TrustBar score={agent.trust_score} />
        <span className="w-[70px] text-right font-mono text-[10px] text-[var(--fg-muted)]">
          {agent.last_state || 'unknown'}
        </span>
      </div>
    </button>
  );
}

/** 96px of trust, with the value in mono beside it. */
function TrustBar({ score }: { score: number }) {
  const pct = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) * 100 : 0;
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-1.5 w-[96px] overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]"
        role="img"
        aria-label={`TrustScore ${pct.toFixed(0)} of 100`}
      >
        <span
          className="block h-full rounded-[3px]"
          style={{
            width: `${pct}%`,
            // Low trust is a fact about the agent, not an alarm — it is coloured
            // by severity so a new agent does not read as a fault.
            background:
              pct >= 70
                ? 'var(--status-live)'
                : pct >= 40
                  ? 'var(--status-warn)'
                  : 'var(--status-err)',
          }}
        />
      </span>
      <span className="w-[26px] text-right font-mono text-[11px] tabular-nums text-[var(--fg-secondary)]">
        {pct.toFixed(0)}
      </span>
    </span>
  );
}
