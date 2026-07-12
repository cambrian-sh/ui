import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { TriggerConsolidation } from './triggerConsolidation';

import { formatRelativeTime } from '@/lib/format';

function formatDuration(ms: number): string {
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
      case 'idle': return 'var(--status-ok)';
      case 'consolidating': return 'var(--status-warn)';
      case 'dormant': return 'var(--fg-muted)';
      default: return 'var(--fg-muted)';
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Lifecycle</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Scheduler state, pending jobs, and dormancy events.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Scheduler State</CardTitle>
            <CardDescription>Current status of the lifecycle scheduler</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div 
                className="h-3 w-3 rounded-full" 
                style={{ backgroundColor: getSchedulerStateColor(lifecycle.scheduler_state) }}
                aria-hidden="true"
              />
              <span className="text-2xl font-semibold capitalize" data-testid="scheduler-state">
                {lifecycle.scheduler_state}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
            <CardDescription>Jobs waiting to be processed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums" data-testid="pending-jobs">
              {lifecycle.pending_jobs}
            </div>
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
            <p className="text-sm text-[var(--fg-muted)]">
              Force a full consolidation pass across all agents. This is an expensive operation.
            </p>
            <TriggerConsolidation isOperator={isOperator} />
            {!isOperator && (
              <p className="text-xs text-[var(--status-warn)] text-center">
                Operator role required
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
