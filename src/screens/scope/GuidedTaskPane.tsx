import { useEffect, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import type { DocumentSummary, IngressSpec } from '@/ipc/types';
import { DecisionCard } from './DecisionCard';
import { RuleSentence, TagChip, TERMS, type TermKind } from './RuleSentence';
import { compileRule } from './compilePolicy';
import {
  EMPTY_TASK,
  stepStatuses,
  TASK_STEPS,
  taskOutcome,
  type TaskState,
} from './taskThread';
import type { Vocabulary } from './useVocabulary';

export interface GuidedTaskPaneProps {
  vocabulary: Vocabulary;
  canMutate: boolean;
}

/**
 * The five-pane job as one task.
 *
 * *"Telegram must not reach document X"* currently takes five of the eight
 * panes, in the right order, and nothing threads them: find the document, label
 * it, author a policy forbidding that label, link the policy to the surface,
 * then verify with Explain. Nothing tells you where you are in that sequence or
 * whether you finished it.
 *
 * Each step is inline rather than a link out, because a thread that hands you
 * off to another tab is the thing it was supposed to replace. It ends in a real
 * `explainAccess` call: in a fail-closed system a rule can save cleanly, link
 * cleanly, and still match nothing — so "saved" is not the answer the operator
 * came for.
 */
export function GuidedTaskPane({ vocabulary, canMutate }: GuidedTaskPaneProps) {
  const [task, setTask] = useState<TaskState>(EMPTY_TASK);
  const [search, setSearch] = useState('');

  const documents = useKernelQuery(['documents', 'task'], () =>
    ipc.listDocuments({ limit: 200 }),
  );
  const ingresses = useKernelQuery(['ingresses'], () => ipc.listIngresses());

  const statuses = stepStatuses(task);
  const outcome = taskOutcome(task);

  const update = (patch: Partial<TaskState>) => setTask((t) => ({ ...t, ...patch }));

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="type-page-title">
          Restrict a document on a surface
        </h2>
        <p className="type-page-description mt-1 max-w-[640px]">
          Five steps that depend on each other, in one place. It finishes with the kernel&rsquo;s
          own answer, not with a save confirmation.
        </p>
      </div>

      <StepStrip statuses={statuses} />

      <Step n={1} id="find" statuses={statuses} title="Find the document">
        <DocumentPicker
          documents={documents.data?.documents ?? []}
          loading={documents.isLoading}
          error={documents.error}
          search={search}
          onSearch={setSearch}
          selected={task.document}
          onSelect={(document) =>
            update({ document, label: null, labelApplied: false })
          }
          vocabulary={vocabulary}
        />
      </Step>

      {task.document && (
        <Step n={2} id="label" statuses={statuses} title="Label it">
          <LabelStep
            document={task.document}
            vocabulary={vocabulary}
            label={task.label}
            applied={task.labelApplied}
            canMutate={canMutate}
            onChoose={(label) => update({ label, labelApplied: false })}
            onApplied={(document) => update({ document, labelApplied: true })}
          />
        </Step>
      )}

      {task.labelApplied && task.label && (
        <Step n={3} id="author" statuses={statuses} title="Author the rule">
          <AuthorStep
            task={task}
            vocabulary={vocabulary}
            ingresses={ingresses.data ?? []}
            onChange={update}
          />
        </Step>
      )}

      {statuses.author === 'done' && (
        <Step n={4} id="link" statuses={statuses} title="Link it">
          <LinkStep task={task} canMutate={canMutate} onLinked={() => update({ linked: true })} />
        </Step>
      )}

      {task.linked && (
        <Step n={5} id="verify" statuses={statuses} title="Verify with Explain">
          <VerifyStep task={task} onDecision={(decision) => update({ decision })} />
        </Step>
      )}

      {/* The finish line. */}
      <div
        className={cn(
          'rounded-[var(--radius-lg)] p-3.5',
          outcome.state === 'incomplete'
            ? 'bg-[var(--bg-surface)] shadow-[var(--elevation-1)]'
            : 'tint-wash tint-ring',
        )}
        style={
          outcome.state === 'holds'
            ? ({ '--tint': 'var(--status-live)' } as React.CSSProperties)
            : outcome.state === 'does-not-hold'
              ? ({ '--tint': 'var(--status-err)' } as React.CSSProperties)
              : undefined
        }
      >
        <div
          className="type-label"
          style={{
            color:
              outcome.state === 'holds'
                ? 'var(--status-live)'
                : outcome.state === 'does-not-hold'
                  ? 'var(--status-err)'
                  : 'var(--fg-muted)',
          }}
        >
          {outcome.state === 'holds'
            ? 'The boundary holds'
            : outcome.state === 'does-not-hold'
              ? 'The boundary does not hold'
              : 'IN PROGRESS'}
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
          {outcome.message}
        </p>
        {task.decision && (
          <div className="mt-3">
            <DecisionCard decision={task.decision} />
          </div>
        )}
        {outcome.state !== 'incomplete' && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              setTask(EMPTY_TASK);
              setSearch('');
            }}
          >
            Start another
          </Button>
        )}
      </div>
    </div>
  );
}

