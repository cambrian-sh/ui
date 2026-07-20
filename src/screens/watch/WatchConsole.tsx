import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { WatchConfigSummary } from '@/ipc/types';
import { WatchFilters, type WatchFiltersState } from './WatchFilters';
import { WatchListRow } from './WatchListRow';
import { WatchDetail } from './WatchDetail';

const INITIAL_FILTERS: WatchFiltersState = {
  statuses: [],
  search: '',
};

function filterWatchConfigs(
  configs: WatchConfigSummary[],
  filters: WatchFiltersState,
): WatchConfigSummary[] {
  const q = filters.search.trim().toLowerCase();
  return configs.filter((c) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(c.last_fire_status as 'ok' | 'error' | 'pending')) return false;
    if (q) {
      const hay = `${c.id} ${c.target_streams.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function WatchConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<WatchFiltersState>(INITIAL_FILTERS);

  const configs = projection.state?.watch_configs ?? [];
  const role = projection.state?.role ?? null;

  const filtered = useMemo(() => filterWatchConfigs(configs, filters), [configs, filters]);

  const isFiltered = filters.statuses.length > 0 || filters.search.trim() !== '';

  const selectedId = search.focus && configs.some((c) => c.id === search.focus)
    ? search.focus
    : null;

  useEffect(() => {
    if (search.focus && !configs.some((c) => c.id === search.focus)) {
      navigate({ to: '/watch', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, configs]);

  const handleSelect = (configId: string) => {
    navigate({ to: '/watch', search: { focus: configId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <WatchFilters
        filters={filters}
        onChange={setFilters}
      />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={configs.length === 0 ? 'No watch configs' : 'No watch configs match the filters'}
              body={
                configs.length === 0
                  ? 'Watch configs will appear here when the kernel advertises the watch capability.'
                  : 'Adjust or reset the filters to see more watch configs.'
              }
              action={configs.length > 0 && isFiltered ? { label: 'Clear filters', onClick: () => setFilters(INITIAL_FILTERS) } : undefined}
            />
          ) : (
            <ul role="list" aria-label="Watch configs" className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((c) => (
                <li key={c.id}>
                  <WatchListRow
                    config={c}
                    selected={c.id === selectedId}
                    onClick={() => handleSelect(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="Watch detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selectedId ? (
            <WatchDetail configId={selectedId} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select a watch config"
                  body="Pick a watch config from the list to see its rule, target streams, and last fires."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
