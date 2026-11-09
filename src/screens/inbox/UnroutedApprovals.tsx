import { useState } from 'react';
import type { UnroutedApproval } from '@/ipc/types';
import { unroutedExplanation, describeRule } from '@/lib/approvalRules';

/**
 * ADR-0142 D11: approvals that ended UNANSWERED because nobody could be
 * addressed. Before this the card simply vanished, so a blocked payment looked
 * the same as one nobody asked about. Not part of the badge count — there is
 * nothing to decide — but visible until dismissed (dismissal is local only).
 */
export function UnroutedApprovals({ items }: { items: readonly UnroutedApproval[] }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const shown = items.filter((u) => !dismissed.has(u.intervention_id)).slice().reverse();
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="unrouted-h" className="max-w-[860px] px-[26px] pb-4">
      <h2 id="unrouted-h" className="mb-2 text-[13px] font-medium">
        Ended without an approver ({shown.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {shown.map((u) => {
          const e = unroutedExplanation(u);
          return (
            <li
              key={u.intervention_id}
              className="flex flex-col gap-1 rounded-md p-3 tint-wash tint-ring"
              style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">{e.title}</span>
                <button
                  type="button"
                  onClick={() => setDismissed((d) => new Set(d).add(u.intervention_id))}
                  className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  aria-label={`Dismiss ${u.summary || u.intervention_id}`}
                >
                  Dismiss
                </button>
              </div>
              {u.summary && <span className="text-[12.5px] font-medium text-[var(--fg-primary)]">{u.summary}</span>}
              <p className="text-[12px] leading-[1.55] text-[var(--fg-secondary)]">{e.body}</p>
              {u.rule && (
                <p className="text-[11.5px] text-[var(--fg-muted)]">
                  Approver rule: {describeRule(u.rule)} <code className="ml-1">({u.rule})</code>
                </p>
              )}
              {u.detail && <p className="text-[11.5px] text-[var(--fg-muted)]">Kernel: {u.detail}</p>}
              <p className="text-[11.5px] text-[var(--fg-secondary)]">{e.fix}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
