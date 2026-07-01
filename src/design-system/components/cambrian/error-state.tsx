import * as React from "react";
import { cn } from "@/design-system/lib/utils";

export interface ErrorStateProps {
  reason: string;
  whatToDo?: string;
  deepLink?: React.ReactNode;
  className?: string;
}

export function ErrorState({ reason, whatToDo, deepLink, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-sm border border-[var(--status-err)] bg-[var(--bg-surface)] p-[var(--card-padding)]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-[var(--status-err)]"
        >
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="5" x2="8" y2="9" />
          <line x1="8" y1="11" x2="8" y2="11.01" />
        </svg>
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--status-err)]">
          Error
        </span>
      </div>
      <p className="text-sm text-[var(--fg-primary)] font-mono whitespace-pre-wrap break-words">
        {reason}
      </p>
      {whatToDo && (
        <p className="text-xs text-[var(--fg-muted)]">{whatToDo}</p>
      )}
      {deepLink && <div className="mt-1">{deepLink}</div>}
    </div>
  );
}
