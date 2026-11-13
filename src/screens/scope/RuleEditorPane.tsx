import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import type { DocumentSummary, IngressSpec } from '@/ipc/types';
import { RuleSentence, TERMS, TagChip, type TermKind } from './RuleSentence';
import { TagPicker } from './TagPicker';
import { compileRule, computeBlastRadius, type RuleDraft } from './compilePolicy';
import type { Vocabulary } from './useVocabulary';

/** Where a rule can be linked. Surfaces come from the ingress registry. */
function containerOptions(ingresses: readonly IngressSpec[]): string[] {
  const surfaces = ingresses.map((i) => `surface:${i.surface_kind}:${i.surface_id}`);
  return ['organisation', ...Array.from(new Set(surfaces)).sort()];
}

export interface RuleEditorPaneProps {
  vocabulary: Vocabulary;
  canMutate: boolean;
  disabledReason?: string;
}

/**
 * Author a `ScopeRule` by filling in a sentence.
 *
 * The problem this solves: *"Telegram must not reach document X"* currently
 * takes five panes in the right order, and the model is never read back in the
 * operator's language — the intent lives in the author's head while the UI
 * shows four tag arrays, an effect list, a mode and a link.
 *
 * Three rules this pane keeps:
 *  - **Every blank is a vocabulary selection.** A typo produces a boundary that
 *    silently matches nothing, which is the exact failure the subsystem exists
 *    to prevent.
 *  - **Saving never enforces.** A saved rule lands `report_only`; enforcing is a
 *    separate deliberate act.
 *  - **The algebra is never hidden.** "Show exactly what this compiles to"
 *    reveals the real `PolicySpec` + `LinkSpec` that will be sent.
 */
