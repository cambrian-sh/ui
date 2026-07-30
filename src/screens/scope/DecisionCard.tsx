import { cn } from '@/design-system/lib/utils';
import type { AccessDecision, PolicyContribution } from '@/ipc/types';

/**
 * How each decision reason reads to an administrator. The kernel's reason strings
 * are a controlled vocabulary precisely so a surface can do this — an unexplained
 * denial is the failure mode the whole subsystem exists to prevent.
 */
const REASON_COPY: Record<string, string> = {
  allowed: 'Permitted',
  bypass: 'Kernel-internal read — filtering skipped',
  forbidden_tag: 'A deny tag matched',
  missing_required_tag: 'The resource lacks a required tag',
  anyof_unsatisfied: 'No tag from a required or-clause was present',
  effect_not_permitted: 'Tags passed; the effect class is not granted',
  unsatisfiable_policy: 'This boundary can never match anything',
  no_principal: 'Identity could not be established',
  skill_grant_clipped: 'A skill’s tool grant was narrowed',
  not_authorized: 'Not authorized',
};

/** What the operator should do about it. Empty when there is nothing to do. */
const REASON_ACTION: Record<string, string> = {
  forbidden_tag: 'Remove the tag from the contributing policy, or retag the resource.',
  missing_required_tag: 'Add the tag to the resource, or relax the policy that requires it.',
  anyof_unsatisfied: 'Give the resource one of the clause’s tags, or widen the clause.',
  effect_not_permitted: 'Grant the effect class, or use a tool that does not exercise it.',
  unsatisfiable_policy:
    'Two policies contradict each other. Nothing will ever match — fix the composition, not the data.',
  no_principal:
    'The principal is not registered. Register it, or check the identity the caller presented.',
};

function ReasonChip({ decision }: { decision: AccessDecision }) {
  const tone = decision.allowed
    ? decision.would_have_denied
      ? 'warn'
      : 'ok'
    : 'err';
  const label = decision.would_have_denied
    ? 'Would deny'
    : decision.allowed
      ? 'Allowed'
      : 'Denied';
  return (
    <span
      className={cn(
        'rounded-[var(--radius-sm,3px)] border px-2 py-0.5 text-xs font-medium',
        tone === 'ok' && 'border-[var(--color-status-ok)] text-[var(--color-status-ok)]',
        tone === 'err' && 'border-[var(--color-status-err)] text-[var(--color-status-err)]',
        tone === 'warn' && 'border-[var(--color-status-warn)] text-[var(--color-status-warn)]',
      )}
    >
      {label}
    </span>
  );
}

