import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { TriggerConsolidation } from './triggerConsolidation';

import { formatRelativeTime } from '@/lib/format';

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function LifecycleConsole() {
  const projection = useStore(projectionStore);
  
  const lifecycle = projection.state?.lifecycle;
  const role = projection.state?.role;
  const isOperator = role === 'operator';

  if (!lifecycle) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title="Loading lifecycle state..." body="Waiting for projection sync." />
      </div>
    );
  }

  const getSchedulerStateColor = (state: string) => {
    switch (state) {
      case 'idle': return 'var(--status-live)';
      case 'consolidating': return 'var(--status-warn)';
      case 'dormant': return 'var(--status-idle)';
      default: return 'var(--status-idle)';
    }
  };

  // The bare word is a state name, not information: it does not say what is
  // affected while it holds. "Consolidating" in particular means writes queue.
  const schedulerSentence = (state: string): string => {
    switch (state) {
      case 'consolidating':
        return 'A consolidation pass is running. Memory writes queue until it finishes; reads are unaffected.';
      case 'idle':
        return 'Nothing is scheduled. Agents consolidate on their own cadence.';
      case 'dormant':
        return 'The scheduler is parked. Dormant agents wake on their next bid, not on a timer.';
      default:
        return 'The scheduler has not reported a state yet.';
    }
  };

  const isConsolidating = lifecycle.scheduler_state === 'consolidating';
  const last = lifecycle.last_consolidation;

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Lifecycle</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Scheduler state, pending jobs, and dormancy events.
        </p>
      </header>

      <h2 className="cambrian-sr-only">Scheduler overview</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Scheduler State</CardTitle>
            <CardDescription>Current status of the lifecycle scheduler</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full${isConsolidating ? ' cambrian-live-pulse' : ''}`}
                style={{ backgroundColor: getSchedulerStateColor(lifecycle.scheduler_state) }}
                aria-hidden="true"
              />
              <span
                className="text-[22px] font-medium capitalize leading-[1.2] tracking-[-0.02em]"
                data-testid="scheduler-state"
              >
                {lifecycle.scheduler_state}
              </span>
            </div>
            <p className="text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">
              {schedulerSentence(lifecycle.scheduler_state)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
            <CardDescription>Jobs waiting to be processed</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div
              className="font-mono text-[22px] font-medium leading-[1.2] tracking-[-0.02em] tabular-nums"
              data-testid="pending-jobs"
            >
              {lifecycle.pending_jobs}
            </div>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              {lifecycle.pending_jobs === 0
                ? 'Nothing queued.'
                : 'Queued behind the scheduler. They run in order, not in parallel.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Last Consolidation</CardTitle>
            <CardDescription>Most recent consolidation run</CardDescription>
          </CardHeader>
          <CardContent>
            {lifecycle.last_consolidation ? (
              <div className="flex flex-col gap-1">
                <div className="text-lg font-medium">
                  {formatRelativeTime(lifecycle.last_consolidation.timestamp)}
                </div>
                <div className="text-sm text-[var(--fg-muted)] flex items-center gap-2">
                  <span className="capitalize">{lifecycle.last_consolidation.status}</span>
                  <span>•</span>
                  <span>{formatDuration(lifecycle.last_consolidation.duration_ms)}</span>
                </div>
              </div>
            ) : (
              <div className="text-lg font-medium text-[var(--fg-muted)]">None yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Dormancy Events</CardTitle>
            <CardDescription>Recent agent dormancy and reactivation events</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {lifecycle.dormancy_events.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No dormancy events recorded." body="Agents will appear here when they enter or exit dormancy." />
              </div>
            ) : (
              <ul role="list" className="divide-y divide-[var(--border-subtle)]">
                {lifecycle.dormancy_events.map((event, i) => (
                  <li key={`${event.agent_id}-${event.timestamp}-${i}`} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{event.agent_id}</span>
                      <span 
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          color: event.event_type === 'reactivated' ? 'var(--status-ok)' : 'var(--fg-muted)',
                          border: '1px solid var(--border-subtle)'
                        }}
                      >
                        {event.event_type}
                      </span>
                    </div>
                    <span className="text-sm text-[var(--fg-muted)] tabular-nums">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Actions</CardTitle>
            <CardDescription>Manual lifecycle controls</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">
              Force a full consolidation pass across every agent.
              {/* State the price BEFORE the button, not after the click. "This is
                  expensive" is not a price; a duration from the last run is. */}
              {last
                ? ` The last one took ${formatDuration(last.duration_ms)}, during which memory writes queued.`
                : ' No pass has run yet, so there is no measured duration to quote — expect writes to queue while it runs.'}
            </p>
            <TriggerConsolidation isOperator={isOperator && !isConsolidating} />
            {isConsolidating && (
              <p className="text-center text-xs text-[var(--status-warn)]">
                A pass is already running.
              </p>
            )}
            {!isOperator && (
              <p className="text-center text-xs text-[var(--status-warn)]">
                Operator role required
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
