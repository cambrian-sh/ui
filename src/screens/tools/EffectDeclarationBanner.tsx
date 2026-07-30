import type { ToolSummary } from '@/ipc/types';

/**
 * How far the effect-declaration migration has got.
 *
 * `execution.tool_effects_strict` can only be flipped on once nothing is
 * inferred, so "how many are still derived from the manifest" is a finish line
 * an operator is working towards — and it was previously only discoverable by
 * opening tools one at a time and noticing an `inferred` chip.
 *
 * The split bar shows declared against inferred. An inferred effect is a guess
 * the kernel made, and a wrong guess on `egress` is the difference between a
 * tool that can leave the deployment and one that cannot.
 */
export function EffectDeclarationBanner({ tools }: { tools: readonly ToolSummary[] }) {
  const withEffects = tools.filter((t) => (t.effects?.length ?? 0) > 0);
  if (tools.length === 0) return null;

  const inferred = withEffects.filter((t) => t.effects_inferred).length;
  const declared = withEffects.length - inferred;
  const undeclared = tools.length - withEffects.length;
  const declaredPct = (declared / tools.length) * 100;
  const inferredPct = (inferred / tools.length) * 100;

  const clean = inferred === 0 && undeclared === 0;

  return (
    <div className="mx-4 mb-2 flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">
          Effect classes are declared for {declared} of {tools.length} tools
        </span>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {inferred} inferred · {undeclared} undeclared
        </span>
      </div>

      <div
        className="flex h-1.5 w-full overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]"
        role="img"
        aria-label={`${declared} declared, ${inferred} inferred, ${undeclared} undeclared`}
      >
        <span style={{ width: `${declaredPct}%`, background: 'var(--accent-bg)' }} />
        <span
          style={{
            width: `${inferredPct}%`,
            // Hatched, not solid: an inferred effect is a different kind of
            // fact from a declared one, and hatching says "provisional" without
            // needing a second colour.
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--status-warn) 0 3px, transparent 3px 6px)',
          }}
        />
      </div>

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {clean
          ? 'Every tool declares its effects. `execution.tool_effects_strict` can be turned on.'
          : 'Effects that are inferred were derived from the manifest, not declared by it. `execution.tool_effects_strict` stays off until that count reaches zero.'}
      </p>
    </div>
  );
}
