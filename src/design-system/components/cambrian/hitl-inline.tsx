import * as React from "react";
import { cn } from "@/design-system/lib/utils";
import type { HITLIntervention, HITLNature } from "@/ipc/types";

export interface HITLInlineProps {
  intervention: HITLIntervention;
  onApprove?: (interventionId: string, reason: string) => void;
  onReject?: (interventionId: string, reason: string) => void;
  onEdit?: (interventionId: string, edited: Record<string, unknown>, reason: string) => void;
  className?: string;
}

const NATURE_LABEL: Record<HITLNature, string> = {
  destructive_command: "Destructive command",
  approval_request: "Approval request",
  dangerous_tool: "Dangerous tool",
};

const NATURE_TONE: Record<HITLNature, string> = {
  destructive_command: "border-[var(--status-err)]",
  approval_request: "border-[var(--status-warn)]",
  dangerous_tool: "border-[var(--status-warn)]",
};

const REASON_MIN = 16;

export function HITLInline({
  intervention,
  onApprove,
  onReject,
  onEdit,
  className,
}: HITLInlineProps) {
  const [reason, setReason] = React.useState("");
  const [mode, setMode] = React.useState<"idle" | "approve" | "reject" | "edit">("idle");
  const reasonOk = reason.trim().length >= REASON_MIN;

  const reset = () => {
    setReason("");
    setMode("idle");
  };

  return (
    <div
      role="region"
      aria-label={`HITL intervention ${intervention.intervention_id}`}
      className={cn(
        "flex flex-col gap-2 rounded-sm border-l-4 bg-[var(--bg-elevated)] p-3",
        NATURE_TONE[intervention.nature],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--status-warn)]">
          HITL · {NATURE_LABEL[intervention.nature]}
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {intervention.intervention_id.slice(0, 8)}
        </span>
      </div>
      <p className="text-sm text-[var(--fg-primary)]">{intervention.reason}</p>
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[var(--fg-muted)]">
        <div>
          <div className="text-[var(--fg-secondary)]">proposed</div>
          <pre className="rounded-sm bg-[var(--bg-surface)] p-1.5 whitespace-pre-wrap break-all text-[10px] text-[var(--fg-primary)]">
            {JSON.stringify(intervention.proposed_action, null, 0)}
          </pre>
        </div>
        <div>
          <div className="text-[var(--fg-secondary)]">intended</div>
          <pre className="rounded-sm bg-[var(--bg-surface)] p-1.5 whitespace-pre-wrap break-all text-[10px] text-[var(--fg-primary)]">
            {intervention.intended_action
              ? JSON.stringify(intervention.intended_action, null, 0)
              : "—"}
          </pre>
        </div>
      </div>
      {mode !== "idle" && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`hitl-reason-${intervention.intervention_id}`}
            className="text-[10px] text-[var(--fg-muted)]"
          >
            Reason (min {REASON_MIN} chars)
          </label>
          <input
            id={`hitl-reason-${intervention.intervention_id}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you making this decision?"
            className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
          />
          <div className="text-[10px] text-[var(--fg-muted)] font-mono">
            {reason.trim().length} / {REASON_MIN}
          </div>
        </div>
      )}
      {mode === "idle" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("approve")}
            disabled={!onApprove}
            className="rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            disabled={!onReject}
            className="rounded-sm border border-[var(--border-strong)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-secondary-fg)] hover:bg-[var(--button-secondary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            disabled={!onEdit}
            className="rounded-sm border border-[var(--border-strong)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-secondary-fg)] hover:bg-[var(--button-secondary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!reasonOk}
            onClick={() => {
              if (mode === "approve") onApprove?.(intervention.intervention_id, reason.trim());
              if (mode === "reject") onReject?.(intervention.intervention_id, reason.trim());
              if (mode === "edit") onEdit?.(intervention.intervention_id, intervention.proposed_action, reason.trim());
              reset();
            }}
            className="rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm {mode}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-[var(--border-strong)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-secondary-fg)] hover:bg-[var(--button-secondary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
