import { Link } from '@tanstack/react-router';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { relativeTime } from '@/lib/relativeTime';
import { cn } from '@/design-system/lib/utils';

/**
 * Integrations — where the outside world connects.
 *
 * MCP servers are shown read-only here with a link through to Runtime, because
 * their management surface already exists and duplicating it would give two
 * places to change the same thing.
 *
 * **Telegram is NOT here.** A bridge that carries real people is a destination
 * of its own — its people, its activity and its credential are three different
 * jobs on three different clocks. The link below goes there rather than
 * reproducing the panel, because two places to change one thing is how they
 * drift.
 */
export function IntegrationsSettings({ capabilities }: { capabilities: string[] }) {
  const projection = useStore(projectionStore);
  const servers = projection.state?.mcp_servers ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[17px] font-medium leading-[1.25] tracking-[-0.01em]">
          Integrations
        </h2>
        <p className="mt-1 max-w-[660px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
          External processes this deployment depends on. For each one, what you asked for and
          what is actually happening are shown as separate facts.
        </p>
      </div>

      {capabilities.includes('telegram-ingress') && (
        <section className="flex items-baseline justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <div>
            <h3 className="text-[13.5px] font-medium">Telegram</h3>
            <p className="mt-0.5 text-[12px] leading-[1.55] text-[var(--fg-muted)]">
              A bot as an entry point into Cambrian. Its token, its switch, who each sender is
              and what policy did to them all live with the plugin.
            </p>
          </div>
          <Link
            to="/telegram"
            search={{ tab: undefined, bot: undefined }}
            className="shrink-0 text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            Open Telegram →
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-medium">MCP servers</h3>
          <Link
            to="/mcp"
            search={{ focus: undefined }}
            className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            Manage in Runtime →
          </Link>
        </div>

        {servers.length === 0 ? (
          // Structurally empty on every current kernel — see report.md §4.7.
          // Saying "none configured" here would be a claim the console cannot
          // actually make.
          <p className="text-[12px] leading-[1.55] text-[var(--fg-muted)]">
            This kernel does not project its MCP servers — there is no RPC and no feed event
            for them — so the console cannot tell an empty deployment apart from an unreported
            one. Whatever is configured is not visible here yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {servers.map((s) => {
              const up = s.connection_state === 'Up';
              const tone = up
                ? 'var(--status-live)'
                : s.connection_state === 'Reconnecting'
                  ? 'var(--status-warn)'
                  : 'var(--status-err)';
              return (
                <li key={s.id} className="flex items-center gap-2 text-[12px]">
                  <span
                    aria-hidden="true"
                    className={cn('size-1.5 shrink-0 rounded-full', up && 'cambrian-live-pulse')}
                    style={{ background: tone }}
                  />
                  <span className="font-mono">{s.id}</span>
                  <span style={{ color: tone }}>{s.connection_state}</span>
                  <span className="text-[var(--fg-muted)]">
                    {s.tool_count} tool{s.tool_count === 1 ? '' : 's'}
                    {s.last_health_check_at && (
                      <> · checked {relativeTime(s.last_health_check_at)}</>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
