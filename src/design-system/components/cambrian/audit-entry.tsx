import { cn } from "@/design-system/lib/utils";
import type { AuditEntry, AuditStatus } from "@/ipc/types";

export interface AuditEntryRowProps {
  entry: AuditEntry;
  selected?: boolean;
  onClick?: (entryId: string) => void;
  className?: string;
}

/**
 * The column template, shared by the header and every row.
 *
 * Declared once because the previous row used `auto auto 1fr auto`, which means
 * each row sized its own columns from its own content — so at a glance the
 * timestamps, actors and targets did not line up down the page, and the eye had
 * to re-find each field on every line. A log is read by scanning one column.
 */
export const AUDIT_GRID = "grid-cols-[74px_116px_210px_1fr_82px]";

const STATUS_CLASS: Record<AuditStatus, string> = {
  applied: "text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]",
  failed:
    "text-[var(--status-err)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-err)_34%,transparent)]",
  denied:
    "text-[var(--status-warn)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-warn)_34%,transparent)]",
};

/** A row tint for the two statuses that mean something did not happen. */
const ROW_TINT: Partial<Record<AuditStatus, string>> = {
  denied: "var(--status-warn)",
  failed: "var(--status-err)",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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
  const tint = ROW_TINT[entry.status];

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
        "grid items-center gap-3 px-[18px] py-2.5",
        AUDIT_GRID,
        "shadow-[inset_0_-1px_0_var(--border-subtle)]",
        "hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
        // A pill alone is not enough at this density: at ~30 rows a screen the
        // denied ones have to be findable without reading every line.
        tint && "tint-wash",
        selected && "bg-[var(--list-row-bg-selected)]",
        className,
      )}
      style={tint ? ({ "--tint": tint } as React.CSSProperties) : undefined}
    >
      <span className="truncate font-mono text-[11px] text-[var(--fg-muted)]">
        {formatTime(entry.timestamp)}
      </span>
      <span className="truncate font-mono text-[11.5px] text-[var(--fg-secondary)]">
        {entry.actor_id}
      </span>
      <span className="truncate font-mono text-[11.5px] text-[var(--fg-primary)] opacity-70">
        {entry.target_kind}:{entry.target_id}
      </span>
      <span className="min-w-0 truncate text-[12px] text-[var(--fg-primary)]">
        <span className="font-mono">{entry.action_type}</span>
        {entry.reason && (
          <span className="ml-2 opacity-55">“{entry.reason}”</span>
        )}
      </span>
      <span
        className={cn(
          "justify-self-end rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none",
          STATUS_CLASS[entry.status],
        )}
        aria-label={`status ${entry.status}`}
      >
        {entry.status}
      </span>
    </div>
  );
}
