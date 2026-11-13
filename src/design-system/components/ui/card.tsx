import * as React from "react";
import { cn } from "@/design-system/lib/utils";

const TONES = {
  warn: "var(--status-warn)",
  err: "var(--status-err)",
  live: "var(--status-live)",
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Washes the card in a status colour, for a card whose whole point is that
   * state ("1 of 7 documents unlabelled"). The card must also say it in words.
   */
  tone?: keyof typeof TONES;
  /** Hover feedback, for a card that is itself a link or button. */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, interactive, style, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--card-bg)] text-[var(--card-fg)] p-[var(--card-padding)]",
        tone
          ? "border-[color-mix(in_srgb,var(--tint)_32%,var(--card-border))] tint-wash"
          : "border-[var(--card-border)]",
        interactive &&
          "transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--list-row-bg-hover)]",
        className,
      )}
      style={tone ? ({ "--tint": TONES[tone], ...style } as React.CSSProperties) : style}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 pb-[var(--density-compact)]", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

/**
 * `as` sets the heading level so a page can keep a valid heading order (a card
 * directly under an `h1` must be an `h2`). Styling is level-independent.
 */
export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4";
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Heading = "h3", ...props }, ref) => (
    <Heading ref={ref} className={cn("type-section-title", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-[var(--fg-muted)]", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center pt-[var(--density-compact)]", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
