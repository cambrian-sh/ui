import * as React from "react";
import { cn } from "@/design-system/lib/utils";
import { Card, type CardProps } from "@/design-system/components/ui/card";

export interface StatProps extends Omit<CardProps, "title"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Smaller text after the value: a unit or a denominator ("of 7"). */
  unit?: React.ReactNode;
  /** A sentence that says what the number means. */
  caption?: React.ReactNode;
  /** A link or button at the foot of the card. */
  footer?: React.ReactNode;
}

/** A headline figure with its label and meaning. */
export function Stat({ label, value, unit, caption, footer, className, ...card }: StatProps) {
  return (
    <Card className={cn("flex flex-col gap-1", className)} {...card}>
      <div className="type-label text-[var(--fg-muted)]">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="type-figure text-[var(--fg-primary)]">{value}</span>
        {unit && <span className="text-[var(--text-sm)] text-[var(--fg-muted)]">{unit}</span>}
      </div>
      {caption && (
        <p className="text-[var(--text-sm)] leading-snug text-[var(--fg-secondary)]">{caption}</p>
      )}
      {footer && <div className="mt-auto pt-2 text-[var(--text-sm)]">{footer}</div>}
    </Card>
  );
}
