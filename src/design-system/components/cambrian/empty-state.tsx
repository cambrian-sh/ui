import * as React from "react";
import { cn } from "@/design-system/lib/utils";
import { Button } from "@/design-system/components/ui/button";

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  /** A lucide icon (or any 20px glyph) naming what would be here. */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Says what would be here and how it gets here. An empty kernel is a correct
 * state, not an error, so this is calm and neutral.
 */
export function EmptyState({ title, body, action, icon, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mb-1 flex size-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-muted)]"
      >
        {icon ?? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 13h5l1.5 2.5h5L16 13h5" />
          </svg>
        )}
      </div>
      <p className="text-[var(--text-base)] font-medium text-[var(--fg-primary)]">{title}</p>
      {body && (
        <p className="max-w-sm text-[var(--text-sm)] leading-relaxed text-[var(--fg-muted)]">{body}</p>
      )}
      {action && (
        <div className="mt-2">
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
