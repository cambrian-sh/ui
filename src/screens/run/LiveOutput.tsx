import { useMemo, useState } from 'react';
import { cn } from '@/design-system/lib/utils';
import type { PlanInFlight } from '@/ipc/types';
import { runsForSession, stepOutputStore, type LeaseStream, type StepRuns } from '@/lib/stepOutput';
import { useStore } from '@/store/useStore';

/** The live runs of one task, grouped by step (see lib/stepOutput.ts). */
export function useStepRuns(taskSessionId: string | null | undefined): StepRuns[] {
  const output = useStore(stepOutputStore, (s) => s.output);
  return useMemo(() => runsForSession(output, taskSessionId ?? ''), [output, taskSessionId]);
}

/**
 * What each step is producing, as it produces it.
 *
 * One block per step that has streamed anything; inside it, the step's own run
 * and — nested beneath — any further runs on the same step (subagents, or a
 * retry). The nesting is INFERRED from lease order because the wire carries no
 * parent lease; the label says so.
 *
 * Live-only: the kernel never replays this lane, so after a reconnect a step
 * shows only what arrived since. That is stated rather than hidden.
 */
export function LiveOutput({
  taskSessionId,
  plan,
  className,
}: {
  taskSessionId: string | null | undefined;
  plan?: PlanInFlight | null;
  className?: string;
}) {
  const runs = useStepRuns(taskSessionId);
  const labels = useMemo(() => new Map((plan?.steps ?? []).map((s) => [s.index, s.label])), [plan?.steps]);
  if (runs.length === 0) return null;
  return (
    <section aria-label="Live step output" className={cn('flex max-w-[820px] flex-col gap-2', className)}>
      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">Live output</h3>
      {runs.map((r) => (
        <StepBlock key={r.step_index} runs={r} label={labels.get(r.step_index)} />
      ))}
      <p className="text-[11px] text-[var(--fg-muted)]">
        Live only — output streamed before this console connected is not replayed.
      </p>
    </section>
  );
}

function StepBlock({ runs, label }: { runs: StepRuns; label?: string }) {
  const title =
    runs.step_index < 0 ? 'Outside a step' : `Step ${runs.step_index + 1}${label ? ` — ${label}` : ''}`;
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="truncate px-3 py-2 text-[12.5px] font-medium">{title}</div>
      <LeaseView stream={runs.root} />
      {runs.children.length > 0 && (
        <div className="ml-4 flex flex-col border-l-2 border-[var(--border-strong)]">
          <p className="px-3 pt-2 text-[11px] text-[var(--fg-muted)]">
            {runs.children.length} more run{runs.children.length === 1 ? '' : 's'} on this step — subagents or retries
            (inferred: the kernel does not name a parent run)
          </p>
          {runs.children.map((c) => (
            <LeaseView key={c.lease_id} stream={c} nested />
          ))}
        </div>
      )}
    </div>
  );
}

const PREVIEW_CHARS = 1600;

function LeaseView({ stream, nested }: { stream: LeaseStream; nested?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = stream.text.length > PREVIEW_CHARS;
  const shown = expanded || !long ? stream.text : '…' + stream.text.slice(-PREVIEW_CHARS);
  const live = !stream.final;
  return (
    <div className={cn('flex flex-col gap-1 px-3 pb-2.5', nested && 'pt-1.5')}>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', live ? 'cambrian-live-pulse bg-[var(--status-live)]' : 'bg-[var(--status-done)]')}
        />
        <span>{stream.agent_id || 'agent'}</span>
        <span>· {live ? 'streaming' : 'done'}</span>
        {stream.source && <span>· via {stream.source}</span>}
        {stream.missing > 0 && (
          <span className="text-[var(--status-warn)]">· {stream.missing} chunk{stream.missing === 1 ? '' : 's'} missing</span>
        )}
        {!stream.ordered && <span>· unordered (older kernel)</span>}
      </div>
      {(stream.status || stream.progress) && live && (
        <p className="text-[12px] text-[var(--fg-secondary)]" role="status" aria-live="polite">
          {stream.progress || stream.status}
        </p>
      )}
      {stream.text && (
        <pre
          className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--bg-canvas)] p-2 font-mono text-[11.5px] leading-[1.55] text-[var(--fg-primary)]"
          aria-live={live ? 'off' : undefined}
        >
          {shown}
        </pre>
      )}
      {(long || stream.truncated) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-[11px] text-[var(--accent-bg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {expanded ? 'Show the tail only' : `Show all ${stream.text.length.toLocaleString()} characters`}
          {stream.truncated && ' (the oldest output was dropped to stay inside the buffer)'}
        </button>
      )}
    </div>
  );
}
