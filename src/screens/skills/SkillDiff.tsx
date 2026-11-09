import { useMemo } from 'react';
import { cn } from '@/design-system/lib/utils';
import { diffStats, lineDiff } from '@/lib/lineDiff';

/**
 * A proposed SKILL.md against the current one, line by line.
 *
 * Added and removed lines carry a +/− glyph as well as a tint, so the change is
 * readable without colour (WCAG 1.4.1).
 */
export function SkillDiff({ before, after, className }: { before: string; after: string; className?: string }) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  const stats = diffStats(lines);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
        {before === '' ? 'new skill' : 'against the current version'} · +{stats.added} −{stats.removed}
      </p>
      <pre
        aria-label="Line diff"
        className="max-h-[360px] overflow-auto rounded-md bg-[var(--bg-canvas)] p-2 font-mono text-[11.5px] leading-[1.55] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
      >
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap break-words px-1',
              l.op === 'add' && 'bg-[color-mix(in_srgb,var(--status-live)_14%,transparent)]',
              l.op === 'del' && 'bg-[color-mix(in_srgb,var(--status-err)_14%,transparent)] text-[var(--fg-secondary)]',
            )}
          >
            <span aria-hidden="true" className="mr-2 select-none text-[var(--fg-muted)]">
              {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
            </span>
            {l.op === 'add' && <span className="sr-only">added: </span>}
            {l.op === 'del' && <span className="sr-only">removed: </span>}
            {l.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

const VERDICT_TONE: Record<string, string> = {
  clean: 'var(--status-live)',
  suspicious: 'var(--status-warn)',
  dangerous: 'var(--status-err)',
};

export function ScanVerdict({ verdict, findings }: { verdict: string; findings: string[] }) {
  const tone = VERDICT_TONE[verdict] ?? 'var(--fg-muted)';
  return (
    <div className="flex flex-col gap-1">
      <span
        className="w-fit rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] tint-fill tint-ring"
        style={{ '--tint': tone, color: tone } as React.CSSProperties}
      >
        scan: {verdict || 'not scanned'}
      </span>
      {findings.length > 0 && (
        <ul className="list-disc pl-5 text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
          {findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
