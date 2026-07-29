import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/design-system/lib/utils";

/**
 * shadcn/ui checkbox, retokenised onto the console's design variables.
 *
 * The generated component ships with Tailwind's `primary` / `ring` / `background`
 * tokens, which this project does not define — every other primitive here reads the
 * `--fg-*` / `--bg-*` / `--accent-*` CSS variables instead, so the stock version would
 * render with undefined colours and quietly fall outside the one visual language the
 * console is meant to keep.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-[var(--radius-sm,3px)] border border-[var(--border-strong)] bg-[var(--input-bg)] transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-[var(--accent-bg)] data-[state=checked]:bg-[var(--accent-bg)] data-[state=checked]:text-[var(--fg-on-accent)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("grid place-content-center text-current")}>
      <Check className="h-3 w-3" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
