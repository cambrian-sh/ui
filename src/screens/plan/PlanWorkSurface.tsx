
import { useState, useMemo, lazy, Suspense } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import type { PlanInFlight, PlanStatus } from '@/ipc/types';
import { useFocusedPlan } from '@/lib/useFocusedPlan';
import { PlanStepList, type PlanStep } from './PlanStepList';
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';

const PlanGraph = lazy(() => import('./PlanGraph').then((m) => ({ default: m.PlanGraph })));

type Mode = 'dag' | 'list';

function placeholderSteps(plan: PlanInFlight): PlanStep[] {
  const total = plan.step_count;
  return Array.from({ length: total }, (_, i) => {
    const isActive = plan.active_agent !== null && i === Math.max(0, total - 1);
    return {
      step_id: `${plan.plan_id}-step-${i}`,
      index: i,
      query: `Step ${i + 1} of ${total} — subject: ${plan.subject}`,
      status: isActive ? 'running' : i < total - 1 ? 'done' : 'pending',
      bids_count: 0,
    };
  });
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  forming: 'forming',
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
};

export function PlanWorkSurface() {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const plans = state?.plans ?? [];
  const [mode, setMode] = useState<Mode>('list');
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [pending, setPending] = useState<'pause' | 'resume' | null>(null);

  const plan = useFocusedPlan(plans);
  const steps = useMemo(() => (plan ? placeholderSteps(plan) : []), [plan]);

  const role = state?.role;
  const isOperator = role === 'operator';

  const { mutate, isLoading, error: mutationError } = useMutation(
    async (args: { kind: 'pause' | 'resume'; reason: string }) => {
      if (args.kind === 'pause') {
        return ipc.pauseSession({ session_id: plan!.session_id, reason: args.reason });
      }
      return ipc.resumeSession({ session_id: plan!.session_id, reason: args.reason });
    },
  );

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[var(--fg-muted)]">
        No plan in flight. Open a session with an active plan to see the work surface.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex flex-col min-w-0">
          <div className="text-xs font-medium text-[var(--fg-primary)] truncate">{plan.subject}</div>
          <div className="font-mono text-[10px] text-[var(--fg-muted)]">
            {plan.plan_id.slice(0, 8)} · {plan.step_count} step{plan.step_count === 1 ? '' : 's'} · ${plan.cost.toFixed(3)}
          </div>
        </div>
        <span
          className="rounded-sm bg-[var(--status-pulse)] text-[var(--fg-on-accent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          aria-label={`plan status ${plan.status}`}
        >
          {STATUS_LABEL[plan.status]}
        </span>
      </header>

      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-3 py-1.5">
        <button
          type="button"
          onClick={() => setMode('dag')}
          aria-pressed={mode === 'dag'}
          className={
            'rounded-sm px-2 py-0.5 text-[10px] font-medium ' +
            (mode === 'dag'
              ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)]'
              : 'bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]')
          }
        >
          DAG
        </button>
        <button
          type="button"
          onClick={() => setMode('list')}
          aria-pressed={mode === 'list'}
          className={
            'rounded-sm px-2 py-0.5 text-[10px] font-medium ' +
            (mode === 'list'
              ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)]'
              : 'bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]')
          }
        >
          Step list
        </button>
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">⌘G toggle</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {mode === 'dag' ? (
          <Suspense fallback={<div className="p-4 text-xs text-[var(--fg-muted)]">Loading DAG…</div>}>
            <PlanGraph plan={plan} steps={steps} onSelectStep={setSelectedStepIndex} />
          </Suspense>
        ) : (
          <PlanStepList steps={steps} selectedIndex={selectedStepIndex} onSelectStep={setSelectedStepIndex} />
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] p-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPending('pause')}
            disabled={(!isOperator || (plan.status !== 'running' && plan.status !== 'forming') || isLoading)}
            className="flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => setPending('resume')}
            disabled={(!isOperator || plan.status !== 'paused' || isLoading)}
            className="flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Resume
          </button>
        </div>
        {mutationError && <ErrorState reason={mutationError} />}
        {!isOperator && (
          <p className="mt-2 text-xs text-[var(--fg-muted)]">
            These actions require the Operator role.
          </p>
        )}
      </div>

      {pending && (
        <ConfirmMutationDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending === 'resume' ? 'Resume plan' : 'Pause plan'}
          description={pending === 'resume' ? 'The plan will resume accepting work.' : 'The plan will stop accepting new work; running steps will pause.'}
          confirmLabel={pending === 'resume' ? 'Resume' : 'Pause'}
          onConfirm={async (reason) => {
            if (pending) await mutate({ kind: pending, reason });
          }}
        />
      )}
    </div>
  );
}
