import * as React from "react";
import { Button } from "@/design-system/components/ui/button";
import {
  ReasonField,
  useReasonGate,
} from "@/design-system/components/cambrian/reason-field";
import { cn } from "@/design-system/lib/utils";
import { consequenceOf, formatIdle, idleSeconds, NATURE_LABEL, NATURE_TONE } from "@/lib/hitl";
import type { HITLIntervention } from "@/ipc/types";

const VERB = { approve: "Approve", reject: "Reject", edit: "Edit" } as const;
const NOUN = { approve: "approval", reject: "rejection", edit: "this edit" } as const;
const CONFIRM_LABEL = {
  approve: "Confirm approval",
  reject: "Confirm rejection",
  edit: "Confirm edit",
} as const;

export interface HITLInlineProps {
  intervention: HITLIntervention;
  onApprove?: (interventionId: string, reason: string) => void;
  onReject?: (interventionId: string, reason: string) => void;
  onEdit?: (interventionId: string, edited: Record<string, unknown>, reason: string) => void;
  /** Disables the actions and says why, visibly. */
  disabledReason?: string;
  busy?: boolean;
  className?: string;
}

/**
 * The card that asks the operator for a decision.
 *
 * It leads with the *consequence* — one sentence naming what will happen — and
 * keeps the raw payload behind a disclosure. The previous card led with two
 * minified JSON blobs side by side, which made the operator diff them to work
 * out what they were approving, at 10px, under time pressure.
 *
 * The 16-character reason gate is unchanged. Only its feedback changed; see
 * `ReasonField`.
 */
export function HITLInline({
  intervention,
  onApprove,
  onReject,
  onEdit,
  disabledReason,
  busy,
  className,
}: HITLInlineProps) {
  const gate = useReasonGate();
  const [mode, setMode] = React.useState<"idle" | "approve" | "reject" | "edit">("idle");

  const consequence = consequenceOf(intervention);
  const tone = NATURE_TONE[intervention.nature];
  const toneVar = tone === "err" ? "var(--status-err)" : "var(--status-warn)";
  const idle = idleSeconds(intervention);

  const reset = () => {
    gate.reset();
    setMode("idle");
  };

  const blocked = Boolean(disabledReason);

  return (
    <div
      role="region"
      aria-label={`HITL intervention ${intervention.intervention_id}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--tint)_34%,var(--card-border))] tint-wash",
        className,
      )}
      style={{ "--tint": toneVar } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <span className="type-status" style={{ color: toneVar }}>
          Waiting on you · {NATURE_LABEL[intervention.nature]}
        </span>
        <span className="flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
          <span>Waiting {formatIdle(idle)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{intervention.intervention_id.slice(0, 8)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 pt-1.5">
        <p className="text-[15px] font-medium leading-[1.5] text-[var(--fg-primary)]">
          {consequence.sentence}
        </p>

        {/* Never hidden, only folded. The operator must always be able to reach
            the exact thing they are approving. */}
        <details className="text-[12.5px] text-[var(--fg-muted)]">
          <summary className="cursor-pointer select-none hover:text-[var(--fg-secondary)]">
            Show the proposed action
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <div className="type-label mb-1">
                Proposed
              </div>
              <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-secondary)]">
                {JSON.stringify(intervention.proposed_action, null, 2)}
              </pre>
            </div>
            <div>
              <div className="type-label mb-1">
                Intended
              </div>
              <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-secondary)]">
                {intervention.intended_action
                  ? JSON.stringify(intervention.intended_action, null, 2)
                  : "—"}
              </pre>
            </div>
          </div>
        </details>

        {mode !== "idle" && (
          <ReasonField
            gate={gate}
            id={`hitl-reason-${intervention.intervention_id}`}
            label={`Reason for ${NOUN[mode]}`}
            disabled={blocked || busy}
          />
        )}

        {mode === "idle" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setMode("approve")}
              disabled={!onApprove || blocked || busy}
            >
              Approve with reason
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMode("reject")}
              disabled={!onReject || blocked || busy}
            >
              Reject
            </Button>
            {/* Only where the caller can apply an edit: a permanently disabled
                button reads as broken. */}
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("edit")}
                disabled={blocked || busy}
              >
                Edit the action
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "reject" ? "danger" : "default"}
              disabled={!gate.satisfied || blocked || busy}
              onClick={() => {
                const reason = gate.reason.trim();
                if (mode === "approve") onApprove?.(intervention.intervention_id, reason);
                if (mode === "reject") onReject?.(intervention.intervention_id, reason);
                if (mode === "edit")
                  onEdit?.(intervention.intervention_id, intervention.proposed_action, reason);
                reset();
              }}
            >
              {busy ? "Sending…" : gate.satisfied ? CONFIRM_LABEL[mode] : `${VERB[mode]} — needs a reason`}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}

        {/* A disabled control that does not say why is indistinguishable from a
            broken one. */}
        {disabledReason && (
          <p className="text-[12.5px] text-[var(--status-warn)]">{disabledReason}</p>
        )}
      </div>
    </div>
  );
}
