/* Plans in Flight console — the global plans list (PRD-06 §5).
 *
 * Canonical pattern: filter bar (top) + list (full width of centre main).
 * The plan work surface (PRD-04) renders in the Shell's right inspector
 * and reads the focused plan via useFocusedPlan (?focus in the URL).
 * The 1..9 hotkeys jump to the nth plan in the filtered list (only
 * when the list has focus).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { Button, Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
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

  const selectedId =
    search.focus && filtered.some((p) => p.plan_id === search.focus) ? search.focus : null;

  const handleSelect = (planId: string) => {
    navigate({ to: '/plans', search: { focus: planId } });
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

  return (
    <div className="flex h-full flex-col">
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
                action={
                  plans.length === 0 ? (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => navigate({ to: '/sessions', search: { focus: undefined } })}
                    >
                      Go to Sessions
                    </Button>
                  ) : undefined
                }
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
            className="divide-y divide-[var(--border-subtle)]"
          >
            {filtered.map((p) => (
              <li key={p.plan_id}>
                <PlanListRow
                  plan={p}
                  selected={p.plan_id === selectedId}
                  sessionTitle={sessionTitleById.get(p.session_id) ?? p.session_id}
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
