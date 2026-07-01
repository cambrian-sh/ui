import * as React from "react";
import { cn } from "@/design-system/lib/utils";
import {
  MemoryListRow,
  type MemoryDocument,
  type MemoryDocType,
} from "./memory-list-row";

export interface MemoryListProps {
  docs: MemoryDocument[];
  selectedId?: string | null;
  onSelect?: (docId: string) => void;
  showCheckbox?: boolean;
  selectedIds?: Set<string>;
  onToggleCheck?: (docId: string) => void;
  className?: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
}

export function MemoryList({
  docs,
  selectedId,
  onSelect,
  showCheckbox,
  selectedIds,
  onToggleCheck,
  className,
  emptyTitle = "No memories match",
  emptyBody,
  emptyAction,
}: MemoryListProps) {
  if (docs.length === 0) {
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
      aria-rowcount={docs.length}
      aria-label={`Memory list, ${docs.length} ${docs.length === 1 ? "row" : "rows"}`}
      className={cn("flex flex-col", className)}
    >
      {docs.map((doc) => (
        <MemoryListRow
          key={doc.doc_id}
          doc={doc}
          selected={selectedId === doc.doc_id}
          showCheckbox={showCheckbox}
          checked={selectedIds?.has(doc.doc_id) ?? false}
          onCheckboxChange={onToggleCheck}
          onClick={onSelect}
        />
      ))}
    </div>
  );
}

export type { MemoryDocument, MemoryDocType };
