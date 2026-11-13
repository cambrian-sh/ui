import { useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/design-system/components/ui/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/design-system/components/ui/toggle-group';
import { cn } from '@/design-system/lib/utils';

export type ComposerMode = 'message' | 'inject';

export interface ComposerProps {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** The plan an inject would land in. Absent ⇒ inject is not offered. */
  planId: string | null;
  disabled?: boolean;
  /** Rendered as visible text, not a tooltip. */
  disabledReason?: string;
  className?: string;
}

/**
 * One composer with a mode switch, replacing two stacked inputs.
 *
 * The session surface used to render a ChatInput and, beneath it, a separate
 * InjectInput with its own plan picker. Two always-visible inputs make talking
 * to a session and steering its plan look like two different features — and the
 * operator has to decide which box to type in before they have finished
 * thinking about what to say.
 *
 * They are the same act at different targets, so this is one field and a
 * segmented control that names the target.
 */
export function Composer({
  mode,
  onModeChange,
  value,
  onChange,
  onSubmit,
  planId,
  disabled,
  disabledReason,
  className,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <div className={cn('flex flex-none flex-col gap-2 pb-4 pt-3', className)}>
      <div className="flex items-center gap-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(next) => next && onModeChange(next as ComposerMode)}
          aria-label="What this goes to"
        >
          <ToggleGroupItem value="message">Message the task</ToggleGroupItem>
          <ToggleGroupItem value="inject" disabled={!planId}>
            {planId ? `Inject into plan ${planId.slice(0, 8)}` : 'Inject (no plan running)'}
          </ToggleGroupItem>
        </ToggleGroup>

        <span className="ml-auto hidden text-[11.5px] text-[var(--fg-muted)] sm:inline">
          Draft saved locally · ⏎ to send, ⇧⏎ for a new line
        </span>
      </div>

      <div
        className={cn(
          'flex items-end gap-2 rounded-[var(--radius-xl)] border border-[var(--input-border)] bg-[var(--input-bg)] p-2 pl-3.5 transition-colors',
          'focus-within:border-[var(--input-border-focus)] focus-within:ring-[3px] focus-within:ring-[color-mix(in_srgb,var(--input-border-focus)_22%,transparent)]',
          disabled && 'opacity-60',
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={
            mode === 'inject'
              ? 'Correct the plan from here…'
              : 'Message this task…'
          }
          rows={2}
          aria-label={mode === 'inject' ? 'Inject into plan' : 'Chat message'}
          className={cn(
            'max-h-[40vh] min-h-[44px] w-full resize-none bg-transparent py-1.5',
            'text-[14px] leading-[1.55] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)]',
            'focus:outline-none disabled:cursor-not-allowed',
          )}
        />
        <Button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="size-8 shrink-0 rounded-[var(--radius-md)] p-0"
          aria-label="Send"
        >
          <ArrowUp aria-hidden="true" size={16} strokeWidth={2} />
        </Button>
      </div>

      {/* A disabled composer with no visible reason is the same picture as a
          broken one. This used to live only in a `title` attribute. */}
      {disabled && disabledReason && (
        <p className="text-[12px] text-[var(--status-warn)]">{disabledReason}</p>
      )}
    </div>
  );
}
