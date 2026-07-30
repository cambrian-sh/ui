import * as React from "react";
import { Progress } from "@/design-system/components/ui/progress";
import { cn } from "@/design-system/lib/utils";

/** Every mutating command in this console carries a reason of at least this length. */
export const REASON_MIN = 16;

export interface ReasonGate {
  reason: string;
  setReason: (value: string) => void;
  /** True once the reason is long enough to submit. */
  satisfied: boolean;
  /** How far along, 0–100 — what the bar renders. */
  progress: number;
  /** How many more characters are needed. 0 once satisfied. */
  remaining: number;
  reset: () => void;
}

export function useReasonGate(min: number = REASON_MIN): ReasonGate {
  const [reason, setReason] = React.useState("");
  const length = reason.trim().length;

  return {
    reason,
    setReason,
    satisfied: length >= min,
    progress: Math.min(100, (length / min) * 100),
    remaining: Math.max(0, min - length),
    reset: React.useCallback(() => setReason(""), []),
  };
}

export interface ReasonFieldProps {
  gate: ReasonGate;
  id: string;
  label?: string;
  placeholder?: string;
  /** Where this reason ends up. Say it — it is why the field is mandatory. */
  note?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The mandatory-reason field.
 *
 * The gate itself is unchanged — 16 characters, as every mutation has always
 * required. What changed is the feedback. A bare `4 / 16` counter states a rule
 * without saying what it wants; a filling bar shows how close you are, and the
 * sentence beneath says what is left in words. The bar sits in warn while the
 * gate is unmet and turns accent when it is satisfied, so the state is carried
 * by position and colour and text together.
 */
export function ReasonField({
  gate,
  id,
  label = "Reason",
  placeholder = "Why are you making this decision?",
  note = "A reason is required — it lands in the audit log next to your name.",
  disabled,
  className,
}: ReasonFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[11.5px] text-[var(--fg-secondary)]">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={gate.reason}
        disabled={disabled}
        onChange={(e) => gate.setReason(e.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
      <Progress
        value={gate.progress}
        tone={gate.satisfied ? "var(--accent-bg)" : "var(--status-warn)"}
        aria-hidden="true"
      />
      <p id={`${id}-hint`} className="text-[11.5px] text-[var(--fg-muted)]">
        {gate.satisfied
          ? note
          : `${gate.remaining} more character${gate.remaining === 1 ? "" : "s"} and you can submit.`}
      </p>
    </div>
  );
}
