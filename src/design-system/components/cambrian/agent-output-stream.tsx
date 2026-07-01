import { cn } from "@/design-system/lib/utils";

export type AgentOutputLineType =
  | "token"
  | "tool_call"
  | "tool_result"
  | "agent_message"
  | "error";

export interface AgentOutputLine {
  line_id: string;
  type: AgentOutputLineType;
  content: string;
  timestamp: string;
}

export interface AgentOutputStreamProps {
  lines: AgentOutputLine[];
  onCopyAll?: () => void;
  className?: string;
  emptyMessage?: string;
}

const TYPE_PILL: Record<AgentOutputLineType, string> = {
  token: "bg-[var(--status-pulse)] text-[var(--fg-on-accent)]",
  tool_call: "bg-[var(--status-info)] text-[var(--fg-on-accent)]",
  tool_result: "bg-[var(--status-ok)] text-[var(--fg-on-accent)]",
  agent_message: "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
  error: "bg-[var(--status-err)] text-[var(--fg-on-accent)]",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AgentOutputStream({
  lines,
  onCopyAll,
  className,
  emptyMessage = "No output yet",
}: AgentOutputStreamProps) {
  if (lines.length === 0) {
    return (
      <div
        className={cn(
          "rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--fg-muted)] font-mono",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Agent output stream"
      className={cn(
        "flex flex-col gap-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2",
        className,
      )}
    >
      {onCopyAll && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCopyAll}
            className="text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-sm"
          >
            copy all
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
        {lines.map((line) => (
          <li key={line.line_id} className="flex items-start gap-2">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide shrink-0",
                TYPE_PILL[line.type],
              )}
              aria-label={`line type ${line.type}`}
            >
              {line.type.replace("_", " ")}
            </span>
            <span className="text-[10px] text-[var(--fg-muted)] shrink-0 mt-0.5">
              {formatTime(line.timestamp)}
            </span>
            <span
              className={cn(
                "flex-1 break-words whitespace-pre-wrap",
                line.type === "error" ? "text-[var(--status-err)]" : "text-[var(--fg-primary)]",
              )}
            >
              {line.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
