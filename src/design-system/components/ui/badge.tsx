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
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        /** running · live · connected */
        live: "text-[var(--color-accent-400)] tint-fill tint-ring",
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
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  const tint = TINTS[variant ?? "neutral"];
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      style={tint ? ({ "--tint": tint, ...style } as React.CSSProperties) : style}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
