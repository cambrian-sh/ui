import { cn } from "@/design-system/lib/utils";
import { Button } from "@/design-system/components/ui/button";

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-[var(--card-padding)] text-center",
        className,
      )}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-[var(--accent-bg)]"
      >
        <circle cx="24" cy="24" r="18" />
        <line x1="14" y1="24" x2="34" y2="24" />
      </svg>
      <p className="text-sm font-medium text-[var(--fg-primary)]">{title}</p>
      {body && (
        <p className="text-xs text-[var(--fg-muted)] max-w-xs">{body}</p>
      )}
      {action && (
        <div className="mt-2">
          <Button size="sm" variant="default" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