export function RuleEditorPane({
  vocabulary,
  canMutate,
  disabledReason,
}: RuleEditorPaneProps) {
  const [draft, setDraft] = useState<RuleDraft>({
    policyId: '',
    policyName: '',
    container: '',
    term: 'forbidden',
    tags: [],
  });
  const [ingresses, setIngresses] = useState<IngressSpec[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ipc.listIngresses().then(setIngresses).catch(() => setIngresses([]));
    // The radius is computed from the console's own listing rather than guessed.
    ipc
      .listDocuments({ limit: 500 })
      .then((page) => setDocuments(page.documents))
      .catch(() => setDocuments([]));
  }, []);

  const compiled = useMemo(() => compileRule(draft), [draft]);
  const radius = useMemo(
    () => computeBlastRadius(documents, draft, vocabulary.closed),
    [documents, draft, vocabulary.closed],
  );

  const save = useMutation(async () => {
    const outcome = await ipc.savePolicy(compiled.policy);
    if (!outcome.ok) throw new Error(outcome.error);
    await ipc.linkPolicy(compiled.link);
    return outcome;
  });

  const complete =
    draft.policyId.trim() !== '' && draft.container !== '' && draft.tags.length > 0;

  // Chrome state. "Saved" and "working" are different claims in a fail-closed
  // system, and the operator came for the second one.
  const chrome = !saved
    ? { label: 'unsaved — affects nobody yet', tone: 'var(--status-idle)' }
    : { label: 'saved · report_only — recorded, not enforced', tone: 'var(--status-warn)' };

  const closedInRule = draft.tags.filter((t) => vocabulary.closed.has(t));
  // Forbidding a closed label at a container that already denies it is a no-op
  // unless a grant above widens. Stated, not silently allowed.
  const redundant = draft.term === 'forbidden' && closedInRule.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span
            className="type-label rounded-sm px-1.5 py-0.5"
            style={{ color: chrome.tone }}
          >
            {chrome.label}
          </span>
        </div>

        <RuleSentence
          container={draft.container}
          term={draft.term}
          tags={draft.tags}
          vocabulary={vocabulary}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled label="Through which container">
            <ToggleGroup
              type="single"
              value={draft.container}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, container: v }))}
              aria-label="Container"
              className="flex-wrap"
            >
              {containerOptions(ingresses).map((c) => (
                <ToggleGroupItem key={c} value={c} className="font-mono text-[11px]">
                  {c}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {ingresses.length === 0 && (
              <p className="text-[11.5px] text-[var(--fg-muted)]">
                No surfaces are registered, so only the organisation container is offered.
                A surface has to register before a rule can name it.
              </p>
            )}
          </Labelled>

          <Labelled label="What it may do">
            <ToggleGroup
              type="single"
              value={draft.term}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, term: v as TermKind }))}
              aria-label="Term"
              className="flex-wrap"
            >
              {(Object.keys(TERMS) as TermKind[]).map((kind) => (
                <ToggleGroupItem
                  key={kind}
                  value={kind}
                  className={cn(TERMS[kind].widens && 'text-[var(--status-warn)]')}
                >
                  {TERMS[kind].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Labelled>
        </div>

        <TagPicker
          label="Labels"
          hint="Rules are written about labels. A document with none is unreachable by any rule."
          selected={draft.tags}
          onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
          vocabulary={vocabulary}
          tone={TERMS[draft.term].widens ? 'grant' : 'deny'}
          closedOnly={draft.term === 'granted'}
        />

        {redundant && (
          <p className="text-[12px] leading-[1.5] text-[var(--fg-muted)]">
            {closedInRule.join(', ')} {closedInRule.length === 1 ? 'is' : 'are'} already
            deny-by-default, so forbidding {closedInRule.length === 1 ? 'it' : 'them'} here is a
            no-op — <em>unless</em> a grant above this container widens access to{' '}
            {closedInRule.length === 1 ? 'it' : 'them'}, in which case this rule takes it back.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Policy id">
            <Input
              value={draft.policyId}
              onChange={(e) => setDraft((d) => ({ ...d, policyId: e.target.value }))}
              placeholder="telegram-no-customer-pii"
              aria-label="Policy id"
            />
          </Labelled>
          <Labelled label="Policy name">
            <Input
              value={draft.policyName}
              onChange={(e) => setDraft((d) => ({ ...d, policyName: e.target.value }))}
              placeholder="Telegram must not read customer PII"
              aria-label="Policy name"
            />
          </Labelled>
        </div>

        {/* Default collapsed. An operator who wants the tuple gets the tuple. */}
        <details className="rounded-md bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]">
          <summary className="cursor-pointer select-none text-[12.5px] text-[var(--fg-secondary)]">
            Show exactly what this compiles to
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--bg-canvas)] p-2.5 font-mono text-[10.5px] leading-[1.6] text-[var(--fg-secondary)]">
            {JSON.stringify(compiled, null, 2)}
          </pre>
        </details>

        {save.error && (
          <ErrorState
            reason={save.error}
            whatToDo="Nothing was saved. The rule is unchanged and still affects nobody."
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={async () => {
              const ok = await save.mutate();
              if (ok) setSaved(true);
            }}
            disabled={!complete || !canMutate || save.isLoading}
          >
            {save.isLoading ? 'Saving…' : 'Save as report-only'}
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            {disabledReason ??
              'Saving records the rule and enforces nothing. Enforcing is a separate act.'}
          </span>
        </div>
      </div>

      <BlastRadiusPanel radius={radius} draft={draft} vocabulary={vocabulary} />
    </div>
  );
}

function BlastRadiusPanel({
  radius,
  draft,
  vocabulary,
}: {
  radius: ReturnType<typeof computeBlastRadius>;
  draft: RuleDraft;
  vocabulary: Vocabulary;
}) {
  return (
    <aside className="flex h-fit flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <h3 className="type-label text-[var(--fg-muted)]">
        Blast radius
      </h3>

      {draft.tags.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">
          Choose a label to see which documents this reaches.
        </p>
      ) : radius.unsatisfiable ? (
        <div
          className="flex flex-col gap-1.5 rounded-md p-2.5 tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="type-status text-[var(--status-warn)]">
            No radius to measure
          </span>
          <p className="text-[12px] leading-[1.5] text-[var(--fg-primary)]">
            {radius.unsatisfiableReason}
          </p>
          <p className="text-[11.5px] text-[var(--fg-muted)]">
            This is not "no effect" — it is "no rule". A count of zero here would read as the
            first when it means the second.
          </p>
        </div>
      ) : (
        <>
          <div>
            <div className="font-mono text-[22px] font-medium leading-[1.2] tracking-[-0.02em]">
              {radius.affected.length}
            </div>
            <p className="text-[11.5px] text-[var(--fg-muted)]">
              of {radius.considered} documents the console can see
              {draft.term === 'required'
                ? ' stop being reachable'
                : draft.term === 'granted'
                  ? ' become reachable'
                  : ' stop being readable through this container'}
            </p>
          </div>

          {/* NAMED, not counted. A number an operator cannot check is not a
              radius, it is a reassurance. */}
          {radius.affected.length > 0 && (
            <ul className="flex flex-col gap-1">
              {radius.affected.slice(0, 8).map((doc) => (
                <li key={doc.id} className="flex flex-col gap-0.5">
                  <span className="truncate text-[12px] text-[var(--fg-primary)]">
                    {doc.title || doc.id}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {doc.tags.map((t) => (
                      <TagChip key={t} tag={t} closed={vocabulary.closed.has(t)} />
                    ))}
                  </span>
                </li>
              ))}
              {radius.affected.length > 8 && (
                <li className="text-[11.5px] text-[var(--fg-muted)]">
                  and {radius.affected.length - 8} more
                </li>
              )}
            </ul>
          )}

          {radius.considered === 0 && (
            <p className="text-[11.5px] text-[var(--status-warn)]">
              The console has no document listing, so this radius is unknown rather than zero.
            </p>
          )}
        </>
      )}
    </aside>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-[var(--fg-secondary)]">{label}</span>
      {children}
    </div>
  );
}
