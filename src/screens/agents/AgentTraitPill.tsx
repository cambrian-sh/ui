/* Trait pill — a small status indicator for AgentTrait.
 *
 * Maps each agent trait to a Cambrian design token. Used in the list row
 * and the detail header. Traits correspond to kernel ADR-0001 classification.
 */
import { cn } from '@/design-system/lib/utils';

const TRAITS = ['Cognitive', 'Model', 'Daemon'] as const;
export type AgentTrait = (typeof TRAITS)[number];

const TRAIT_STYLES: Record<
  AgentTrait,
  { dot: string; bg: string; text: string; label: string }
> = {
  Cognitive: {
    dot: 'bg-[var(--status-info)]',
    bg: 'bg-[var(--status-info)]/10',
    text: 'text-[var(--status-info)]',
    label: 'Cognitive',
  },
  Model: {
    dot: 'bg-[var(--status-pulse)]',
    bg: 'bg-[var(--status-pulse)]/10',
    text: 'text-[var(--status-pulse)]',
    label: 'Model',
  },
  Daemon: {
    dot: 'bg-[var(--status-warn)]',
    bg: 'bg-[var(--status-warn)]/10',
    text: 'text-[var(--status-warn)]',
    label: 'Daemon',
  },
};

export function isAgentTrait(value: string): value is AgentTrait {
  return TRAITS.includes(value as AgentTrait);
}

export function AgentTraitPill({
  trait,
  className,
}: {
  trait: string;
  className?: string;
}) {
  const s = isAgentTrait(trait)
    ? TRAIT_STYLES[trait]
    : { dot: 'bg-[var(--status-muted)]', bg: 'bg-[var(--status-muted)]/10', text: 'text-[var(--status-muted)]', label: trait };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}
