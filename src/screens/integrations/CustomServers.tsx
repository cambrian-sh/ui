import { useState } from 'react';
import { Button } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { cn } from '@/design-system/lib/utils';
import type { MCPServerConfig } from '@/ipc/types';
import { MCPServerEditor, newServerDraft } from '@/screens/mcp/MCPServerEditor';

/**
 * Custom MCP servers — servers that are not catalog integrations (contract 0097:
 * add, edit, test, token, remove; a save is live).
 *
 * Owner decision 2026-11-15 (T-20261113-two-write-surfaces-for-mcp-servers-mcp-console):
 * Integrations owns every MCP server change, so the raw-server editor that used
 * to live on Runtime › MCP is reached from here; /mcp is the read-only runtime view.
 *
 * `exclude` hides servers already shown as catalog integrations (their changes go
 * through the integration card: secrets, enable, remove).
 */
export function CustomServers({ exclude = [] }: { exclude?: string[] }) {
  const projection = useStore(projectionStore);
  const canMutate = (projection.state?.role ?? null) === 'operator';
  const servers = useKernelQuery(['mcp-server-configs'], () => ipc.listMCPServerConfigs());
  const [editing, setEditing] = useState<MCPServerConfig | null>(null);

  const hidden = new Set(exclude);
  const list = (servers.data ?? []).filter((s) => !hidden.has(s.id));

  if (editing) {
    return (
      <section aria-label="Custom MCP server" className="w-full max-w-[860px]">
        <MCPServerEditor server={editing} canMutate={canMutate} onClose={() => setEditing(null)} />
      </section>
    );
  }

  return (
    <section aria-label="Custom MCP servers" className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-medium">Custom MCP servers</h3>
          <p className="mt-0.5 text-[12px] leading-[1.55] text-[var(--fg-muted)]">
            A server that is not in the catalog. Saving connects it now — no restart.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(newServerDraft())} disabled={!canMutate || Boolean(servers.error)}>
          Add server
        </Button>
      </div>
      {servers.error ? (
        <p className="text-[12px] leading-[1.55] text-[var(--fg-muted)]">
          This kernel does not serve the MCP configuration surface (contract 0097).
        </p>
      ) : list.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">No custom servers.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((s) => {
            const tone = s.connected ? 'var(--status-live)' : 'var(--status-warn)';
            return (
              <li key={s.id} className="flex items-center gap-2 text-[12px]">
                <span
                  aria-hidden="true"
                  className={cn('size-1.5 shrink-0 rounded-full', s.connected && 'cambrian-live-pulse')}
                  style={{ background: tone }}
                />
                <span className="font-mono">{s.id}</span>
                <span style={{ color: tone }}>{s.connected ? 'connected' : 'retrying'}</span>
                <span className="text-[var(--fg-muted)]">
                  {s.tool_count} tool{s.tool_count === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="ml-auto text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                >
                  Edit →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
