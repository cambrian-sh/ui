import { Link } from '@tanstack/react-router';
import { CustomServers } from './CustomServers';

/**
 * The configured-integrations listing (MCP servers + the Telegram door),
 * rendered by IntegrationsConsole. Moved out of Settings 2026-11-06.
 *
 * MCP servers are managed here (CustomServers, contract 0097): Integrations owns
 * every MCP server change (owner decision 2026-11-15); Runtime › MCP is the
 * read-only view.
 *
 * **Telegram is NOT here.** A bridge that carries real people is a destination
 * of its own — its people, its activity and its credential are three different
 * jobs on three different clocks. The link below goes there rather than
 * reproducing the panel, because two places to change one thing is how they
 * drift.
 */
export function IntegrationsSettings({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="flex flex-col gap-5">
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

      <CustomServers />
    </div>
  );
}
