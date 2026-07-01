import { cn } from "@/design-system/lib/utils";
import type { PlanInFlight, PlanStatus } from "@/ipc/types";

export type PlanStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface PlanStep {
  step_id: string;
  index: number;
  query: string;
  status: PlanStepStatus;
  bids_count: number;
  output_peek?: string;
  trust_score?: number;
}

export interface PlanCardProps {
  plan: PlanInFlight;
  steps: PlanStep[];
  onOpen?: (planId: string) => void;
  className?: string;
}

const STATUS_PILL: Record<PlanStatus, string> = {
  forming: "bg-[var(--status-info)] text-[var(--fg-on-accent)]",
  running: "bg-[var(--status-pulse)] text-[var(--fg-on-accent)]",
  paused: "bg-[var(--status-warn)] text-[var(--fg-on-accent)]",
  completed: "bg-[var(--status-ok)] text-[var(--fg-on-accent)]",
  failed: "bg-[var(--status-err)] text-[var(--fg-on-accent)]",
};

const STEP_STATUS_CLASS: Record<PlanStepStatus, string> = {
  pending: "text-[var(--fg-muted)]",
  running: "text-[var(--fg-primary)] font-medium",
  done: "text-[var(--fg-muted)]",
  failed: "text-[var(--status-err)]",
  skipped: "text-[var(--fg-muted)] line-through",
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function PlanCard({ plan, steps, onOpen, className }: PlanCardProps) {
  return (
    <div
      role="region"
      aria-label={`Plan ${plan.plan_id} · ${plan.subject}`}
      className={cn(
        "flex flex-col gap-2 rounded-sm border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <button
            type="button"
            onClick={() => onOpen?.(plan.plan_id)}
            className="text-sm font-medium text-[var(--fg-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 rounded-sm text-left"
          >
            {plan.subject}
          </button>
          <div className="flex items-center gap-2 text-[10px] text-[var(--fg-muted)] font-mono">
            <span>{plan.plan_id.slice(0, 8)}</span>
            <span aria-hidden="true">·</span>
            <span>{plan.step_count} step{plan.step_count === 1 ? "" : "s"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatElapsed(plan.elapsed_ms)}</span>
            <span aria-hidden="true">·</span>
            <span>${plan.cost.toFixed(3)}</span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
            STATUS_PILL[plan.status],
          )}
          aria-label={`plan status ${plan.status}`}
        >
          {plan.status}
        </span>
      </div>
      <ol
        aria-label="Plan steps"
        className="flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2"
      >
        {steps.map((step) => (
          <li
            key={step.step_id}
            className={cn("flex items-start gap-2 text-xs", STEP_STATUS_CLASS[step.status])}
          >
            <span className="font-mono text-[10px] w-6 shrink-0 text-[var(--fg-muted)]">
              {String(step.index).padStart(2, "0")}
            </span>
            <span className="flex-1 truncate">{step.query}</span>
            {step.bids_count > 0 && (
              <span className="font-mono text-[10px] text-[var(--fg-muted)] shrink-0">
                {step.bids_count} bid{step.bids_count === 1 ? "" : "s"}
              </span>
            )}
            {step.trust_score !== undefined && (
              <span
                className="rounded-sm border border-[var(--border-subtle)] px-1 text-[10px] font-mono text-[var(--fg-muted)] shrink-0"
                aria-label={`TrustScore ${step.trust_score.toFixed(2)}`}
              >
                ts {step.trust_score.toFixed(2)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
