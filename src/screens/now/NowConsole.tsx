import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ScrollArea } from '@/design-system/components';
import { StepRail } from '@/screens/plans/StepRail';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { consequenceOf, formatIdle, idleSeconds } from '@/lib/hitl';
import { formatTokenRate, formatTokens, sessionSubject } from '@/lib/format';
import { stepsOf, withApprovals } from '@/lib/planSteps';
import { cn } from '@/design-system/lib/utils';

/**
 * Now — one screen that answers "is everything fine, and does anything need me".
 *
 * `/` used to redirect straight to Sessions, which answers a narrower question
 * than the one an operator actually opens the console with. This leads with a
 * headline sentence about the whole deployment, then the two lists that could
 * change the answer: what is waiting on you, and what is in flight.
 *
 * Everything here is folded from the projection. Nothing polls, and there is no
 * refresh — the live dot and the cursor in the header are the honest signal
 * that what you are looking at is current.
 */
export function NowConsole() {
  const projection = useStore(projectionStore);
  const state = projection.state;

  const connection = state?.connection.status ?? 'down';
  const pending = state?.pending_hitl ?? [];
  const plans = state?.plans ?? [];
  const breakers = state?.cost_dashboard.circuit_breakers ?? [];
  const spendRate = state?.cost_dashboard.spend_rate_usd ?? 0;

  const degraded = breakers.filter((b) => b.state !== 'ok');
  const running = useMemo(
    () => plans.filter((p) => p.status === 'running' || p.status === 'forming'),
    [plans],
  );
  const blockingByPlan = useMemo(() => {
    const map = new Map<string, typeof pending>();
    for (const h of pending) {
      const list = map.get(h.plan_id);
      if (list) list.push(h);
      else map.set(h.plan_id, [h]);
    }
    return map;
  }, [pending]);

  const headline = headlineFor({
    connection,
    pendingCount: pending.length,
    degradedCount: degraded.length,
    runningCount: running.length,
  });

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 px-[22px] pb-10 pt-5">
        <section>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'size-2 rounded-full',
                connection === 'live' && 'cambrian-live-pulse',
              )}
              style={{ background: headline.tone }}
            />
            <h1 className="text-[22px] font-medium leading-[1.2] tracking-[-0.02em] sm:text-[26px]">
              {headline.title}
            </h1>
          </div>
          <p className="mt-1.5 max-w-[640px] text-[13px] leading-[1.6] text-[var(--fg-secondary)]">
            {headline.body}
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Tile
            label="Feed"
            value={connection === 'live' ? `seq ${(state?.cursor ?? 0).toLocaleString()}` : connection}
            hint={
              connection === 'live'
                ? 'folding events as they arrive'
                : 'the numbers below are the last state received'
            }
          />
          <Tile
            label="Spend rate"
            value={formatTokenRate(spendRate)}
            hint={
              degraded.length > 0
                ? `${degraded.length} circuit breaker${degraded.length === 1 ? '' : 's'} tripping`
                : 'all circuit breakers ok'
            }
          />
        </section>

        <section>
          <SectionTitle
            title="Needs you"
            count={pending.length}
            to="/inbox"
            linkLabel="Open the inbox"
          />
          {pending.length === 0 ? (
            <Quiet>Nothing is blocked on a decision.</Quiet>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.slice(0, 3).map((h) => (
                <li key={h.intervention_id}>
                  <Link
                    to="/inbox"
                    className="flex flex-col gap-1 rounded-[var(--radius-lg)] p-3 tint-wash tint-ring"
                    style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
                  >
                    <span className="text-[13.5px] leading-[1.5] text-[var(--fg-primary)]">
                      {consequenceOf(h).sentence}
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--status-warn)]">
                      idle {formatIdle(idleSeconds(h))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle
            title="In flight"
            count={running.length}
            to="/plans"
            linkLabel="All plans"
          />
          {running.length === 0 ? (
            <Quiet>No plan is running.</Quiet>
          ) : (
            <ul className="flex flex-col gap-2">
              {running.slice(0, 4).map((plan) => {
                const steps = withApprovals(stepsOf(plan), blockingByPlan.get(plan.plan_id) ?? []);
                return (
                  <li
                    key={plan.plan_id}
                    className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {sessionSubject(plan.subject)}
                      </span>
                      <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                        {formatTokens(plan.cost)} tok
                      </span>
                    </div>
                    <StepRail steps={steps} fallbackCount={plan.step_count} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function headlineFor({
  connection,
  pendingCount,
  degradedCount,
  runningCount,
}: {
  connection: string;
  pendingCount: number;
  degradedCount: number;
  runningCount: number;
}): { title: string; body: string; tone: string } {
  // Ordered by what would change what the operator does next. A disconnected
  // console is first because every other number on the screen is then stale.
  if (connection !== 'live') {
    return {
      title: connection === 'reconnecting' ? 'Reconnecting' : 'Kernel unreachable',
      body:
        connection === 'reconnecting'
          ? 'The feed dropped and is being re-established. What you see is the last state received, not the current one.'
          : 'Nothing here is current. The console is showing the last state it received before the connection failed.',
      tone: connection === 'reconnecting' ? 'var(--status-warn)' : 'var(--status-err)',
    };
  }
  if (pendingCount > 0) {
    return {
      title: `${pendingCount} decision${pendingCount === 1 ? '' : 's'} waiting on you`,
      body: 'A plan has stopped and is holding until you approve or reject. Everything else is running normally.',
      tone: 'var(--status-warn)',
    };
  }
  if (degradedCount > 0) {
    return {
      title: 'Running, but degraded',
      body: `${degradedCount} circuit breaker${degradedCount === 1 ? ' is' : 's are'} tripping. Routing is falling back, so plans are slower — not broken.`,
      tone: 'var(--status-warn)',
    };
  }
  return {
    title: 'Everything is live',
    body:
      runningCount > 0
        ? `${runningCount} plan${runningCount === 1 ? '' : 's'} in flight, nothing blocked, no breaker tripping.`
        : 'Nothing is running and nothing is blocked.',
    tone: 'var(--status-live)',
  };
}

function SectionTitle({
  title,
  count,
  to,
  linkLabel,
}: {
  title: string;
  count: number;
  to: '/inbox' | '/plans';
  linkLabel: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-medium">
        {title}
        {count > 0 && (
          <span className="ml-2 font-mono text-[11px] text-[var(--fg-muted)]">{count}</span>
        )}
      </h2>
      <Link
        to={to}
        search={to === '/plans' ? { focus: undefined } : undefined}
        className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] leading-[1.2] text-[var(--fg-primary)]">
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-[var(--fg-muted)]">{hint}</div>
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-[var(--fg-muted)]">{children}</p>;
}
