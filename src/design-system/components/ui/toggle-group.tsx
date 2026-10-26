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
      "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] bg-[var(--bg-elevated)] p-0.5",
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
      "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-2.5 text-[12.5px] font-medium transition-colors",
      "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=on]:bg-[var(--bg-overlay)]",
      "data-[state=on]:text-[var(--fg-primary)]",
      "data-[state=on]:shadow-[0_0_0_1px_var(--border-subtle),0_1px_2px_rgb(0_0_0/0.08)]",
      className,
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
