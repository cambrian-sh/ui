import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/design-system/lib/utils";

/**
 * The only tag style in the console.
 *
 * The variants map 1:1 onto the --status-* tokens, so a badge cannot invent a
 * severity the rest of the UI does not recognise. Colour is never the only
 * carrier: a badge always contains the word too, because ~1 in 12 men cannot
 * separate `warn` from `err` by hue.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        /** running · live · connected */
        live: "text-[var(--status-live)] tint-fill tint-ring",
        /** waiting on you · degraded · blocked */
        warn: "text-[var(--status-warn)] tint-fill tint-ring",
        /** failed · down · denied */
        err: "text-[var(--status-err)] tint-fill tint-ring",
        /** completed · inert */
        neutral: "text-[var(--fg-muted)] tint-fill tint-ring",
        /** in-progress, but not the one thing you should look at */
        outline:
          "text-[var(--fg-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

const TINTS: Record<string, string> = {
  live: "var(--status-live)",
  warn: "var(--status-warn)",
  err: "var(--status-err)",
  neutral: "var(--status-idle)",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Lead with a status dot — for a state ("Running"), not a tag ("finance"). */
  dot?: boolean;
}

function Badge({ className, variant, style, dot, children, ...props }: BadgeProps) {
  const tint = TINTS[variant ?? "neutral"];
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      style={tint ? ({ "--tint": tint, ...style } as React.CSSProperties) : style}
      {...props}
    >
      {dot && (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
