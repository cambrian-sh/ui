import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/design-system/lib/utils";

/**
 * The segmented control. One control, used everywhere a view has a small closed
 * set of states: composer mode, filter states, the Explain action picker.
 *
 * The active item takes an accent inset ring rather than a fill — a filled
 * segment reads as a primary button and invites a click on something that is
 * already true.
 */
const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex items-center gap-0.5 rounded-md bg-[var(--bg-canvas)] p-0.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]",
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-xs transition-colors",
      "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=on]:bg-[color-mix(in_srgb,var(--accent-bg)_10%,transparent)]",
      "data-[state=on]:text-[var(--fg-primary)]",
      "data-[state=on]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]",
      className,
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
