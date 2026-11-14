import { Link } from '@tanstack/react-router';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { cn } from '@/design-system/lib/utils';
import type { MCPServerConfig } from '@/ipc/types';

/**
 * MCP servers — the READ-ONLY runtime view (contract 0097 `ListMCPServers`):
 * declared config plus live connection facts, for watching what the kernel is
 * connected to.
 *
 * Owner decision 2026-11-15 (T-20261113-two-write-surfaces-for-mcp-servers-mcp-console):
 * Integrations OWNS every MCP server change — catalog installs, custom servers,
 * secrets, enable/disable, remove — so there is one place to change one thing.
 * This screen links there instead of carrying a second write surface.
 */
export function MCPServersConsole() {
  const servers = useKernelQuery(['mcp-server-configs'], () => ipc.listMCPServerConfigs());

  if (servers.error) {
    return (
      <div className="p-4">
        <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <h2 className="type-section-title">MCP servers</h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
            This kernel does not serve the MCP configuration surface (contract 0097). The
            screen is built and will populate when the kernel does — it is not showing you an
            empty deployment.
          </p>
        </div>
      </div>
    );
  }

  if (servers.isLoading) {
    return (
      <p className="p-4 text-[12.5px] text-[var(--fg-muted)]">Loading MCP servers…</p>
    );
  }

  const list = servers.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-page-title">
            MCP servers
          </h2>
          <p className="type-page-description mt-1">
            {list.length === 0
              ? 'No servers yet.'
              : `${list.length} server${list.length === 1 ? '' : 's'}. Their tools are offered to agents as mcp:<id>/<tool>.`}
          </p>
        </div>
        <Link
          to="/integrations"
          className="shrink-0 text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Add or change servers in Integrations →
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((s) => (
          <ServerCard key={s.id} server={s} />
        ))}
      </div>
    </div>
  );
}

function ServerCard({ server: s }: { server: MCPServerConfig }) {
  const tone = s.connected ? 'var(--status-live)' : 'var(--status-warn)';
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', s.connected && 'cambrian-live-pulse')}
          style={{ background: tone }}
        />
        <span className="font-mono text-[13px] font-medium">{s.id}</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{s.transport}</span>
      </div>

      <p className="truncate font-mono text-[11px] text-[var(--fg-secondary)]">
        {s.endpoint}
        {s.args.length > 0 && ` ${s.args.join(' ')}`}
      </p>

      {s.classification_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.classification_tags.map((t) => (
            <span
              key={t}
              className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {s.connected ? (
          <>
            Connected · {s.tool_count} tool{s.tool_count === 1 ? '' : 's'} on the menu
            {s.token_configured && ` · token from ${s.token_source}`}.
          </>
        ) : (
          <span className="text-[var(--status-warn)]">
            {s.last_error || 'Not connected.'} The kernel keeps retrying with backoff.
          </span>
        )}
      </p>
    </div>
  );
}
