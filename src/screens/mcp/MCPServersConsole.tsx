import { useState } from 'react';
import { Button } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { cn } from '@/design-system/lib/utils';
import type { MCPServerConfig } from '@/ipc/types';
import { MCPServerEditor, newServerDraft } from './MCPServerEditor';

/**
 * MCP servers — the ONE surface (contract 0097).
 *
 * This screen used to render a feed projection (`mcp_servers` on the state of
 * record) that no kernel ever populated: the shape predated the real read RPC
 * and showed "no servers registered" on every deployment forever. It now reads
 * `ListMCPServers` — declared config plus live connection facts — and carries
 * the whole write surface: add, edit, test, token, remove. A save is LIVE: the
 * kernel arms the server's health loop immediately, tools appear as soon as
 * the server answers, and an unreachable one is retried with backoff.
 */
export function MCPServersConsole() {
  const projection = useStore(projectionStore);
  const canMutate = (projection.state?.role ?? null) === 'operator';

  const servers = useKernelQuery(['mcp-server-configs'], () => ipc.listMCPServerConfigs());
  const [editing, setEditing] = useState<MCPServerConfig | null>(null);

  if (servers.error) {
    return (
      <div className="p-4">
        <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <h2 className="text-[15px] font-medium">MCP servers</h2>
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

  if (editing) {
    return (
      <div className="mx-auto w-full max-w-[860px] p-4 pb-10">
        <MCPServerEditor
          server={editing}
          canMutate={canMutate}
          onClose={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-medium leading-[1.25] tracking-[-0.01em]">
            MCP servers
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
            {list.length === 0
              ? 'No servers yet. Adding one connects it now — no restart.'
              : `${list.length} server${list.length === 1 ? '' : 's'}. Their tools are offered to agents as mcp:<id>/<tool>.`}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(newServerDraft())} disabled={!canMutate}>
          Add server
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((s) => (
          <ServerCard key={s.id} server={s} onEdit={() => setEditing(s)} />
        ))}
      </div>
    </div>
  );
}

function ServerCard({ server: s, onEdit }: { server: MCPServerConfig; onEdit: () => void }) {
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
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Edit →
        </button>
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
