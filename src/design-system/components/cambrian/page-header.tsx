import * as React from "react";
import { cn } from "@/design-system/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  /** One or two sentences: what this screen is for, or what is true right now. */
  description?: React.ReactNode;
  /** Sits beside the title: a state badge, a count, an id. */
  meta?: React.ReactNode;
  /** Right-aligned actions. The primary action goes last. */
  actions?: React.ReactNode;
  /** Draws a hairline under the header, for screens whose body scrolls under it. */
  divider?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** The top of a screen: one per screen, always the page's `h1`. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  divider,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 px-[var(--page-gutter)] pb-4 pt-5",
        divider && "border-b border-[var(--border-subtle)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="type-page-title text-[var(--fg-primary)]">{title}</h1>
            {meta}
          </div>
          {description && (
            <p className="type-page-description mt-1 max-w-[68ch]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
