import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ScrollArea,
  Button,
} from '@/design-system/components';
import { formatRelativeTime, formatTokenRate, formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import type { CircuitBreaker } from '@/ipc/types';

// This screen reports TOKENS, not money. A completion response carries token
// counts and never a price, so every figure that used to be rendered as USD was
// a number this console invented from a rate nobody reconciled. The one place a
// currency legitimately appears is the price ledger below, because that is a
// *configured catalogue* the kernel publishes — and nothing multiplies it.

function toneFor(state: string): string {
  if (state === 'err') return 'var(--status-err)';
  if (state === 'warn') return 'var(--status-warn)';
  if (state === 'ok') return 'var(--status-live)';
  return 'var(--status-idle)';
}

function CircuitBreakerPill({ state }: { state: string }) {
  const known = state === 'ok' || state === 'warn' || state === 'err';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: toneFor(state) }}
        aria-hidden="true"
      />
      {/* The word is always present. Amber and red are the pair roughly 1 in 12
          men cannot separate, and this is the screen where that matters most. */}
      <span className="text-xs font-medium capitalize">{known ? state : 'unknown'}</span>
    </div>
  );
}

/**
 * What a degraded breaker actually means for the operator.
 *
 * "warn" is a state name, not information. A tripping breaker does not stop the
 * system — routing falls back — so the sentence has to say that, or the operator
 * reads an amber dot as an outage.
 */
function degradedSentence(degraded: CircuitBreaker[]): string {
  if (degraded.length === 0) return '';
  const worst = degraded.find((b) => b.state === 'err') ?? degraded[0];
  const named = worst.model_id || 'a model';
  return worst.state === 'err'
    ? `${named} is refusing requests. Routing is falling back to other models, so plans are slower — not broken.`
    : `${named} is degraded${worst.reason ? ` (${worst.reason})` : ''}. Routing still prefers it, so expect slower steps before it trips.`;
}

export function CostConsole() {
  const projection = useStore(projectionStore);
  const dashboard = projection.state?.cost_dashboard;

  if (projection.isHydrating || !dashboard) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title="Loading cost state..." body="Waiting for projection sync." />
      </div>
    );
  }

  const spendRate = dashboard.spend_rate_usd ?? 0;
  const maxEnergy = dashboard.max_energy_per_step ?? 0;
  const circuitBreakers = dashboard.circuit_breakers ?? [];
  const priceLedger = dashboard.price_ledger ?? [];
  const recentAcquires = dashboard.recent_acquires ?? [];

  const degraded = circuitBreakers.filter((cb) => cb.state !== 'ok');
  const overallState = circuitBreakers.some((cb) => cb.state === 'err')
    ? 'err'
    : circuitBreakers.some((cb) => cb.state === 'warn')
      ? 'warn'
      : 'ok';
  const isDegraded = overallState !== 'ok';

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="flex shrink-0 flex-col gap-1">
        <h1 className="type-page-title">
          Cost &amp; Energy
        </h1>
        <p className="type-page-description">
          The spend ledger, the per-Step MaxEnergy cap, and the LLMProvider health feed.
        </p>
      </header>

      <h2 className="cambrian-sr-only">Cost overview</h2>

      {/* Circuit breaker first and widest: it is the first read on a spike, and
          it is the only one of the three that can mean something is wrong. */}
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <Card
          className={cn(isDegraded && 'tint-wash tint-ring')}
          style={
            isDegraded
              ? ({ '--tint': toneFor(overallState) } as React.CSSProperties)
              : undefined
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Circuit breaker</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <div
              className="text-[23px] font-medium leading-[1.2] tracking-[-0.02em]"
              style={{ color: isDegraded ? toneFor(overallState) : undefined }}
            >
              {isDegraded
                ? `${degraded.length} of ${circuitBreakers.length} tripping`
                : circuitBreakers.length === 0
                  ? 'None registered'
                  : 'All healthy'}
            </div>
            <p className="text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">
              {isDegraded
                ? degradedSentence(degraded)
                : circuitBreakers.length === 0
                  ? 'No provider has reported health yet. That is not the same as healthy.'
                  : 'Every provider is accepting requests.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Token rate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <div className="font-mono text-[27px] font-medium leading-[1.2] tracking-[-0.02em] tabular-nums">
              {formatTokenRate(spendRate)}
            </div>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              Tokens consumed per hour, last 1h. Not a price — see the ledger note below.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">MaxEnergy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <div className="font-mono text-[27px] font-medium leading-[1.2] tracking-[-0.02em] tabular-nums">
              {formatTokens(maxEnergy)}
            </div>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              The default token cap on a single Step. A step that would exceed it is stopped,
              not charged.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b border-[var(--border-subtle)] pb-3">
            <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {circuitBreakers.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No circuit breakers"
                  body="No provider has reported health. Read this as unknown, not as healthy."
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {circuitBreakers.map((cb) => (
                  <li
                    key={cb.model_id}
                    className={cn('flex flex-col gap-1 p-3', cb.state !== 'ok' && 'tint-wash')}
                    style={
                      cb.state !== 'ok'
                        ? ({ '--tint': toneFor(cb.state) } as React.CSSProperties)
                        : undefined
                    }
                  >
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
          <CardHeader className="shrink-0 border-b border-[var(--border-subtle)] pb-3">
            <CardTitle className="text-sm font-medium">Price Ledger</CardTitle>
            {/* The one honest currency on this screen: a catalogue the kernel is
                configured with. It is NOT multiplied by the token counts above —
                cached input, cache writes, reasoning and batch all bill on
                different multipliers, so a single rate would be wrong even with
                correct numbers. Reconciling against the provider's own usage API
                is the path to real spend, and it does not exist yet. */}
            <CardDescription>
              Configured rates. Nothing here is multiplied by the token counts above.
            </CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1">
            {priceLedger.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No price ledger entries" body="No pricing data available." />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {priceLedger.map((entry) => (
                  <li key={entry.model_id} className="flex items-center justify-between p-3">
                    <span className="text-sm font-medium">{entry.model_id}</span>
                    <span className="font-mono text-sm tabular-nums text-[var(--fg-secondary)]">
                      {entry.cost_per_token} {entry.currency}/tok
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b border-[var(--border-subtle)] pb-3">
            <CardTitle className="text-sm font-medium">Acquire Outcomes</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {recentAcquires.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No acquire outcomes" body="No recent model acquisitions." />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {recentAcquires.map((outcome) => (
                  <li key={outcome.model_id} className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{outcome.model_id}</span>
                        <span
                          className="text-xs"
                          style={{
                            color: outcome.acquired
                              ? 'var(--status-live)'
                              : 'var(--status-err)',
                          }}
                          aria-label={outcome.acquired ? 'acquired' : 'refused'}
                        >
                          {outcome.acquired ? '✓' : '✗'}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--fg-muted)]">
                        {formatRelativeTime(outcome.timestamp)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-[var(--fg-secondary)]">
                      {outcome.latency_ms}ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>
      </div>

      <div className="flex shrink-0 items-center gap-4 pt-2">
        <Button variant="ghost" asChild>
          <a href="https://langfuse.com" target="_blank" rel="noopener noreferrer">
            View in Langfuse ↗
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a href="https://opentelemetry.io" target="_blank" rel="noopener noreferrer">
            View in OTel ↗
          </a>
        </Button>
      </div>
    </div>
  );
}
