
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { formatTokenCount } from '@/lib/format';
import type { PlanInFlight } from '@/ipc/types';
import { PlanFilters, type PlanFiltersState } from './PlanFilters';
import { PlanListRow } from './PlanListRow';

const INITIAL_FILTERS: PlanFiltersState = {
  statuses: [],
  session: null,
  search: '',
};

function filterPlans(
  plans: PlanInFlight[],
  filters: PlanFiltersState,
): PlanInFlight[] {
  const q = filters.search.trim().toLowerCase();
  return plans.filter((p) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(p.status)) return false;
    if (filters.session && p.session_id !== filters.session) return false;
    if (q) {
      const hay = `${p.subject} ${p.plan_id} ${p.active_agent ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function PlansInFlight() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [filters, setFilters] = useState<PlanFiltersState>(INITIAL_FILTERS);
  const [listFocused, setListFocused] = useState(false);

  const plans = projection.state?.plans ?? [];
  const sessions = projection.state?.sessions ?? [];
  const pendingHitl = projection.state?.pending_hitl ?? [];

  // Which plans are blocked on a human, so a card can say so rather than
  // showing a stalled rail with no explanation.
  const blockingByPlan = useMemo(() => {
    const map = new Map<string, typeof pendingHitl>();
    for (const h of pendingHitl) {
      const list = map.get(h.plan_id);
      if (list) list.push(h);
      else map.set(h.plan_id, [h]);
    }
    return map;
  }, [pendingHitl]);

  const sessionOptions = useMemo(
    () => sessions.map((s) => ({ id: s.session_id, title: s.title })),
    [sessions],
  );

  const sessionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => map.set(s.session_id, s.title));
    return map;
  }, [sessions]);

  const filtered = useMemo(
    () =>
      filterPlans(plans, filters).sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      ),
    [plans, filters],
  );

  const isFiltered =
    filters.statuses.length > 0 || filters.session !== null || filters.search.trim() !== '';

  const selectedId =
    search.focus && filtered.some((p) => p.plan_id === search.focus) ? search.focus : null;

  useEffect(() => {
    if (search.focus && !filtered.some((p) => p.plan_id === search.focus)) {
      navigate({ to: '/plans', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, filtered]);

  const handleSelect = (planId: string) => {
    navigate({ to: '/plans', search: { focus: planId }, replace: true });
  };

  // 1..9 hotkeys — only when the list has focus
  useHotkeys(
    '1,2,3,4,5,6,7,8,9',
    (e) => {
      const idx = Number(e.key) - 1;
      const target = filtered[idx];
      if (target) {
        e.preventDefault();
        handleSelect(target.plan_id);
      }
    },
    { enabled: listFocused, enableOnFormTags: false },
  );

  const runningCount = filtered.filter(
    (p) => p.status === 'running' || p.status === 'forming',
  ).length;
  const blockedCount = filtered.filter((p) => blockingByPlan.has(p.plan_id)).length;
  const committed = filtered.reduce((sum, p) => sum + p.cost, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Title and totals share a baseline (`2b`): the counts are a qualifier on
          the heading, and stacking them made the screen read as two headings. */}
      <div className="flex flex-none flex-wrap items-baseline gap-2.5 px-[22px] pb-[13px] pt-4 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_8%,transparent)]">
        <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
          Plans in flight
        </h1>
        <span className="font-mono text-[11px] leading-none text-[var(--fg-muted)]">
          {runningCount} running
          {blockedCount > 0 && ` · ${blockedCount} blocked`}
          {` · ${formatTokenCount(committed)} committed`}
        </span>
        <span className="ml-auto hidden text-[11.5px] text-[var(--fg-muted)] lg:inline">
          Press 1–9 to open a plan · nothing here polls
        </span>
      </div>

      <PlanFilters
        filters={filters}
        onChange={setFilters}
        availableSessions={sessionOptions}
      />

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <Card className="m-4">
            <CardContent className="pt-6">
              <EmptyState
                title={plans.length === 0 ? 'No plans in flight' : 'No plans match the filters'}
                body={
                  plans.length === 0
                    ? 'Start a session from the chat surface to begin a plan.'
                    : 'Adjust or reset the filters to see more plans.'
                }
                action={plans.length > 0 && isFiltered ? { label: 'Clear filters', onClick: () => setFilters(INITIAL_FILTERS) } : undefined}
              />
            </CardContent>
          </Card>
        ) : (
          <ul
            role="list"
            aria-label="Plans in flight"
            tabIndex={0}
            onFocus={() => setListFocused(true)}
            onBlur={() => setListFocused(false)}
            className="flex flex-col gap-2 p-[14px_18px]"
          >
            {filtered.map((p, i) => (
              <li key={p.plan_id}>
                <PlanListRow
                  plan={p}
                  selected={p.plan_id === selectedId}
                  sessionTitle={sessionTitleById.get(p.session_id) ?? p.session_id}
                  hotkeyIndex={i < 9 ? i + 1 : undefined}
                  blocking={blockingByPlan.get(p.plan_id)}
                  onClick={() => handleSelect(p.plan_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
