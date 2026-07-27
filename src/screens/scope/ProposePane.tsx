import { useState } from 'react';
import { Button, EmptyState, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { LinkSpec, PolicyProposal, ProposalProblem, Role } from '@/ipc/types';

/**
 * Describe an access boundary in English; get a policy back (ADR-0092).
 *
 * The whole pane is arranged around one fact: **the model proposes and never
 * enforces.** It has no write path. "Approve" here calls the same `savePolicy`
 * and `linkPolicy` an operator uses to author by hand, so nothing about approving
 * a proposal skips a validation, an audit record, or the report-only default.
 *
 * That makes the approval step load-bearing rather than ceremonial, and the layout
 * follows from it:
 *
 * - **The terms come before the prose.** The rationale is the model's
 *   explanation, not the thing being approved, so it sits below the rule it is
 *   explaining. An operator who reads only the top of this pane still reads the
 *   policy.
 * - **Problems are unmissable and typed.** A blocking problem disables Approve
 *   outright; a warning cannot be dismissed, only read. The one that matters most
 *   is a grant, because a grant is the only term in the model that ADDS access.
 * - **The blast radius is measured, not claimed.** Counts come from replaying real
 *   journalled decisions, and an empty journal says "nothing to compare" rather
 *   than showing three zeroes that read like "no effect".
 * - **Approving lands report-only, always.** The assistant's value is authoring
 *   speed; the risk is enforcement. Enforcing is a separate deliberate act on the
 *   Rollout tab, and keeping it separate removes the entire class of "the
 *   assistant locked production out".
 */
export function ProposePane({ role, onChanged }: { role: Role | null; onChanged: () => void }) {
  const readOnly = role !== 'operator';
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<PolicyProposal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const draft = async () => {
    if (!request.trim()) return;
    setPending(true);
    setError(null);
    setApplied(null);
    setProposal(null);
    try {
      setProposal(await ipc.proposePolicy(request));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const approve = async () => {
    if (!proposal || proposal.blocking) return;
    setError(null);
    try {
      const out = await ipc.savePolicy(proposal.policy);
      if (!out.ok) {
        // The store refused what the proposer validated. That is a real
        // disagreement worth showing verbatim rather than smoothing over: the two
        // are supposed to apply the same rules, so the text is a bug report.
        setError(out.error || 'the kernel refused this policy');
        return;
      }
      // Links after the policy, because a link to a policy that does not exist is
      // refused — and a policy linked to nothing applies to nobody, so a partial
      // failure here has to be visible rather than counted as success.
      for (const link of proposal.links) {
        await ipc.linkPolicy(link);
      }
      setApplied(proposal.policy.id);
      setProposal(null);
      setRequest('');
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border-subtle)] px-4 py-2">
        <span className="text-xs text-[var(--fg-muted)]">
          Describe a boundary and review the policy it produces. Nothing is applied until you
          approve it, and an approved proposal lands <strong>report-only</strong>.
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void draft();
            }}
          >
            <label htmlFor="propose-request" className="block text-xs text-[var(--fg-muted)]">
              What should be allowed or denied?
            </label>
            <textarea
              id="propose-request"
              rows={3}
              value={request}
              disabled={readOnly}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Support agents shouldn't be able to read anything marked secrets."
              className="w-full resize-y border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-2 font-mono text-xs text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={readOnly || pending || !request.trim()}>
                {pending ? 'Drafting…' : 'Draft a policy'}
              </Button>
              {readOnly && (
                <span className="text-xs text-[var(--fg-muted)]">
                  Authoring policy needs the operator role.
                </span>
              )}
            </div>
          </form>

          {error && (
            <p role="alert" className="text-xs text-[var(--color-status-err)]">
              {error}
            </p>
          )}

          {applied && (
            <p role="status" className="text-xs text-[var(--fg-secondary)]">
              Saved <code>{applied}</code> as <strong>report-only</strong>. It journals decisions
              without enforcing any of them &mdash; enforce it from the Rollout tab when the
              journal looks right.
            </p>
          )}

          {proposal && (
            <ProposalReview proposal={proposal} onApprove={() => void approve()} readOnly={readOnly} />
          )}

          {!proposal && !pending && !applied && !error && (
            <EmptyState
              title="No draft yet"
              body="Describe the boundary you want in your own words. The draft comes back with its terms, the containers it would apply to, every problem with it, and what it would have changed across recent real decisions."
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ProposalReview({
  proposal,
  onApprove,
  readOnly,
}: {
  proposal: PolicyProposal;
  onApprove: () => void;
  readOnly: boolean;
}) {
  const { policy, links, problems, simulation, simulation_basis: basis, blocking } = proposal;
  const rule = policy.rule;
  const terms: [string, string[]][] = [
    ['Required', rule.required_tags],
    ['Any of', rule.any_of_tags],
    ['Forbidden', rule.forbidden_tags],
    ['Grants', rule.granted_tags ?? []],
  ];

  return (
    <div className="space-y-4 border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm text-[var(--fg-primary)]">{policy.name || policy.id}</h3>
        <code className="text-[11px] text-[var(--fg-muted)]">{policy.id}</code>
      </div>

      {/* The terms first: this IS the thing being approved. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        {terms.map(([label, tags]) => (
          <div key={label}>
            <dt className="text-[var(--fg-muted)]">{label}</dt>
            <dd
              className={
                label === 'Grants' && tags.length > 0
                  ? 'text-[var(--color-status-warn)]'
                  : 'text-[var(--fg-secondary)]'
              }
            >
              {tags.length > 0 ? tags.join(', ') : '—'}
            </dd>
          </div>
        ))}
      </dl>

      <div className="text-xs">
        <span className="text-[var(--fg-muted)]">Applies to </span>
        {links.length > 0 ? (
          <span className="text-[var(--fg-secondary)]">{links.map(describeLink).join(', ')}</span>
        ) : (
          <span className="text-[var(--color-status-err)]">nothing</span>
        )}
      </div>

      {problems.length > 0 && (
        <ul role="list" className="space-y-1 text-xs">
          {problems.map((p, i) => (
            <li
              key={i}
              className={
                p.severity === 'blocking'
                  ? 'text-[var(--color-status-err)]'
                  : 'text-[var(--color-status-warn)]'
              }
            >
              <span className="uppercase tracking-wide">{p.severity}</span> &middot; {p.message}
            </li>
          ))}
        </ul>
      )}

      {/* The rationale sits BELOW the rule it explains: it is context, not the
          artefact under review. */}
      {proposal.rationale && (
        <p className="border-l-2 border-[var(--border-subtle)] pl-3 text-xs text-[var(--fg-muted)]">
          {proposal.rationale}
        </p>
      )}

      <div className="text-xs">
        {basis === 0 ? (
          <span className="text-[var(--fg-muted)]">
            No journalled decisions to replay, so the blast radius is <strong>unknown</strong> —
            not zero. Report-only is how you find out.
          </span>
        ) : (
          <span className="text-[var(--fg-secondary)]">
            Against {basis} recent decision{basis === 1 ? '' : 's'}:{' '}
            <strong
              className={
                simulation.newly_denied > 0 ? 'text-[var(--color-status-warn)]' : undefined
              }
            >
              {simulation.newly_denied} newly denied
            </strong>
            , {simulation.newly_allowed} newly allowed, {simulation.unchanged} unchanged.
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-3">
        <Button size="sm" disabled={readOnly || blocking} onClick={onApprove}>
          Approve as report-only
        </Button>
        <span className="text-xs text-[var(--fg-muted)]">
          {blocking
            ? 'Fix the blocking problems above, or rephrase the request.'
            : 'Saves and links it without enforcing anything.'}
        </span>
      </div>
    </div>
  );
}

function describeLink(l: LinkSpec): string {
  return l.container_kind === 'organisation'
    ? 'every principal (organisation)'
    : `${l.container_kind} ${l.target_id}`;
}

export type { ProposalProblem };
