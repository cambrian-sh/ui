import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button, EmptyState, PageHeader, ScrollArea } from '@/design-system/components';
import { Inspector } from '@/components/InspectorSlot';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { rankSessions } from '@/lib/sessions';
import { sessionSubject } from '@/lib/format';
import { useBreakpoint } from '@/lib/useBreakpoint';
import type { SessionSummary } from '@/ipc/types';
import { TaskFilters, type TaskFiltersState } from './TaskFilters';
import { TaskListRow } from './TaskListRow';
import { TaskDetail } from './TaskDetail';

const INITIAL_FILTERS: TaskFiltersState = {
  states: [],
  timeRange: 'all',
  agents: [],
  search: '',
};

export function matchesTimeRange(iso: string, range: TaskFiltersState['timeRange']): boolean {
  if (range === 'all') return true;
  const then = new Date(iso).getTime();
  // A session with no timestamp is UNKNOWN, not "outside the window". Without this guard
  // `now - NaN <= window` is false for every session, so picking any range but "all"
  // emptied the list entirely. relativeTime() has always guarded this; the filter did not.
  if (!Number.isFinite(then)) return true;
  const now = Date.now();
  const windowMs: Record<Exclude<TaskFiltersState['timeRange'], 'all'>, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return now - then <= windowMs[range];
}

export function filterTasks(
  sessions: SessionSummary[],
  filters: TaskFiltersState,
): SessionSummary[] {
  const q = filters.search.trim().toLowerCase();
  return sessions.filter((s) => {
    if (filters.states.length > 0 && !filters.states.includes(s.state)) return false;
    if (!matchesTimeRange(s.last_activity_at, filters.timeRange)) return false;
    // The agent filter was counted in isFiltered but never applied here, so selecting an
    // agent narrowed nothing.
    if (filters.agents.length > 0 && !s.agent_mix.some((a) => filters.agents.includes(a))) {
      return false;
    }
    if (q) {
      // The derived subject is searched too: it is what the row displays, and a
      // search that cannot find what is on screen reads as broken.
      const hay = `${s.title} ${sessionSubject(s.title)} ${s.session_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function TasksConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<TaskFiltersState>(INITIAL_FILTERS);
  const breakpoint = useBreakpoint();

  const rawSessions = projection.state?.sessions ?? [];
  const plans = projection.state?.plans ?? [];
  const pendingHitl = projection.state?.pending_hitl ?? [];

  // The kernel's SessionSummaryOp carries only {id, goal, status}: plan count, cost and
  // agent mix are not the SessionManager's to know. They ARE derivable from the plans the
  // console already holds, so join them here rather than rendering three permanent zeroes.
  const sessions = useMemo(() => {
    const bySession = new Map<string, { plans: number; cost: number; agents: Set<string> }>();
    for (const p of plans) {
      const acc = bySession.get(p.session_id) ?? { plans: 0, cost: 0, agents: new Set<string>() };
      acc.plans += 1;
      acc.cost += p.cost;
      if (p.active_agent) acc.agents.add(p.active_agent);
      bySession.set(p.session_id, acc);
    }
    return rawSessions.map((s) => {
      const acc = bySession.get(s.session_id);
      if (!acc) return s;
      return {
        ...s,
        plan_count: s.plan_count || acc.plans,
        cost: s.cost || acc.cost,
        agent_mix: s.agent_mix.length > 0 ? s.agent_mix : Array.from(acc.agents).sort(),
      };
    });
  }, [rawSessions, plans]);

  const role = projection.state?.role ?? null;
  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => s.agent_mix.forEach((a) => set.add(a)));
    return Array.from(set).sort();
  }, [sessions]);

  const filtered = useMemo(() => filterTasks(sessions, filters), [sessions, filters]);

  // What needs you, then what is moving, then the rest. Never plain
  // reverse-chronological: a session blocked on an approval goes quiet, so
  // sorting by last activity buries the one row that needs a human.
  const ranked = useMemo(
    () => rankSessions(filtered, pendingHitl, plans),
    [filtered, pendingHitl, plans],
  );

  const waitingCount = ranked.filter((r) => r.attention === 'waiting').length;
  const runningCount = ranked.filter((r) => r.attention === 'running').length;

  const isFiltered =
    filters.states.length > 0 ||
    filters.timeRange !== 'all' ||
    filters.agents.length > 0 ||
    filters.search.trim() !== '';

  const selectedId = search.focus && sessions.some((s) => s.session_id === search.focus)
    ? search.focus
    : null;
  const selected = selectedId ? sessions.find((s) => s.session_id === selectedId) ?? null : null;

  useEffect(() => {
    if (search.focus && !sessions.some((s) => s.session_id === search.focus)) {
      navigate({ to: '/tasks', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, sessions]);

  const isMobile = breakpoint === 'mobile';

  const handleSelect = (sessionId: string) => {
    // On a phone there is no inspector to select into: detail is a full-screen
    // push, so the row opens the session rather than highlighting it in place.
    if (isMobile) {
      navigate({ to: '/tasks/$taskId', params: { taskId: sessionId }, search: {} });
      return;
    }
    navigate({ to: '/tasks', search: { focus: sessionId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        className="flex-none pb-3"
        title="Tasks"
        description={
          <>
            Everything you have asked Cambrian to do. {sessions.length}{' '}
            {sessions.length === 1 ? 'task' : 'tasks'}
            {runningCount > 0 && ` · ${runningCount} with a plan running`}
            {waitingCount > 0 && ` · ${waitingCount} waiting on you`}
          </>
        }
        actions={
          // A task is started by asking for something, which happens in Chat.
          <Button size="sm" onClick={() => navigate({ to: '/chat' })}>
            New task
          </Button>
        }
      />

      {/* The filter bar also states the ordering rule: rows that jump the
          queue without saying why read as a bug. */}
      <TaskFilters
        filters={filters}
        onChange={setFilters}
        availableAgents={availableAgents}
        sessions={sessions}
      />

      {/* One list, full width. The console used to render its own 360px aside
          INSIDE the shell's 360px inspector, leaving the list 480px of a 1440px
          window with both panels saying "select something". */}
      <ScrollArea className="flex-1">
        {ranked.length === 0 ? (
          <EmptyState
            title={sessions.length === 0 ? 'No tasks yet' : 'No tasks match the filters'}
            body={
              sessions.length === 0
                ? 'Create a task from the chat surface to get started.'
                : 'Adjust or reset the filters to see more tasks.'
            }
            action={
              sessions.length > 0 && isFiltered
                ? { label: 'Clear filters', onClick: () => setFilters(INITIAL_FILTERS) }
                : undefined
            }
          />
        ) : (
          <ul role="list" aria-label="Tasks">
            {ranked.map((r) => (
              <li key={r.session.session_id}>
                <TaskListRow
                  ranked={r}
                  compact={isMobile}
                  selected={r.session.session_id === selectedId}
                  onClick={() => handleSelect(r.session.session_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {selected && (
        <Inspector label="Task detail">
          <TaskDetail session={selected} role={role} />
        </Inspector>
      )}
    </div>
  );
}
