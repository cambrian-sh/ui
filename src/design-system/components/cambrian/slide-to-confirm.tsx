import * as React from 'react';
import { cn } from '@/design-system/lib/utils';

export interface SlideToConfirmProps {
  label: string;
  confirmedLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/** How far along the rail counts as a deliberate act. */
const THRESHOLD = 0.9;

/**
 * A rail you drag, instead of a button you tap.
 *
 * Reserved for irreversible actions on mobile. The reasoning is narrow and
 * practical: a phone in a pocket, a mis-scroll, or a tap landing on a control
 * that moved under the thumb are all things that produce a single accidental
 * tap — and none of them produce a deliberate 90% drag. A button cannot tell
 * those apart; this can.
 *
 * It is keyboard-operable too (arrows, End, Enter), so the safety property does
 * not cost accessibility: the slider role carries the same semantics a
 * screen-reader user needs, and Enter at the end is as deliberate as a drag.
 */
export function SlideToConfirm({
  label,
  confirmedLabel = 'Confirmed',
  onConfirm,
  disabled,
  disabledReason,
  className,
}: SlideToConfirmProps) {
  const railRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState(false);
  const dragging = React.useRef(false);

  const commit = React.useCallback(
    (value: number) => {
      if (value >= THRESHOLD) {
        setProgress(1);
        setConfirmed(true);
        onConfirm();
      } else {
        // Springs back. A partial drag is not a decision, and leaving it
        // part-way would let the next accidental touch finish it.
        setProgress(0);
      }
    },
    [onConfirm],
  );

  const positionFrom = (clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || confirmed) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setProgress(positionFrom(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setProgress(positionFrom(e.clientX));
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    commit(progress);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || confirmed) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setProgress((p) => Math.min(1, p + 0.1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setProgress((p) => Math.max(0, p - 0.1));
    } else if (e.key === 'End') {
      e.preventDefault();
      setProgress(1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(progress);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        ref={railRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={confirmed ? confirmedLabel : `${Math.round(progress * 100)}% — slide to confirm`}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex h-12 select-none items-center overflow-hidden rounded-full',
          'bg-[var(--bg-canvas)] shadow-[inset_0_0_0_1px_var(--border-strong)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab touch-none',
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: confirmed
              ? 'color-mix(in srgb, var(--status-live) 26%, transparent)'
              : 'color-mix(in srgb, var(--status-err) 22%, transparent)',
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none relative w-full text-center text-[13px] font-medium"
          style={{ color: confirmed ? 'var(--status-live)' : 'var(--fg-primary)' }}
        >
          {confirmed ? confirmedLabel : label}
        </span>
        {!confirmed && (
          <span
            aria-hidden="true"
            className="absolute top-1 flex size-10 items-center justify-center rounded-full bg-[var(--bg-elevated)] shadow-[var(--elevation-2)]"
            style={{ left: `calc(${progress * 100}% - ${progress * 44}px + 2px)` }}
          >
            <span className="text-[var(--fg-secondary)]">›</span>
          </span>
        )}
      </div>

      {disabled && disabledReason ? (
        <p className="text-[11.5px] text-[var(--status-warn)]">{disabledReason}</p>
      ) : (
        !confirmed && (
          <p className="text-[11.5px] text-[var(--fg-muted)]">
            Slide all the way. This one cannot be undone, so a single tap is not enough.
          </p>
        )
      )}
    </div>
  );
}
