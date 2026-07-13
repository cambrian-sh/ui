import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, ScrollArea } from '@/design-system/components';
import { formatRelativeTime } from '@/lib/format';

export function VerifierPoolConsole() {
  const projection = useStore(projectionStore);
  const verifierPool = projection.state?.verifier_pool;
  
  const poolAgents = verifierPool?.pool_agents ?? [];
  const recentRounds = verifierPool?.recent_rounds ?? [];
  const surveillanceTriggers = verifierPool?.surveillance_triggers ?? [];

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto bg-[var(--bg-surface)]">
      <header className="flex flex-col gap-1 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--fg-primary)]">Verifier Pool</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          High-Merit agents who independently score task completions. The sampling decision is FNV-1a hashed (~10% baseline) + 100% under surveillance. 5% cross-verification rate.
        </p>
      </header>

      <h2 className="cambrian-sr-only">Verifier pool overview</h2>
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--fg-secondary)]">Pool Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--fg-primary)]">{poolAgents.length}</div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">Active verifiers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--fg-secondary)]">Recent Rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--fg-primary)]">{recentRounds.length}</div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">In current window</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--fg-secondary)]">Surveillance Triggers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--fg-primary)]">{surveillanceTriggers.length}</div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">Active triggers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 flex-1">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>Pool Composition</CardTitle>
            <CardDescription>Agents currently eligible for verification duties</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              {poolAgents.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">
                  No agents in pool
                </div>
              ) : (
                <ul role="list" className="divide-y divide-[var(--border-subtle)]">
                  {poolAgents.map((agent) => (
                    <li key={agent.agent_id} className="flex items-center justify-between p-4 hover:bg-[var(--bg-elevated)]">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-[var(--fg-primary)]">{agent.agent_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--fg-muted)]">Merit</span>
                        <span className="text-sm font-mono text-[var(--fg-primary)]">{(agent.merit_score * 100).toFixed(1)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden lg:col-span-2">
          <CardHeader className="shrink-0">
            <CardTitle>Recent Rounds</CardTitle>
            <CardDescription>Latest verification outcomes and cross-verification status</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              {recentRounds.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">
                  No recent rounds
                </div>
              ) : (
                <ul role="list" className="divide-y divide-[var(--border-subtle)]">
                  {recentRounds.map((round, i) => (
                    <li key={`${round.task_id}-${i}`} className="flex items-center justify-between p-4 hover:bg-[var(--bg-elevated)]">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-[var(--fg-primary)]">{round.task_id}</span>
                        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                          <span>Verifier: <span className="font-mono text-[var(--fg-secondary)]">{round.verifier_id}</span></span>
                          <span>&rarr;</span>
                          <span>Target: <span className="font-mono text-[var(--fg-secondary)]">{round.target_agent}</span></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-[var(--fg-muted)]">Quality</span>
                          <span className="text-sm font-mono text-[var(--fg-primary)]">{(round.quality_score * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-[var(--fg-muted)]">Cross-verify</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            round.cross_verification_status === 'passed' ? 'bg-[var(--status-ok)]/10 text-[var(--status-ok)]' :
                            round.cross_verification_status === 'failed' ? 'bg-[var(--status-err)]/10 text-[var(--status-err)]' :
                            'bg-[var(--status-warn)]/10 text-[var(--status-warn)]'
                          }`}>
                            {round.cross_verification_status}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden lg:col-span-3">
          <CardHeader className="shrink-0">
            <CardTitle>Surveillance Triggers</CardTitle>
            <CardDescription>Agents currently under 100% verification surveillance</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[300px]">
              {surveillanceTriggers.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[var(--fg-muted)]">
                  No surveillance triggers
                </div>
              ) : (
                <ul role="list" className="divide-y divide-[var(--border-subtle)]">
                  {surveillanceTriggers.map((trigger, i) => (
                    <li key={`${trigger.agent_id}-${i}`} className="flex items-center justify-between p-4 hover:bg-[var(--bg-elevated)]">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium font-mono text-[var(--fg-primary)]">{trigger.agent_id}</span>
                        <span className="text-sm text-[var(--fg-secondary)]">{trigger.reason}</span>
                      </div>
                      <span className="text-xs text-[var(--fg-muted)]">{formatRelativeTime(trigger.fired_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
