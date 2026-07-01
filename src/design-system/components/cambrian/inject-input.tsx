import { cn } from "@/design-system/lib/utils";
import type { PlanInFlight } from "@/ipc/types";

export interface InjectInputProps {
  plans: PlanInFlight[];
  selectedPlanId: string | null;
  onPlanChange: (planId: string) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

function planLabel(plan: PlanInFlight): string {
  return `${plan.subject} · ${plan.step_count} step${plan.step_count === 1 ? "" : "s"} · ${plan.status}`;
}

export function InjectInput({
  plans,
  selectedPlanId,
  onPlanChange,
  value,
  onChange,
  onSubmit,
  disabled,
  disabledReason,
  className,
}: InjectInputProps) {
  const hasMultiple = plans.length > 1;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)] shrink-0">
          Inject into running plan
        </span>
        {hasMultiple ? (
          <select
            value={selectedPlanId ?? ""}
            onChange={(e) => onPlanChange(e.target.value)}
            disabled={disabled}
            aria-label="Select plan to inject into"
            className="flex-1 rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-0.5 text-xs text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {plans.map((p) => (
              <option key={p.plan_id} value={p.plan_id}>
                {planLabel(p)}
              </option>
            ))}
          </select>
        ) : selectedPlanId ? (
          <span className="flex-1 truncate text-xs font-mono text-[var(--fg-secondary)]">
            {planLabel(plans.find((p) => p.plan_id === selectedPlanId)!)}
          </span>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        placeholder="Send a correction into the running plan. The plan may re-plan."
        rows={2}
        aria-label="Inject correction into running plan"
        className="w-full resize-y rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--fg-muted)] font-mono">
          ⌘/Ctrl-⏎ send · the plan may re-plan
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim() || !selectedPlanId}
          title={disabled ? disabledReason : undefined}
          className="rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Inject
        </button>
      </div>
    </div>
  );
}
