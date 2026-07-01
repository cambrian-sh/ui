import { cn } from "@/design-system/lib/utils";

export interface SkeletonProps {
  variant?: "text" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = "text",
  width,
  height,
  className,
}: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        "cambrian-skeleton",
        variant === "circle" && "rounded-full",
        variant === "rect" && "rounded-sm",
        variant === "text" && "h-[5px] rounded-sm",
        className,
      )}
      style={{ width, height }}
    />
  );
}
