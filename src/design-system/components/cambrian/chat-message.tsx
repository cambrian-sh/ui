import { cn } from "@/design-system/lib/utils";

export type ChatMessageAuthor = "operator" | "runtime";

export interface ChatMessageProps {
  author: ChatMessageAuthor;
  text: string;
  timestamp: string;
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ChatMessage({
  author,
  text,
  timestamp,
  className,
}: ChatMessageProps) {
  const isOperator = author === "operator";
  return (
    <div
      role="article"
      aria-label={`${author} message at ${formatTime(timestamp)}`}
      className={cn(
        "flex flex-col gap-1 rounded-sm border px-3 py-2",
        isOperator
          ? "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">
        <span>{isOperator ? "operator" : "runtime"}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono normal-case">{formatTime(timestamp)}</span>
      </div>
      <p className="text-sm text-[var(--fg-primary)] whitespace-pre-wrap break-words">
        {text}
      </p>
    </div>
  );
}
