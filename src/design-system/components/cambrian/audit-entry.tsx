import { cn } from "@/design-system/lib/utils";
import type { AuditEntry, AuditStatus } from "@/ipc/types";

export interface AuditEntryRowProps {
  entry: AuditEntry;
  selected?: boolean;
  onClick?: (entryId: string) => void;
  className?: string;
}

const STATUS_CLASS: Record<AuditStatus, string> = {
  applied: "bg-[var(--status-ok)] text-[var(--fg-on-accent)]",
  failed: "bg-[var(--status-err)] text-[var(--fg-on-accent)]",
  denied: "bg-[var(--status-warn)] text-[var(--fg-on-accent)]",
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

export function AuditEntryRow({
  entry,
  selected,
  onClick,
  className,
}: AuditEntryRowProps) {
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onClick?.(entry.entry_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(entry.entry_id);
        }
      }}
      className={cn(
        "grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 border-b border-[var(--list-row-border)] px-2 py-1.5 text-xs",
        "hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        selected && "bg-[var(--bg-elevated)]",
        className,
      )}
    >
      <span className="font-mono text-[10px] text-[var(--fg-muted)] shrink-0">
        {formatTime(entry.timestamp)}
      </span>
      <span className="font-mono text-[10px] text-[var(--fg-secondary)] shrink-0 max-w-[8rem] truncate">
        {entry.actor_id}
      </span>
      <span className="text-[11px] text-[var(--fg-primary)] truncate">
        <span className="font-mono text-[var(--fg-muted)]">
          {entry.target_kind}:
        </span>
        <span className="ml-1 font-mono">{entry.target_id}</span>
        <span className="mx-1 text-[var(--fg-muted)]">·</span>
        <span>{entry.action_type}</span>
        {entry.reason && (
          <span className="ml-1 text-[var(--fg-muted)]">
            — {entry.reason.length > 60
              ? `${entry.reason.slice(0, 60)}…`
              : entry.reason}
          </span>
        )}
      </span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
          STATUS_CLASS[entry.status],
        )}
        aria-label={`status ${entry.status}`}
      >
        {entry.status}
      </span>
    </div>
  );
}
