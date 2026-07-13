import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState, ScrollArea, Button } from '@/design-system/components';
import { formatRelativeTime } from '@/lib/format';

function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function CircuitBreakerPill({ state }: { state: string }) {
  let colorClass = 'bg-[var(--status-ok)]';
  if (state === 'warn') colorClass = 'bg-[var(--status-warn)]';
  if (state === 'err') colorClass = 'bg-[var(--status-err)]';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      <span className="text-xs font-medium capitalize">{state}</span>
    </div>
  );
}

export function CostConsole() {
  const projection = useStore(projectionStore);
  const dashboard = projection.state?.cost_dashboard;

  const spendRate = dashboard?.spend_rate_usd ?? 0;
  const maxEnergy = dashboard?.max_energy_per_step ?? 0;
  const circuitBreakers = dashboard?.circuit_breakers ?? [];
  const priceLedger = dashboard?.price_ledger ?? [];
  const recentAcquires = dashboard?.recent_acquires ?? [];

  let overallState = 'ok';
  if (circuitBreakers.some(cb => cb.state === 'err')) {
    overallState = 'err';
  } else if (circuitBreakers.some(cb => cb.state === 'warn')) {
    overallState = 'warn';
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Cost & Energy</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The spend ledger, the per-Step MaxEnergy cap, and the LLMProvider
          health feed. Circuit-breaker state is the first read on a spike.
        </p>
      </header>

      <h2 className="cambrian-sr-only">Cost overview</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 shrink-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend rate</CardTitle>
            <CardDescription>USD per hour, last 1h</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatUSD(spendRate)}/hr</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Circuit breaker</CardTitle>
            <CardDescription>LlmProvider upstream health</CardDescription>
          </CardHeader>
          <CardContent>
            <CircuitBreakerPill state={overallState} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">MaxEnergy (default)</CardTitle>
            <CardDescription>Per-Step cost cap</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatUSD(maxEnergy)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1 min-h-0">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {circuitBreakers.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No circuit breakers" body="All upstream providers are healthy." />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {circuitBreakers.map((cb, i) => (
                  <li key={i} className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{cb.model_id}</span>
                      <CircuitBreakerPill state={cb.state} />
                    </div>
                    {cb.reason && (
                      <span className="text-xs text-[var(--fg-muted)]">{cb.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm font-medium">Price Ledger</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {priceLedger.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No price ledger entries" body="No pricing data available." />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {priceLedger.map((entry, i) => (
                  <li key={i} className="flex items-center justify-between p-3">
                    <span className="text-sm font-medium">{entry.model_id}</span>
                    <span className="text-sm tabular-nums text-[var(--fg-secondary)]">
                      {entry.cost_per_token} {entry.currency}/tok
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm font-medium">Acquire Outcomes</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {recentAcquires.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No acquire outcomes" body="No recent model acquisitions." />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {recentAcquires.map((outcome, i) => (
                  <li key={i} className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{outcome.model_id}</span>
                        {outcome.acquired ? (
                          <span className="text-xs text-[var(--status-ok)]">✓</span>
                        ) : (
                          <span className="text-xs text-[var(--status-err)]">✗</span>
                        )}
                      </div>
                      <span className="text-xs text-[var(--fg-muted)]">
                        {formatRelativeTime(outcome.timestamp)}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--fg-secondary)]">
                      {outcome.latency_ms}ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>
      </div>

      <div className="flex items-center gap-4 shrink-0 pt-2">
        <Button variant="ghost" asChild>
          <a
            href="https://langfuse.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            View in Langfuse ↗
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a
            href="https://opentelemetry.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            View in OTel ↗
          </a>
        </Button>
      </div>
    </div>
  );
}
