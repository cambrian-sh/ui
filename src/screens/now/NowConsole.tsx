import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ScrollArea, SectionHeader, Stat } from '@/design-system/components';
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
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-[var(--page-gutter)] pb-12 pt-7">
        <section>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'size-2.5 flex-none rounded-full',
                connection === 'live' && 'cambrian-live-pulse',
              )}
              style={{ background: headline.tone }}
            />
            <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[28px]">
              {headline.title}
            </h1>
          </div>
          <p className="type-page-description mt-2 max-w-[640px] text-[14px]">{headline.body}</p>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
          <Stat
            label="Waiting on you"
            value={pending.length}
            tone={pending.length > 0 ? 'warn' : undefined}
            caption={pending.length > 0 ? 'decisions holding a plan' : 'nothing is blocked'}
          />
          <Stat
            label="Plans in flight"
            value={running.length}
            caption={running.length === 1 ? 'plan running now' : 'plans running now'}
          />
          <Stat
            label="Spend rate"
            value={formatTokenRate(spendRate)}
            tone={degraded.length > 0 ? 'warn' : undefined}
            caption={
              degraded.length > 0
                ? `${degraded.length} circuit breaker${degraded.length === 1 ? '' : 's'} tripping`
                : 'all circuit breakers ok'
            }
          />
          <Stat
            label="Feed"
            value={connection === 'live' ? 'Live' : connection === 'reconnecting' ? 'Reconnecting' : 'Down'}
            tone={connection === 'live' ? undefined : connection === 'reconnecting' ? 'warn' : 'err'}
            caption={
              connection === 'live'
                ? `seq ${(state?.cursor ?? 0).toLocaleString()} · folding events as they arrive`
                : 'the numbers here are the last state received'
            }
          />
        </section>

        <section>
          <SectionHeader
            title="Needs you"
            count={pending.length}
            action={<SectionLink to="/inbox">Open the inbox</SectionLink>}
          />
          {pending.length === 0 ? (
            <Quiet>Nothing is blocked on a decision.</Quiet>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.slice(0, 3).map((h) => (
                <li key={h.intervention_id}>
                  <Link
                    to="/inbox"
                    className="group flex items-center gap-4 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--status-warn)_32%,var(--card-border))] px-4 py-3 tint-wash no-underline transition-colors hover:no-underline hover:border-[var(--status-warn)]"
                    style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] leading-[1.45] text-[var(--fg-primary)]">
                        {consequenceOf(h).sentence}
                      </div>
                      <div className="type-status mt-0.5 text-[var(--status-warn)]">
                        Waiting {formatIdle(idleSeconds(h))}
                      </div>
                    </div>
                    <span className="flex-none text-[13px] font-medium text-[var(--fg-secondary)] group-hover:text-[var(--fg-primary)]">
                      Review →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader
            title="In flight"
            count={running.length}
            action={<SectionLink to="/plans">All plans</SectionLink>}
          />
          {running.length === 0 ? (
            <Quiet>No plan is running.</Quiet>
          ) : (
            <ul className="flex flex-col gap-2">
              {running.slice(0, 4).map((plan) => {
                const steps = withApprovals(stepsOf(plan), blockingByPlan.get(plan.plan_id) ?? []);
                const done = steps.filter((s) => s.status === 'done').length;
                const total = steps.length || plan.step_count;
                return (
                  <li key={plan.plan_id}>
                    <Link
                      to="/plans"
                      search={{ focus: plan.plan_id }}
                      className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 text-[var(--fg-primary)] no-underline transition-colors hover:no-underline hover:border-[var(--border-strong)] hover:bg-[var(--list-row-bg-hover)]"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                          {sessionSubject(plan.subject)}
                        </span>
                        <span className="flex-none text-[12px] text-[var(--fg-muted)]">
                          {steps.length > 0 ? `${done} of ${total} steps` : `${total} steps`}
                          <span className="mx-1.5">·</span>
                          <span className="font-mono">{formatTokens(plan.cost)} tok</span>
                        </span>
                      </div>
                      <StepRail steps={steps} fallbackCount={plan.step_count} />
                    </Link>
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

function SectionLink({ to, children }: { to: '/inbox' | '/plans'; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      search={to === '/plans' ? { focus: undefined } : undefined}
      className="text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
    >
      {children}
    </Link>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[13px] text-[var(--fg-muted)]">
      {children}
    </p>
  );
}
