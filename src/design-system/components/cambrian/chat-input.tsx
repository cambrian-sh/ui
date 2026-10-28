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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "flex items-end gap-2 rounded-[var(--radius-xl)] border border-[var(--input-border)] bg-[var(--input-bg)] p-2 pl-3.5 transition-colors",
          "focus-within:border-[var(--input-border-focus)] focus-within:ring-[3px] focus-within:ring-[color-mix(in_srgb,var(--input-border-focus)_22%,transparent)]",
          disabled && "opacity-60",
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
          rows={2}
          aria-label="Chat message"
          className="max-h-[40vh] min-h-[44px] w-full resize-none bg-transparent py-1.5 text-[14px] leading-[1.55] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          title={disabled ? disabledReason : undefined}
          className="h-8 shrink-0 rounded-[var(--radius-md)] bg-[var(--button-primary-bg)] px-3 text-[13px] font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--fg-muted)]">
        {/* A disabled field with no visible reason reads as a broken one. */}
        <span className={cn(disabled && disabledReason && "text-[var(--status-warn)]")}>
          {disabled && disabledReason ? disabledReason : ""}
        </span>
        <span className="shrink-0">⏎ send · ⇧⏎ new line · / commands</span>
      </div>
    </div>
  );
}
