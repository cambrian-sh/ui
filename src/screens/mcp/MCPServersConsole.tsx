import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { MCPServerSummary } from '@/ipc/types';
import { MCPFilters, type MCPFiltersState } from './MCPFilters';
import { MCPListRow } from './MCPListRow';
import { MCPDetail } from './MCPDetail';

const INITIAL_FILTERS: MCPFiltersState = {
  connectionState: 'all',
  search: '',
};

function filterServers(
  servers: MCPServerSummary[],
  filters: MCPFiltersState,
): MCPServerSummary[] {
  const q = filters.search.trim().toLowerCase();
  return servers.filter((s) => {
    if (filters.connectionState !== 'all' && s.connection_state !== filters.connectionState) return false;
    if (q) {
      const hay = s.id.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function MCPServersConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<MCPFiltersState>(INITIAL_FILTERS);

  const servers = projection.state?.mcp_servers ?? [];
  const role = projection.state?.role ?? null;

  const filtered = useMemo(() => filterServers(servers, filters), [servers, filters]);

  const selectedId = search.focus && servers.some((s) => s.id === search.focus)
    ? search.focus
    : null;

  useEffect(() => {
    if (search.focus && !servers.some((s) => s.id === search.focus)) {
      navigate({ to: '/mcp', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, servers]);

  const handleSelect = (serverId: string) => {
    navigate({ to: '/mcp', search: { focus: serverId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <MCPFilters filters={filters} onChange={setFilters} />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={servers.length === 0 ? 'No MCP servers registered' : 'No MCP servers match the filters'}
              body={
                servers.length === 0
                  ? 'Register an MCP server from the Settings panel to get started.'
                  : 'Adjust or reset the filters to see more servers.'
              }
            />
          ) : (
            <ul role="list" aria-label="MCP servers" className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((s) => (
                <li key={s.id}>
                  <MCPListRow
                    server={s}
                    selected={s.id === selectedId}
                    onClick={() => handleSelect(s.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="MCP server detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selectedId ? (
            <MCPDetail serverId={selectedId} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select an MCP server"
                  body="Pick a server from the list to see its connection state, discovered tools, and actions."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
