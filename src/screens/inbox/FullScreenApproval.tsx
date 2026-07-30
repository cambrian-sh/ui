import { Button } from '@/design-system/components/ui/button';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { SlideToConfirm } from '@/design-system/components/cambrian/slide-to-confirm';
import { consequenceOf, formatIdle, idleSeconds } from '@/lib/hitl';
import type { HITLIntervention } from '@/ipc/types';

export interface FullScreenApprovalProps {
  intervention: HITLIntervention;
  onApprove: (reason: string) => void;
  onReject: (reason: string) => void;
  onClose: () => void;
  disabledReason?: string;
  busy?: boolean;
}

/** Best-effort scalar out of an open payload — never invented. */
function figure(action: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = action[key];
    if (typeof v === 'number') return v.toLocaleString();
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return null;
}

/**
 * The irreversible approval, full screen.
 *
 * Used only for `destructive_command` — the class where "undo" does not exist.
 * Three things make it different from the inline card, and each one is about
 * the same risk: that a decision this size gets made with a thumb, in a queue,
 * without reading.
 *
 *  1. **The consequence table comes first**, before the payload, before the
 *     buttons. What is being destroyed, and whether it comes back.
 *  2. **Restorable from checkpoint is answered explicitly**, and for this class
 *     the answer is *no*. An absent row would read as "probably fine".
 *  3. **Confirmation is a slide, not a tap.** A pocket tap must not be able to
 *     delete 41 memories.
 */
export function FullScreenApproval({
  intervention,
  onApprove,
  onReject,
  onClose,
  disabledReason,
  busy,
}: FullScreenApprovalProps) {
  const gate = useReasonGate();
  const action = intervention.proposed_action ?? {};
  const consequence = consequenceOf(intervention);

  // Only what the payload actually carries. Everything else says unknown,
  // because a confident zero here is the most dangerous possible lie.
  const rows: { label: string; value: string; tone?: string }[] = [
    {
      label: 'Rows affected',
      value: figure(action, ['rows', 'count', 'affected', 'documents']) ?? 'unknown',
    },
    {
      label: 'Target',
      value: figure(action, ['path', 'file', 'target', 'resource', 'table', 'url']) ?? 'unknown',
    },
    {
      label: 'Sessions affected',
      value: figure(action, ['sessions', 'sessions_affected']) ?? 'unknown',
    },
    {
      label: 'Restorable from checkpoint',
      value: 'no',
      tone: 'var(--status-err)',
    },
  ];

  const blocked = Boolean(disabledReason);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--bg-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label="Irreversible action"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-err)]">
          IRREVERSIBLE · {formatIdle(idleSeconds(intervention))} waiting
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Not now
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pb-6">
        <p className="text-[17px] leading-[1.4] text-[var(--fg-primary)]">
          {consequence.sentence}
        </p>

        {/* Consequence first. */}
        <dl
          className="flex flex-col gap-0 rounded-[var(--radius-lg)] p-3 tint-wash tint-ring"
          style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
        >
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 py-1.5"
              style={
                i > 0
                  ? { boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--fg-primary) 8%, transparent)' }
                  : undefined
              }
            >
              <dt className="text-[12.5px] text-[var(--fg-secondary)]">{row.label}</dt>
              <dd
                className="truncate font-mono text-[12.5px]"
                style={{ color: row.tone ?? 'var(--fg-primary)' }}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <details className="text-[12px] text-[var(--fg-muted)]">
          <summary className="cursor-pointer select-none">Show the raw action</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--bg-surface)] p-2.5 font-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-secondary)]">
            {JSON.stringify(intervention.proposed_action, null, 2)}
          </pre>
        </details>

        <ReasonField
          gate={gate}
          id={`fullscreen-reason-${intervention.intervention_id}`}
          label="Reason"
          disabled={blocked || busy}
        />

        <div className="mt-auto flex flex-col gap-3">
          <SlideToConfirm
            label={busy ? 'Sending…' : 'Slide to approve'}
            confirmedLabel="Approved"
            disabled={!gate.satisfied || blocked || busy}
            disabledReason={
              disabledReason ??
              (!gate.satisfied ? 'A reason is required before this can be approved.' : undefined)
            }
            onConfirm={() => onApprove(gate.reason.trim())}
          />

          <Button
            variant="secondary"
            onClick={() => onReject(gate.reason.trim())}
            disabled={!gate.satisfied || blocked || busy}
            className="min-h-12"
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
