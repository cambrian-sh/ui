
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { SessionSummary } from '@/ipc/types';
import { SessionFilters, type SessionFiltersState } from './SessionFilters';
import { SessionListRow } from './SessionListRow';
import { SessionDetail } from './SessionDetail';

const INITIAL_FILTERS: SessionFiltersState = {
  states: [],
  timeRange: 'all',
  agents: [],
  search: '',
};

function matchesTimeRange(iso: string, range: SessionFiltersState['timeRange']): boolean {
  if (range === 'all') return true;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const windowMs: Record<Exclude<SessionFiltersState['timeRange'], 'all'>, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return now - then <= windowMs[range];
}

function filterSessions(
  sessions: SessionSummary[],
  filters: SessionFiltersState,
): SessionSummary[] {
  const q = filters.search.trim().toLowerCase();
  return sessions.filter((s) => {
    if (filters.states.length > 0 && !filters.states.includes(s.state)) return false;
    if (!matchesTimeRange(s.last_activity_at, filters.timeRange)) return false;
    if (q) {
      const hay = `${s.title} ${s.session_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function SessionsConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<SessionFiltersState>(INITIAL_FILTERS);

  const sessions = projection.state?.sessions ?? [];
  const role = projection.state?.role ?? null;
  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => s.agent_mix.forEach((a) => set.add(a)));
    return Array.from(set).sort();
  }, [sessions]);

  const filtered = useMemo(() => filterSessions(sessions, filters), [sessions, filters]);

  const selectedId = search.focus && sessions.some((s) => s.session_id === search.focus)
    ? search.focus
    : null;
  const selected = selectedId ? sessions.find((s) => s.session_id === selectedId) ?? null : null;

  useEffect(() => {
    if (search.focus && !sessions.some((s) => s.session_id === search.focus)) {
      navigate({ to: '/sessions', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, sessions]);

  const handleSelect = (sessionId: string) => {
    navigate({ to: '/sessions', search: { focus: sessionId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <SessionFilters
        filters={filters}
        onChange={setFilters}
        availableAgents={availableAgents}
      />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <EmptyState
              title={sessions.length === 0 ? 'No sessions yet' : 'No sessions match the filters'}
              body={
                sessions.length === 0
                  ? 'Create a session from the chat surface to get started.'
                  : 'Adjust or reset the filters to see more sessions.'
              }
            />
          ) : (
            <ul role="list" aria-label="Sessions" className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((s) => (
                <li key={s.session_id}>
                  <SessionListRow
                    session={s}
                    selected={s.session_id === selectedId}
                    onClick={() => handleSelect(s.session_id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="Session detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selected ? (
            <SessionDetail session={selected} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select a session"
                  body="Pick a session from the list to see its details, checkpoints, and mutating actions."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
