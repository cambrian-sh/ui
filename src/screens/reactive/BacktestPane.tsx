import { useState } from 'react';
import { Button } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import type { WatchBacktestVerdict, WatchConfigFull } from '@/ipc/types';
import { debounceFinding, summariseBacktest } from './pipelineModel';

/**
 * Backtest — the authoring loop, not a diagnostic.
 *
 * `WatchBacktester` already replays the journal, so this is promoted to the
 * primary action *before arming*. What makes it worth a screen is that the
 * result **argues for a change**: totals are data, and a finding in prose is a
 * recommendation an operator can act on.
 *
 * A backtest never executes an arm. That is stated in the footer rather than
 * assumed, because "replay my live automation against real history" is a
 * sentence that should make someone nervous until it is answered.
 */
export function BacktestPane({
  config,
  onSuggest,
}: {
  config: WatchConfigFull;
  onSuggest: (seconds: number) => void;
}) {
  const [verdicts, setVerdicts] = useState<WatchBacktestVerdict[] | null>(null);

  const run = useMutation(async (cfg: WatchConfigFull) => {
    const v = await ipc.backtestWatch(cfg, 0);
    setVerdicts(v);
    return v;
  });

  const summary = verdicts ? summariseBacktest(verdicts) : null;
  const finding = summary ? debounceFinding(summary, config) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void run.mutate(config)}
          disabled={run.isLoading}
        >
          {run.isLoading ? 'Replaying the journal…' : 'Run backtest'}
        </Button>
        {summary && (
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            {summary.total} journalled signals replayed
          </span>
        )}
      </div>

      {run.error && (
        <ErrorState
          reason={run.error}
          whatToDo="Nothing was armed and nothing ran. The pipeline is unchanged."
        />
      )}

      {summary && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Total label="Would have fired" value={summary.wouldFire} tone="var(--accent-bg)" />
            <Total label="Held by the gate" value={summary.held} />
            <Total
              label="Gate errored"
              value={summary.errored}
              tone={summary.errored ? 'var(--status-err)' : undefined}
            />
          </div>

          {/* The finding is the whole value. */}
          {finding && (
            <div
              className="flex flex-col gap-2 rounded-md p-2.5 tint-wash tint-ring"
              style={{ '--tint': 'var(--accent-bg)' } as React.CSSProperties}
            >
              <p className="text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
                {finding.text}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onSuggest(finding.suggestSeconds);
                    void run.mutate({ ...config, debounce_seconds: finding.suggestSeconds });
                  }}
                >
                  Try {finding.suggestSeconds}s
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void run.mutate(config)}>
                  Keep {config.debounce_seconds}s
                </Button>
              </div>
            </div>
          )}

          {/* Errors grouped by shape, not listed. */}
          {summary.errorGroups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                Errors, grouped
              </div>
              {summary.errorGroups.map((g) => (
                <div key={g.shape} className="text-[11.5px] leading-[1.55]">
                  <span className="text-[var(--status-err)]">
                    {g.count}× {g.shape}
                  </span>
                  <span className="ml-2 text-[var(--fg-muted)]">
                    — all the same shape, so one pre-filter removes them at no cost.
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
            A backtest replays the signal journal through this exact config and{' '}
            <strong>never executes an arm</strong>. Nothing was started, dispatched or
            ingested by running it.
          </p>
        </>
      )}
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-canvas)] p-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div
        className="font-mono text-[20px] leading-[1.2]"
        style={{ color: tone ?? 'var(--fg-primary)' }}
      >
        {value}
      </div>
    </div>
  );
}