function Contribution({ c }: { c: PolicyContribution }) {
  return (
    <li className="border-l-2 border-[var(--border-subtle)] pl-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-[var(--fg-primary)]">{c.policy_name || c.policy_id}</span>
        <span className="text-[var(--fg-muted)]">linked at</span>
        <code className="text-[var(--fg-secondary)]">{c.linked_at}</code>
        {c.enforced && (
          <span className="text-[var(--color-status-warn)]" title="A downstream block does not apply to this link">
            enforced
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[var(--fg-muted)]">
        contributed <span className="text-[var(--fg-secondary)]">{c.term}</span>
        {c.values.length > 0 && (
          <>
            {' '}
            <code className="text-[var(--fg-secondary)]">{c.values.join(', ')}</code>
          </>
        )}
      </div>
    </li>
  );
}

interface TraceStep {
  heading: string;
  body: string;
  /** The decision step is the one that gets a coloured dot. */
  tone?: string;
}

/**
 * The decision as a sequence, not a verdict.
 *
 * A denial is the output of four things happening in order: an identity was
 * resolved, some policies matched it, one term won, and the result was either
 * enforced or merely recorded. Rendering only the outcome makes the operator
 * reconstruct that chain from the contribution list — which is exactly the work
 * the explainer exists to remove.
 */
function DecisionTrace({ decision }: { decision: AccessDecision }) {
  const matched = decision.decided_by.length;

  const steps: TraceStep[] = [
    {
      heading:
        decision.reason === 'no_principal'
          ? 'Principal could not be resolved'
          : 'Principal resolved',
      body:
        decision.reason === 'no_principal'
          ? 'No identity was established for the caller, so no policy could be selected for it.'
          : 'The caller resolved to a principal, and to the containers it inherits policy from.',
    },
    {
      heading:
        matched === 0
          ? 'No policy contributed a term'
          : `${matched} ${matched === 1 ? 'policy' : 'policies'} matched`,
      body:
        matched === 0
          ? 'Nothing was linked at any container in scope for this request.'
          : 'Each contributed one term. Broadest container first — that order is the precedence.',
    },
    {
      // The decision step, and the only one that carries the outcome colour.
      heading: decision.allowed ? 'Allow stands' : 'Deny wins',
      body: decision.detail
        ? `The term responsible: ${decision.detail}.`
        : 'No single term was named for this outcome.',
      tone: decision.allowed ? 'var(--status-live)' : 'var(--status-err)',
    },
    {
      heading: decision.report_only ? 'Today it is only recorded' : 'Enforced',
      body: decision.report_only
        ? 'This policy is in report-only mode, so the outcome above was written to the journal and nothing was blocked.'
        : 'The outcome above was applied to the request.',
      tone: decision.report_only ? 'var(--status-warn)' : undefined,
    },
  ];

  return (
    <ol className="relative ml-1 flex flex-col gap-3 border-l border-[var(--border-subtle)] pl-4">
      {steps.map((step, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[21px] top-[5px] size-[9px] rounded-full"
            style={{ background: step.tone ?? 'var(--border-strong)' }}
          />
          <div className="text-[13.5px] font-medium leading-[1.35] text-[var(--fg-primary)]">
            {step.heading}
          </div>
          <div className="text-[12.5px] leading-[1.55] text-[var(--fg-primary)] opacity-55">
            {step.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * One decision, rendered so it is actionable rather than merely true.
 *
 * Three things have to be visible or the answer is useless: the outcome, the
 * SPECIFIC term responsible, and which policy — linked where — contributed it.
 * That is the `gpresult` standard, and the spec is explicit that the explainer is
 * a shipped feature rather than a debugging aid.
 */
export function DecisionCard({ decision }: { decision: AccessDecision }) {
  const copy = REASON_COPY[decision.reason] ?? decision.reason;
  const action = REASON_ACTION[decision.reason];

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ReasonChip decision={decision} />
        <span className="text-sm text-[var(--fg-primary)]">{copy}</span>
        {decision.detail && (
          <code className="text-xs text-[var(--color-accent-brand)]">{decision.detail}</code>
        )}
      </div>

      <DecisionTrace decision={decision} />

      {decision.would_have_denied && (
        <p className="text-xs text-[var(--color-status-warn)]">
          A report-only policy would have denied this. The request proceeded — flip the policy
          to enforced once the blast radius looks right.
        </p>
      )}

      {action && <p className="text-xs text-[var(--fg-secondary)]">{action}</p>}

      {decision.decided_by.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-[var(--fg-primary)]">
            Contributed by
          </h4>
          <ul className="space-y-2">
            {/* Contribution renders its own <li> — wrapping it in another produced
                `<li> cannot contain a nested <li>`, invalid markup that screen readers
                and the accessibility tree both mis-report. */}
            {decision.decided_by.map((c, i) => (
              <Contribution key={`${c.policy_id}-${c.linked_at}-${i}`} c={c} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--fg-muted)]">
        <span>
          Reason code <code className="text-[var(--fg-secondary)]">{decision.reason}</code>
        </span>
        {decision.policy_version && (
          <span>
            Policy snapshot <code className="text-[var(--fg-secondary)]">{decision.policy_version}</code>
          </span>
        )}
      </div>
    </div>
  );
}
