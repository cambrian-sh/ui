import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/design-system/lib/utils";

/**
 * A 3px rail. Used for plan progress, the HITL reason gate, and the tool
 * effect-declaration split.
 *
 * The fill transitions over ~600ms, but only when the value actually changed —
 * `transition` on width does that for free, where a keyframe animation would
 * replay on every unrelated re-render.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    /** Any CSS colour or token reference. Defaults to the accent. */
    tone?: string;
  }
>(({ className, value, tone, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-[3px] w-full overflow-hidden rounded-[2px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]",
      className,
    )}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="cambrian-rail-fill h-full rounded-[2px]"
      style={{
        width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
        background: tone ?? "var(--accent-bg)",
      }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
