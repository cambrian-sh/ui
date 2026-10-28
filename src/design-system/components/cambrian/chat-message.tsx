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

/**
 * One turn of a conversation.
 *
 * The operator's turns sit on the right in a tinted bubble and Cambrian's on the
 * left as plain text, so who said what is readable from the shape of the column
 * without reading a single label.
 */
export function ChatMessage({
  author,
  text,
  timestamp,
  className,
}: ChatMessageProps) {
  const isOperator = author === "operator";
  const who = isOperator ? "You" : "Cambrian";
  return (
    <div
      role="article"
      aria-label={`${who} at ${formatTime(timestamp)}`}
      className={cn(
        "flex flex-col gap-1",
        isOperator ? "items-end" : "items-start",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--fg-muted)]">
        <span className="font-medium text-[var(--fg-secondary)]">{who}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{formatTime(timestamp)}</span>
      </div>
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-[14px] leading-[1.6] text-[var(--fg-primary)]",
          isOperator &&
            "max-w-[85%] rounded-[var(--radius-xl)] rounded-tr-[var(--radius-sm)] bg-[var(--list-row-bg-selected)] px-3.5 py-2",
        )}
      >
        {text}
      </p>
    </div>
  );
}
