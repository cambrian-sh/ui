import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { ScopeSummary } from '@/ipc/types';
import { ScopeFilters, type ScopeFiltersState } from './ScopeFilters';
import { ScopeListRow } from './ScopeListRow';
import { ScopeDetail } from './ScopeDetail';

const INITIAL_FILTERS: ScopeFiltersState = {
  search: '',
};

function filterScopes(
  scopes: ScopeSummary[],
  filters: ScopeFiltersState,
): ScopeSummary[] {
  const q = filters.search.trim().toLowerCase();
  return scopes.filter((s) => {
    if (q) {
      const hay = `${s.agent_id} ${s.effective_scope_summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function ScopeConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<ScopeFiltersState>(INITIAL_FILTERS);

  const scopeMap = projection.state?.scope ?? {};
  const scopes = useMemo(() => Object.values(scopeMap), [scopeMap]);
  const role = projection.state?.role ?? null;

  const filtered = useMemo(() => filterScopes(scopes, filters), [scopes, filters]);

  const selectedId = search.focus && scopes.some((s) => s.agent_id === search.focus)
    ? search.focus
    : null;

  useEffect(() => {
    if (search.focus && !scopes.some((s) => s.agent_id === search.focus)) {
      navigate({ to: '/scope', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, scopes]);

  const handleSelect = (agentId: string) => {
    navigate({ to: '/scope', search: { focus: agentId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <ScopeFilters filters={filters} onChange={setFilters} />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={scopes.length === 0 ? 'No agents to scope' : 'No agents match the filters'}
              body={
                scopes.length === 0
                  ? 'Scope data will appear here when agents are registered.'
                  : 'Adjust or reset the filters to see more agents.'
              }
            />
          ) : (
            <ul role="list" aria-label="Agent scopes" className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((s) => (
                <li key={s.agent_id}>
                  <ScopeListRow
                    scope={s}
                    selected={s.agent_id === selectedId}
                    onClick={() => handleSelect(s.agent_id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="Scope detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selectedId ? (
            <ScopeDetail agentId={selectedId} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select an agent"
                  body="Pick an agent from the list to see its effective scope, caller scope, write tags, and history."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
