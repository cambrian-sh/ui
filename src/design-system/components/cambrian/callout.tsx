import * as React from "react";
import { cn } from "@/design-system/lib/utils";

const TONES = {
  info: "var(--color-accent-500)",
  warn: "var(--status-warn)",
  err: "var(--status-err)",
  live: "var(--status-live)",
} as const;

export interface CalloutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: keyof typeof TONES;
  /** A short lead-in, set in the tone colour ("If you turn this off:"). */
  title?: React.ReactNode;
  /** Right-aligned action, e.g. a button that fixes the problem. */
  action?: React.ReactNode;
}

/**
 * A consequence or warning the reader must not miss. The text carries the
 * meaning; the colour only says how serious it is.
 */
export function Callout({
  tone = "info",
  title,
  action,
  className,
  style,
  children,
  ...props
}: CalloutProps) {
  return (
    <div
      role={tone === "err" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--tint)_30%,transparent)] px-3 py-2.5 text-[var(--text-sm)] leading-relaxed text-[var(--fg-primary)] tint-wash",
        className,
      )}
      style={{ "--tint": TONES[tone], ...style } as React.CSSProperties}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-[0.5em] size-1.5 flex-none rounded-full bg-[var(--tint)]"
      />
      <div className="min-w-0 flex-1">
        {title && <span className="font-medium text-[var(--tint)]">{title} </span>}
        {children}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
