import * as React from "react";
import { cn } from "@/design-system/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1 text-[13px] text-[var(--input-fg)] transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:border-[var(--input-border-focus)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus-ring)_22%,transparent)] placeholder:text-[var(--input-placeholder)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
