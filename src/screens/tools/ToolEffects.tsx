import { cn } from '@/design-system/lib/utils';
import type { ToolSummary } from '@/ipc/types';

/**
 * What each effect class means, in the operator's terms rather than the model's.
 * `egress` gets the sharpest wording because it is the one a sovereign
 * deployment actually buys the feature for.
 */
const EFFECT_COPY: Record<string, string> = {
  read: 'Observes state; changes nothing',
  write: 'Mutates internal state',
  egress: 'Can transmit data outside this deployment',
  spend: 'Incurs cost or moves money',
  admin: 'Alters the system’s own configuration',
};

/** Which effects read as a risk worth colouring. */
const SEVERE = new Set(['egress', 'spend', 'admin']);

interface ToolEffectsProps {
  tool: Pick<ToolSummary, 'effects' | 'effects_inferred'>;
  /** `chip` for a dense list row, `full` for the detail pane. */
  variant?: 'chip' | 'full';
  className?: string;
}

/**
 * A tool's effect classes (ADR-0086).
 *
 * A classification tag answers *what is this about*; an effect answers *what am I
 * doing to it*. Reading a CRM contact and deleting one carry the same tag and
 * vastly different risk, so both are shown — and both are checked by policy.
 *
 * `effects_inferred` is surfaced rather than hidden on purpose: it is the
 * migration checklist. Until every tool declares its effects in its manifest, an
 * operator cannot safely turn on strict registration, and "which ones are still
 * guessed?" has to be answerable at a glance.
 */
export function ToolEffects({ tool, variant = 'chip', className }: ToolEffectsProps) {
  const effects = tool.effects ?? [];
  if (effects.length === 0) return null;

  if (variant === 'chip') {
    return (
      <span className={cn('flex flex-wrap items-center gap-1', className)}>
        {effects.map((e) => (
          <span
            key={e}
            title={EFFECT_COPY[e] ?? e}
            className={cn(
              'rounded-[var(--radius-sm,3px)] border px-1.5 text-[10px] leading-4',
              SEVERE.has(e)
                ? 'border-[var(--color-status-warn)] text-[var(--color-status-warn)]'
                : 'border-[var(--border-subtle)] text-[var(--fg-muted)]',
            )}
          >
            {e}
          </span>
        ))}
        {tool.effects_inferred && (
          <span
            title="Derived from the manifest's other fields, not declared. Declare effects to enable strict registration."
            className="rounded-[var(--radius-sm,3px)] border border-dashed border-[var(--border-subtle)] px-1.5 text-[10px] leading-4 text-[var(--fg-muted)]"
          >
            inferred
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={className}>
      <ul className="space-y-1">
        {effects.map((e) => (
          <li key={e} className="flex items-baseline gap-2 text-xs">
            <span
              className={cn(
                'w-16 shrink-0 font-medium',
                SEVERE.has(e)
                  ? 'text-[var(--color-status-warn)]'
                  : 'text-[var(--fg-secondary)]',
              )}
            >
              {e}
            </span>
            <span className="text-[var(--fg-muted)]">{EFFECT_COPY[e] ?? ''}</span>
          </li>
        ))}
      </ul>
      {tool.effects_inferred && (
        <p className="mt-2 text-xs text-[var(--color-status-warn)]">
          These effects were <strong>inferred</strong> from the manifest’s other fields, not
          declared. Inference errs toward permissive, so a tool that transmits without saying so
          can slip past an egress denial. Add an <code>effects</code> list to this tool’s
          manifest; once no tool is inferred, turn on strict registration and an unclassified
          tool can no longer register at all.
        </p>
      )}
    </div>
  );
}

/**
 * A one-line summary of how much of the catalog is still guessed. Rendered above
 * the tool list so the migration has a visible finish line rather than being a
 * per-tool detail nobody adds up.
 */
export function EffectMigrationBanner({ tools }: { tools: ToolSummary[] }) {
  const inferred = tools.filter((t) => t.effects_inferred);
  if (inferred.length === 0) return null;
  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs text-[var(--color-status-warn)]">
      {inferred.length} of {tools.length} tools have <strong>inferred</strong> effect classes.
      Policy still applies to them, but the classes are a guess from each manifest — declare
      them to turn on strict registration.
    </div>
  );
}
