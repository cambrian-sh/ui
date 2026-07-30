import { formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { MCPServerSummary } from '@/ipc/types';

interface MCPListRowProps {
  server: MCPServerSummary;
  selected: boolean;
  onClick: () => void;
}

/** Older than this and "reachable" is a claim about the past, not the present. */
const STALE_MS = 5 * 60 * 1000;

function checkAge(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Date.now() - t : null;
}

/**
 * One MCP server, as a card.
 *
 * The card leads with reachability **and how stale that answer is**, because
 * those are two different facts and only the pair is useful: "up, checked 9s
 * ago" and "up, no answer for 2h" are the same word and opposite situations.
 *
 * Then the consequence — what is unavailable and whether anything has actually
 * failed because of it. A down server that nothing has asked for has not broken
 * anything yet, and saying so is the difference between a page an operator acts
 * on and a page of red they learn to ignore.
 */
export function MCPListRow({ server, selected, onClick }: MCPListRowProps) {
  const age = checkAge(server.last_health_check_at);
  const stale = age == null || age > STALE_MS;
  const up = server.connection_state === 'Up';

  const tone = !up
    ? 'var(--status-err)'
    : stale
      ? 'var(--status-warn)'
      : 'var(--status-live)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-[14px_16px] text-left transition-colors',
        'shadow-[var(--elevation-1)] hover:brightness-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        (!up || stale) && 'tint-wash tint-ring',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
      style={!up || stale ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', up && !stale && 'cambrian-live-pulse')}
          style={{ background: tone }}
        />
        <span className="truncate font-mono text-[13.5px] text-[var(--fg-primary)]">
          {server.id}
        </span>
        <span className="font-mono text-[11px]" style={{ color: tone }}>
          {server.connection_state.toLowerCase()}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          {/* How stale the answer is, always — never just the answer. */}
          {age == null
            ? 'never checked'
            : stale
              ? `no answer for ${relativeTime(server.last_health_check_at).replace(' ago', '')}`
              : `checked ${relativeTime(server.last_health_check_at)}`}
        </span>
      </div>

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {up && !stale ? (
          <>
            Its {server.tool_count} tool{server.tool_count === 1 ? ' is' : 's are'} available.
          </>
        ) : up && stale ? (
          <>
            It last answered a health check a while ago. Its {server.tool_count} tool
            {server.tool_count === 1 ? '' : 's'} may or may not still be reachable — the console
            cannot tell you which until the next check.
          </>
        ) : (
          <>
            Its {server.tool_count} tool{server.tool_count === 1 ? ' is' : 's are'} unavailable.
            Anything routed to {server.tool_count === 1 ? 'it' : 'them'} will fail its step.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-[var(--fg-muted)]">
        <span className="font-mono">
          {server.tool_count} tool{server.tool_count === 1 ? '' : 's'}
        </span>
        <span className="font-mono">{formatTokens(server.default_price)} tok default</span>
        {/* An MCP server is an external process: everything it is handed leaves
            this deployment. That is an effect, not a detail. */}
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none"
          style={{
            color: 'var(--status-warn)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-warn) 34%, transparent)',
          }}
        >
          egress
        </span>
      </div>
    </button>
  );
}
