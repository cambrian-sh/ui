import * as React from "react";
import { cn } from "@/design-system/lib/utils";
import type { AuditEntry } from "@/ipc/types";
import { AuditEntryRow } from "./audit-entry";

export interface AuditListProps {
  entries: AuditEntry[];
  selectedId?: string | null;
  onSelect?: (entryId: string) => void;
  className?: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
}

export function AuditList({
  entries,
  selectedId,
  onSelect,
  className,
  emptyTitle = "No audit entries",
  emptyBody,
  emptyAction,
}: AuditListProps) {
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-3 p-[var(--card-padding)] text-center",
          className,
        )}
           >
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-[var(--accent-bg)]"
        >
          <circle cx="24" cy="24" r="18" />
          <line x1="14" y1="24" x2="34" y2="24" />
        </svg>
        <p className="text-sm font-medium text-[var(--fg-primary)]">{emptyTitle}</p>
        {emptyBody && (
          <p className="text-xs text-[var(--fg-muted)] max-w-xs">{emptyBody}</p>
        )}
        {emptyAction && <div>{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-rowcount={entries.length}
      aria-label={`Audit list, ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
      className={cn("flex flex-col", className)}
    >
      {entries.map((entry) => (
        <AuditEntryRow
          key={entry.entry_id}
          entry={entry}
          selected={selectedId === entry.entry_id}
          onClick={onSelect}
        />
      ))}
    </div>
  );
}
