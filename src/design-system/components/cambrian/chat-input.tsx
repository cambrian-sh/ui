import * as React from "react";
import { cn } from "@/design-system/lib/utils";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  disabledReason,
  placeholder = "Send a message…",
  className,
}: ChatInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2",
        className,
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        placeholder={placeholder}
        rows={3}
        aria-label="Chat message"
        className={cn(
          "w-full resize-y rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--fg-muted)] font-mono">
          ⏎ send · ⇧⏎ newline · / commands
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          title={disabled ? disabledReason : undefined}
          className="rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
