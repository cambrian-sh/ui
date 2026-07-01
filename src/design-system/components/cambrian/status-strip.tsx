/* Cambrian Web UI — the status strip (the shell's bottom row).
 *
 * Per PRD-02 §6: the always-visible 32 px bottom strip. Fields: current
 * instance, kernel up, LTM up, in-flight plans (count), queue depth,
 * circuit-breaker state, current spend rate, event backlog. The operator's
 * first read when something is wrong.
 *
 * Status colours are the status-pill tokens (ok / warn / err). The event
 * backlog turns warn above the operator's threshold (default 100; the
 * threshold is a UI control-plane setting in PRD-07 §3.1).
 */

import { cn } from "@/design-system/lib/utils";

export interface StatusStripProps {
  connection: "live" | "reconnecting" | "down";
  kernelUp: boolean;
  ltmUp: boolean;
  inFlightPlans: number;
  queueDepth: number;
  circuitBreaker: "ok" | "warn" | "err" | "unknown";
  spendRate: number; // $ per hour
  eventBacklog: number;
  threshold: number; // per-operator preference; default 100
}

type DotStatus = "ok" | "warn" | "err" | "muted" | "unknown";

function dotClass(status: DotStatus): string {
  switch (status) {
    case "ok":    return "bg-[var(--status-ok)]";
    case "warn":  return "bg-[var(--status-warn)]";
    case "err":   return "bg-[var(--status-err)]";
    case "muted": return "bg-[var(--status-muted)]";
    case "unknown": return "bg-[var(--status-muted)]";
  }
}

function dotForConnection(c: StatusStripProps["connection"]): DotStatus {
  return c === "live" ? "ok" : c === "reconnecting" ? "warn" : "err";
}

export function StatusStrip(props: StatusStripProps) {
  const backlogOver = props.eventBacklog > props.threshold;
  return (
    <div
      className="flex items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-[var(--fg-muted)]"
      style={{ height: "var(--status-strip-h)" }}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1">
        <span className={cn("h-2 w-2 rounded-full", dotClass(dotForConnection(props.connection)))} />
        <span className="text-xs">{props.connection}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("h-2 w-2 rounded-full", dotClass(props.kernelUp ? "ok" : "err"))} />
        <span className="text-xs">kernel</span>
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("h-2 w-2 rounded-full", dotClass(props.ltmUp ? "ok" : "err"))} />
        <span className="text-xs">ltm</span>
      </span>
      <span className="text-xs">{props.inFlightPlans} plans</span>
      <span className="text-xs">queue {props.queueDepth}</span>
      <span className="flex items-center gap-1">
        <span className={cn("h-2 w-2 rounded-full", dotClass(props.circuitBreaker))} />
        <span className="text-xs">cb</span>
      </span>
      <span className="text-xs">${props.spendRate.toFixed(2)}/hr</span>
      <span
        className={cn(
          "flex items-center gap-1",
          backlogOver && "text-[var(--status-warn)]",
        )}
      >
        <span
          className={cn("h-2 w-2 rounded-full", dotClass(backlogOver ? "warn" : "ok"))}
        />
        <span className="text-xs">backlog {props.eventBacklog}</span>
      </span>
    </div>
  );
}
