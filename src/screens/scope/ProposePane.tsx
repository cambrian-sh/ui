import { useState } from 'react';
import { Button, EmptyState, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import type {
  LinkSpec,
  PolicyProposal,
  ProposalProblem,
  ProposalQuestion,
  Role,
  ScopeRule,
} from '@/ipc/types';
import { RuleSentence, type TermKind } from './RuleSentence';
import type { Vocabulary } from './useVocabulary';

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
export function ProposePane({
  role,
  onChanged,
  vocabulary,
}: {
  role: Role | null;
  onChanged: () => void;
  vocabulary: Vocabulary;
}) {
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

          {/* One call returns either a draft or a question, so the state
              machine stays a single branch rather than a second RPC and a
              second loading state. */}
          {proposal && (proposal.questions?.length ?? 0) > 0 ? (
            <Clarification
              questions={proposal.questions!}
              onAnswer={(phrase, choice) => {
                setRequest((r) => `${r}\n\nBy “${phrase}” I mean ${choice}.`);
                setProposal(null);
              }}
              onRephrase={() => setProposal(null)}
            />
          ) : (
            proposal && (
              <ProposalReview
                proposal={proposal}
                onApprove={() => void approve()}
                readOnly={readOnly}
                vocabulary={vocabulary}
              />
            )
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

/** The `ScopeRule` fields, as the sentence's term kinds. */
const TERM_ORDER: { kind: TermKind; field: keyof ScopeRule }[] = [
  { kind: 'forbidden', field: 'forbidden_tags' },
  { kind: 'required', field: 'required_tags' },
  { kind: 'any_of', field: 'any_of_tags' },
  { kind: 'granted', field: 'granted_tags' },
];

/** `LinkSpec` → the container string the sentence reads. */
function containerOf(link: LinkSpec | undefined): string {
  if (!link) return 'nothing';
  return link.container_kind === 'organisation'
    ? 'organisation'
    : `${link.container_kind}:${link.target_id}`;
}

function ProposalReview({
  proposal,
  onApprove,
  readOnly,
  vocabulary,
}: {
  proposal: PolicyProposal;
  onApprove: () => void;
  readOnly: boolean;
  vocabulary: Vocabulary;
}) {
  const { policy, links, problems, simulation, simulation_basis: basis, blocking } = proposal;
  const rule = policy.rule;
  const container = containerOf(links[0]);

  // One sentence per term the draft actually filled in.
  const sentences = TERM_ORDER.filter(
    ({ field }) => ((rule[field] as string[] | undefined) ?? []).length > 0,
  );

  // Problems attach to the term that caused them. A warning in a list at the
  // bottom is a warning nobody connects to a cause.
  const problemFor = (kind: TermKind) =>
    problems.filter((p) => mentionsTerm(p, kind, rule));
  const attached = new Set(
    sentences.flatMap(({ kind }) => problemFor(kind).map((p) => p.message)),
  );
  const unattached = problems.filter((p) => !attached.has(p.message));

  return (
    <div className="space-y-4 border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm text-[var(--fg-primary)]">{policy.name || policy.id}</h3>
        <code className="text-[11px] text-[var(--fg-muted)]">{policy.id}</code>
      </div>

      {/* The draft comes back as the SAME sentence the rule editor uses. One
          renderer, two callers — so reading a rule and approving a rule become
          the same act, and an operator cannot be fluent in one and not the
          other. This IS the thing being approved. */}
      {sentences.length === 0 ? (
        <p className="text-xs text-[var(--color-status-err)]">
          The draft carries no terms at all, so it is not a boundary.
        </p>
      ) : (
        <div className="space-y-4">
          {sentences.map(({ kind, field }) => (
            <div key={kind} className="space-y-1.5">
              <RuleSentence
                container={container}
                term={kind}
                tags={(rule[field] as string[] | undefined) ?? []}
                vocabulary={vocabulary}
                provenance={{
                  container: proposal.provenance?.container,
                  tags: proposal.provenance?.[field as string],
                }}
              />
              {problemFor(kind).map((p, i) => (
                <p
                  key={i}
                  className={
                    p.severity === 'blocking'
                      ? 'text-xs text-[var(--color-status-err)]'
                      : 'text-xs text-[var(--color-status-warn)]'
                  }
                >
                  <span className="uppercase tracking-wide">{p.severity}</span> &middot;{' '}
                  {p.message}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Agreeing with your own sentence echoed back is not a check; agreeing
          with its consequence is. */}
      <Consequence proposal={proposal} container={container} />

      {/* Silently dropping half the request is how an operator believes they
          asked for something they did not. */}
      {proposal.unmapped_phrases && proposal.unmapped_phrases.length > 0 && (
        <div className="space-y-1 text-xs">
          <span className="text-[var(--fg-muted)]">
            {proposal.unmapped_phrases.length === 1 ? 'This phrase' : 'These phrases'} produced no
            term:
          </span>
          <ul className="space-y-0.5">
            {proposal.unmapped_phrases.map((phrase) => (
              <li key={phrase} className="text-[var(--color-status-warn)]">
                “{phrase}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs">
        <span className="text-[var(--fg-muted)]">Applies to </span>
        {links.length > 0 ? (
          <span className="text-[var(--fg-secondary)]">{links.map(describeLink).join(', ')}</span>
        ) : (
          <span className="text-[var(--color-status-err)]">nothing</span>
        )}
      </div>

      {/* Whatever could not be attached to a specific term still has to be
          read — a warning cannot be dismissed, only read. */}
      {unattached.length > 0 && (
        <ul role="list" className="space-y-1 text-xs">
          {unattached.map((p, i) => (
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
        {/* ADR-0121 D1c: the journal never recorded parties, so a party-scoped
            draft inflates the denial count. Said here rather than left implicit,
            because this number is the one an operator decides on. */}
        {simulation?.row_scope_note && (
          <p className="mt-2 text-xs text-[var(--fg-secondary)]">{simulation.row_scope_note}</p>
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

/**
 * It asks before it drafts.
 *
 * Today an unresolvable phrase becomes a blocking problem *after* drafting —
 * which is the most expensive moment to discover it, because the operator has
 * already moved on from the intent and is now reading a policy instead.
 *
 * Two rules make this safe:
 *  - **It must never coin a label.** A hallucinated term produces a boundary
 *    that matches nothing and looks exactly like a working rule. Creating one is
 *    offered, but only as an explicit act that says it starts on zero documents.
 *  - **Ask once per phrase, never twice.** A loop that keeps asking is worse
 *    than a wrong guess, because it teaches the operator to click through.
 */
function Clarification({
  questions,
  onAnswer,
  onRephrase,
}: {
  questions: ProposalQuestion[];
  onAnswer: (phrase: string, choice: string) => void;
  onRephrase: () => void;
}) {
  return (
    <div className="space-y-4 border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4">
      {questions.map((q) => (
        <div key={q.phrase} className="space-y-3">
          <p className="text-sm text-[var(--fg-primary)]">
            What does “<strong>{q.phrase}</strong>” mean?
          </p>

          {/* Show what DID resolve, so the question reads as narrow rather than
              as the assistant having understood nothing. */}
          {q.resolved_context.length > 0 && (
            <ul className="space-y-0.5 text-xs text-[var(--fg-muted)]">
              {q.resolved_context.map((r) => (
                <li key={r.phrase}>
                  “{r.phrase}” → <code className="text-[var(--fg-secondary)]">{r.resolved_to}</code>
                </li>
              ))}
              <li className="text-[var(--color-status-warn)]">
                “{q.phrase}” → <strong>unresolved</strong>
              </li>
            </ul>
          )}

          <ul className="space-y-2">
            {q.candidates.map((c) => (
              <li key={c.tag}>
                <button
                  type="button"
                  onClick={() => onAnswer(q.phrase, c.tag)}
                  className="w-full rounded-md p-2.5 text-left shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:bg-[var(--list-row-bg-hover)]"
                >
                  <span className="flex items-baseline gap-2">
                    <code
                      className={
                        c.closed
                          ? 'text-[var(--color-status-warn)]'
                          : 'text-[var(--color-accent-400)]'
                      }
                    >
                      {c.closed && '● '}
                      {c.tag}
                    </code>
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      {c.document_count} document{c.document_count === 1 ? '' : 's'}
                    </span>
                  </span>
                  {/* The cost is the point: "did you mean X" is not answerable,
                      "choosing X revokes support-team's grant" is. */}
                  <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
                    {c.cost}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-1 text-xs text-[var(--fg-muted)]">
            <p>
              Or create <code>{q.phrase}</code> as a new label — it would start on{' '}
              <strong>zero documents</strong>, so the rule would be correct and reach nothing
              until something carries it. Label them from the Labels tab.
            </p>
            <button
              type="button"
              onClick={onRephrase}
              className="text-[var(--fg-secondary)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
            >
              Or tell me in other words
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function describeLink(l: LinkSpec): string {
  return l.container_kind === 'organisation'
    ? 'every principal (organisation)'
    : `${l.container_kind} ${l.target_id}`;
}

/**
 * Does this problem belong to that term?
 *
 * Matched on the tag names the term carries, because the kernel's problem
 * messages name the offending tag. Deliberately conservative: a problem that
 * cannot be attributed stays in the unattached list rather than being pinned to
 * the wrong term, which would be worse than not pinning it at all.
 */
function mentionsTerm(
  problem: ProposalProblem,
  kind: TermKind,
  rule: ScopeRule,
): boolean {
  const field = TERM_ORDER.find((t) => t.kind === kind)?.field;
  if (!field) return false;
  const tags = (rule[field] as string[] | undefined) ?? [];
  if (tags.length === 0) return false;
  const message = problem.message.toLowerCase();
  return tags.some((tag) => message.includes(tag.toLowerCase()));
}

/**
 * What the draft actually does, in different words from the request.
 *
 * The documents are NAMED, because a count is a claim an operator cannot check
 * and the whole point of reviewing a draft is checking it before it binds.
 * Computed from the console's own document listing; when that listing is
 * unavailable this says so rather than showing a confident zero.
 */
function Consequence({
  proposal,
  container,
}: {
  proposal: PolicyProposal;
  container: string;
}) {
  const documents = useKernelQuery(['documents', 'all'], () =>
    ipc.listDocuments({ limit: 500 }),
  );

  const rule = proposal.policy.rule;

  // A rule that can never match has no radius to measure, and three zeroes here
  // would read as "no effect" rather than "no rule" — the safest-looking and
  // most misleading thing this pane could render.
  const contradiction = rule.required_tags.filter((t) => rule.forbidden_tags.includes(t));
  const flaggedUnsatisfiable = proposal.problems.some((p) =>
    /unsatisfiable|never match|cannot match/i.test(p.message),
  );

  if (contradiction.length > 0 || flaggedUnsatisfiable) {
    return (
      <div
        className="flex flex-col gap-1 rounded-md p-2.5 tint-wash tint-ring"
        style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-err)]">
          NO RADIUS TO MEASURE
        </span>
        <p className="text-[12px] leading-[1.55] text-[var(--fg-primary)]">
          {contradiction.length > 0 ? (
            <>
              <code>{contradiction.join(', ')}</code> is both required and forbidden, so this
              rule can never match anything.
            </>
          ) : (
            <>This rule can never match anything.</>
          )}{' '}
          The blast radius is deliberately <strong>not simulated</strong>: a rule that cannot
          match has nothing to measure, and a count of zero here would read as{' '}
          <em>no effect</em> rather than <em>no rule</em>.
        </p>
        <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          Even with the contradiction removed, requiring a closed label with no matching grant
          is still a boundary that matches nothing. Fix the composition, not the data.
        </p>
      </div>
    );
  }

  const term = TERM_ORDER.find(
    ({ field }) => ((rule[field] as string[] | undefined) ?? []).length > 0,
  );
  if (!term) return null;

  const tags = new Set((rule[term.field] as string[] | undefined) ?? []);
  const docs = documents.data?.documents ?? [];
  const affected = docs.filter((d) =>
    term.kind === 'required'
      ? !d.tags.some((t) => tags.has(t))
      : d.tags.some((t) => tags.has(t)),
  );

  if (documents.isLoading) {
    return <p className="text-xs text-[var(--fg-muted)]">Working out what this changes…</p>;
  }
  if (documents.error || docs.length === 0) {
    return (
      <p className="text-xs text-[var(--fg-muted)]">
        The document listing is unavailable, so what this changes is{' '}
        <strong>unknown</strong> — not nothing.
      </p>
    );
  }

  const verb =
    term.kind === 'granted'
      ? 'become readable'
      : term.kind === 'required'
        ? 'stop being reachable'
        : 'stop being readable';

  return (
    <p className="text-xs leading-[1.6] text-[var(--fg-secondary)]">
      <strong className="text-[var(--fg-primary)]">
        {affected.length} document{affected.length === 1 ? '' : 's'}
      </strong>{' '}
      {verb} through <code>{container}</code>
      {affected.length > 0 && (
        <>
          {' '}
          — {affected.slice(0, 3).map((d) => d.title || d.id).join(', ')}
          {affected.length > 3 && ` and ${affected.length - 3} more`}
        </>
      )}
      .
    </p>
  );
}

export type { ProposalProblem };
