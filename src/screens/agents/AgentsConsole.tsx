
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { AgentSummary } from '@/ipc/types';
import type { AgentTrait } from './AgentTraitPill';
import { AgentFilters, type AgentFiltersState } from './AgentFilters';
import { AgentListRow } from './AgentListRow';
import { AgentDetail } from './AgentDetail';

const INITIAL_FILTERS: AgentFiltersState = {
  traits: [],
  timeRange: 'all',
  search: '',
};

function matchesTimeRange(iso: string, range: AgentFiltersState['timeRange']): boolean {
  if (range === 'all') return true;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const windowMs: Record<Exclude<AgentFiltersState['timeRange'], 'all'>, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return now - then <= windowMs[range];
}

function filterAgents(
  agents: AgentSummary[],
  filters: AgentFiltersState,
): AgentSummary[] {
  const q = filters.search.trim().toLowerCase();
  return agents.filter((a) => {
    if (filters.traits.length > 0 && !filters.traits.includes(a.trait as AgentTrait)) return false;
    if (!matchesTimeRange(a.last_activity_at, filters.timeRange)) return false;
    if (q) {
      const hay = `${a.id} ${a.scope_summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function AgentsConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<AgentFiltersState>(INITIAL_FILTERS);

  const agents = projection.state?.agents ?? [];
  const role = projection.state?.role ?? null;

  const filtered = useMemo(() => filterAgents(agents, filters), [agents, filters]);

  const selectedId = search.focus && agents.some((a) => a.id === search.focus)
    ? search.focus
    : null;

  useEffect(() => {
    if (search.focus && !agents.some((a) => a.id === search.focus)) {
      navigate({ to: '/agents', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, agents]);

  const handleSelect = (agentId: string) => {
    navigate({ to: '/agents', search: { focus: agentId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <AgentFilters
        filters={filters}
        onChange={setFilters}
      />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={agents.length === 0 ? 'No agents registered' : 'No agents match the filters'}
              body={
                agents.length === 0
                  ? 'Register an agent from the Settings panel to get started.'
                  : 'Adjust or reset the filters to see more agents.'
              }
            />
          ) : (
            <ul role="list" aria-label="Agents" className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((a) => (
                <li key={a.id}>
                  <AgentListRow
                    agent={a}
                    selected={a.id === selectedId}
                    onClick={() => handleSelect(a.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="Agent detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selectedId ? (
            <AgentDetail agentId={selectedId} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select an agent"
                  body="Pick an agent from the list to see its genotype, history, and mutating actions."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