function StepStrip({
  statuses,
}: {
  statuses: ReturnType<typeof stepStatuses>;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {TASK_STEPS.map((step, i) => {
        const status = statuses[step.id];
        const colour =
          status === 'done'
            ? 'var(--status-live)'
            : status === 'current'
              ? 'var(--accent-bg)'
              : 'var(--status-idle)';
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--fg-muted)]">→</span>}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11.5px]',
                status === 'current' && 'font-medium',
              )}
              style={{
                color: status === 'todo' ? 'var(--fg-muted)' : colour,
                background:
                  status === 'todo'
                    ? undefined
                    : `color-mix(in srgb, ${colour} 12%, transparent)`,
              }}
            >
              <span aria-hidden="true">{status === 'done' ? '✓' : i + 1}</span>
              {step.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Step({
  n,
  id,
  statuses,
  title,
  children,
}: {
  n: number;
  id: keyof ReturnType<typeof stepStatuses>;
  statuses: ReturnType<typeof stepStatuses>;
  title: string;
  children: React.ReactNode;
}) {
  const status = statuses[id];
  const blurb = TASK_STEPS.find((s) => s.id === id)?.blurb;

  return (
    <section
      className={cn(
        'flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]',
        status === 'todo' && 'opacity-60',
      )}
    >
      <div>
        <h3 className="text-[13.5px] font-medium">
          <span className="mr-2 font-mono text-[11px] text-[var(--fg-muted)]">{n}</span>
          {title}
          {status === 'done' && (
            <span className="type-status ml-2 text-[var(--status-live)]">
              Done
            </span>
          )}
        </h3>
        {blurb && (
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">{blurb}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function DocumentPicker({
  documents,
  loading,
  error,
  search,
  onSearch,
  selected,
  onSelect,
  vocabulary,
}: {
  documents: DocumentSummary[];
  loading: boolean;
  error: Error | null;
  search: string;
  onSearch: (v: string) => void;
  selected: DocumentSummary | null;
  onSelect: (d: DocumentSummary) => void;
  vocabulary: Vocabulary;
}) {
  const q = search.trim().toLowerCase();
  const shown = documents
    .filter((d) => !q || `${d.title} ${d.id}`.toLowerCase().includes(q))
    .slice(0, 8);

  if (error) {
    return (
      <p className="text-[12px] text-[var(--status-warn)]">
        This kernel does not serve the document listing, so the task cannot start here. Label
        the document from the Labels pane instead.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search documents…"
        aria-label="Search documents"
        className="w-[320px]"
      />
      {loading ? (
        <p className="text-[12px] text-[var(--fg-muted)]">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">No documents match.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={selected?.id === d.id}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md p-2 text-left text-[12px] transition-colors',
                  'hover:bg-[var(--list-row-bg-hover)]',
                  selected?.id === d.id && 'bg-[var(--list-row-bg-selected)]',
                )}
              >
                <span className="truncate text-[var(--fg-primary)]">{d.title || d.id}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {d.tags.length === 0 ? (
                    <span className="text-[11px] text-[var(--status-warn)]">
                      no label — no rule can reach it
                    </span>
                  ) : (
                    d.tags.map((t) => (
                      <TagChip key={t} tag={t} closed={vocabulary.closed.has(t)} />
                    ))
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LabelStep({
  document,
  vocabulary,
  label,
  applied,
  canMutate,
  onChoose,
  onApplied,
}: {
  document: DocumentSummary;
  vocabulary: Vocabulary;
  label: string | null;
  applied: boolean;
  canMutate: boolean;
  onChoose: (label: string) => void;
  onApplied: (document: DocumentSummary) => void;
}) {
  // Already carrying a label is a legitimate shortcut — the step is about the
  // document having one, not about this task being the thing that added it.
  const already = label != null && document.tags.includes(label);

  useEffect(() => {
    if (already && !applied) onApplied(document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [already]);

  const apply = useMutation(async (tag: string) => {
    const ok = await ipc.tagMemory(document.id, tag, true, 'guided task: restrict a document');
    if (!ok) throw new Error('the kernel refused the label');
    return ok;
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {vocabulary.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onChoose(tag)}
            aria-pressed={label === tag}
            className={cn(
              'rounded-sm px-1.5 py-1 transition-colors',
              label === tag
                ? 'shadow-[inset_0_0_0_1px_var(--accent-bg)]'
                : 'hover:bg-[var(--list-row-bg-hover)]',
            )}
          >
            <TagChip tag={tag} closed={vocabulary.closed.has(tag)} />
          </button>
        ))}
        {vocabulary.tags.length === 0 && (
          <span className="text-[12px] text-[var(--fg-muted)]">
            No vocabulary configured, so there is nothing safe to select.
          </span>
        )}
      </div>

      {apply.error && <ErrorState reason={apply.error} />}

      {label && !applied && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!canMutate || apply.isLoading}
            onClick={async () => {
              const ok = await apply.mutate(label);
              if (ok) onApplied({ ...document, tags: [...document.tags, label] });
            }}
          >
            {apply.isLoading ? 'Labelling…' : `Apply ${label}`}
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            Audited, with a reason naming this task.
          </span>
        </div>
      )}

      {applied && label && (
        <p className="text-[12px] text-[var(--status-live)]">
          {document.title || document.id} carries <span className="font-mono">{label}</span>.
        </p>
      )}
    </div>
  );
}

function AuthorStep({
  task,
  vocabulary,
  ingresses,
  onChange,
}: {
  task: TaskState;
  vocabulary: Vocabulary;
  ingresses: IngressSpec[];
  onChange: (patch: Partial<TaskState>) => void;
}) {
  const containers = [
    'organisation',
    ...Array.from(
      new Set(ingresses.map((i) => `surface:${i.surface_kind}:${i.surface_id}`)),
    ).sort(),
  ];

  return (
    <div className="flex flex-col gap-3">
      <RuleSentence
        container={task.container}
        term={task.term}
        tags={task.label ? [task.label] : []}
        vocabulary={vocabulary}
      />

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
          Through which container
          <select
            value={task.container}
            onChange={(e) => onChange({ container: e.target.value })}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--input-fg)]"
          >
            <option value="">choose…</option>
            {containers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
          What it may do
          <select
            value={task.term}
            onChange={(e) => onChange({ term: e.target.value as TermKind })}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-[12px] text-[var(--input-fg)]"
          >
            {(Object.keys(TERMS) as TermKind[]).map((k) => (
              <option key={k} value={k}>
                {TERMS[k].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
          Policy id
          <Input
            value={task.policyId}
            onChange={(e) => onChange({ policyId: e.target.value })}
            placeholder="telegram-no-customer-pii"
            aria-label="Policy id"
            className="w-[240px]"
          />
        </label>
      </div>

      {ingresses.length === 0 && (
        <p className="text-[11.5px] text-[var(--status-warn)]">
          No surfaces are registered, so only the organisation container is offered. A rule can
          only name a surface something actually stamps.
        </p>
      )}
    </div>
  );
}

function LinkStep({
  task,
  canMutate,
  onLinked,
}: {
  task: TaskState;
  canMutate: boolean;
  onLinked: () => void;
}) {
  const link = useMutation(async () => {
    const { policy, link: spec } = compileRule({
      policyId: task.policyId.trim(),
      policyName: task.policyId.trim(),
      container: task.container,
      term: task.term,
      tags: task.label ? [task.label] : [],
    });
    const outcome = await ipc.savePolicy(policy);
    if (!outcome.ok) throw new Error(outcome.error || 'the kernel refused this policy');
    // Links after the policy: a link to a policy that does not exist is refused,
    // and a policy linked to nothing applies to nobody — so a partial failure
    // here has to be visible rather than counted as success.
    await ipc.linkPolicy(spec);
    return outcome;
  });

  return (
    <div className="flex flex-col gap-2">
      {link.error && <ErrorState reason={link.error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!canMutate || link.isLoading || task.linked}
          onClick={async () => {
            const ok = await link.mutate();
            if (ok) onLinked();
          }}
        >
          {task.linked ? 'Linked' : link.isLoading ? 'Saving…' : 'Save and link'}
        </Button>
        <span className="text-[11.5px] text-[var(--fg-muted)]">
          Saves as <strong>report-only</strong> and links it at{' '}
          <span className="font-mono">{task.container}</span>. Enforcing is a separate act.
        </span>
      </div>
    </div>
  );
}

function VerifyStep({
  task,
  onDecision,
}: {
  task: TaskState;
  onDecision: (d: import('@/ipc/types').AccessDecision) => void;
}) {
  const verify = useMutation(async () => {
    const decision = await ipc.explainAccess({
      principal_id: task.container,
      resource_kind: 'memory',
      resource_id: task.document?.id ?? '',
      tags: task.label ? [task.label] : [],
      effects: ['read'],
    });
    onDecision(decision);
    return decision;
  });

  return (
    <div className="flex flex-col gap-2">
      {verify.error && <ErrorState reason={verify.error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void verify.mutate()} disabled={verify.isLoading}>
          {verify.isLoading ? 'Asking the kernel…' : 'Ask the kernel'}
        </Button>
        <span className="text-[11.5px] text-[var(--fg-muted)]">
          Would <span className="font-mono">{task.container}</span> be able to read a document
          labelled <span className="font-mono">{task.label}</span>?
        </span>
      </div>
    </div>
  );
}
