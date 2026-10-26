import * as React from "react";
import { cn } from "@/design-system/lib/utils";

export interface SectionHeaderProps {
  title: React.ReactNode;
  /** A count of what the section holds, shown muted beside the title. */
  count?: number;
  description?: React.ReactNode;
  /** Right-aligned: usually a link to the full list. */
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}

/** Titles a block within a screen ("Needs you 2 · Open the inbox"). */
export function SectionHeader({
  title,
  count,
  description,
  action,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4 pb-2", className)}>
      <div className="min-w-0">
        <Heading className="type-section-title flex items-baseline gap-2 text-[var(--fg-primary)]">
          {title}
          {count !== undefined && (
            <span className="text-[var(--text-sm)] font-normal tabular-nums text-[var(--fg-muted)]">
              {count}
            </span>
          )}
        </Heading>
        {description && (
          <p className="mt-0.5 text-[var(--text-sm)] text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="flex-none text-[var(--text-sm)]">{action}</div>}
    </div>
  );
}
