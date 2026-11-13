import { Button } from '@/design-system/components/ui/button';
import { ReasonField, useReasonGate } from '@/design-system/components/cambrian/reason-field';
import { ErrorState } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { OntologyChangeLine, OntologyDraftSpec, OntologyDraftView } from '@/ipc/types';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { formatUnixMs } from '@/lib/useCommandGate';

/** The capability the substrate plugin advertises; the draft read lives on its plane. */
export const ONTOLOGY_DRAFT_CAPABILITY = 'substrate-query';

const COPY = {
  dialog: 'Ontology change draft',
  heading: 'Read the full draft before you decide',
  close: 'Close',
  loading: 'Reading the draft…',
  loadFailed: 'The draft could not be read.',
  loadFailedWhat: 'Nothing was decided. Close this and try again; the approval stays in the Inbox.',
  proposer: 'Drafted by',
  namespace: 'Namespace',
  reason: 'Why',
  drafted: 'Drafted',
  base: 'Classified against version',
  current: 'Declarations now at version',
  moved: 'The declarations moved since this was drafted.',
  classification: 'Classification as drafted',
  specs: 'Every spec, current vs drafted',
  newName: 'new — nothing is declared under this name yet',
  currentLabel: 'Declared now',
  draftedLabel: 'As drafted',
  dryRun: 'Dry run against the current declarations',
  dryRunClean: 'Approving now would apply it as drafted.',
  dryRunNone: 'No dry run: the draft is no longer pending.',
  raw: 'Show the whole change as JSON',
  state: 'State',
  approve: 'Approve and apply',
  reject: 'Reject',
};

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function ChangeList({ lines, label }: { lines: OntologyChangeLine[]; label: string }) {
  if (lines.length === 0) return <p className="text-[12.5px] text-[var(--fg-secondary)]">No differences.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {lines.map((c) => (
        <li key={`${c.class}:${c.subject}`} className="flex flex-wrap gap-2 text-[12.5px]">
          <span className="font-mono uppercase tracking-[0.06em] text-[var(--fg-muted)]">{c.class}</span>
          <span className="font-mono text-[var(--fg-primary)]">{c.subject}</span>
          {c.detail && <span className="text-[var(--fg-secondary)]">{c.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function SpecDiff({ spec }: { spec: OntologyDraftSpec }) {
  const title = `${spec.type} ${spec.name}`;
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[12.5px] text-[var(--fg-primary)]">
        {title}
        {!spec.current_json && <span className="ml-2 text-[var(--fg-muted)]">({COPY.newName})</span>}
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {spec.current_json && (
          <figure className="m-0 flex flex-col gap-1">
            <figcaption className="text-[11px] text-[var(--fg-muted)]">{COPY.currentLabel}</figcaption>
            <pre
              aria-label={`${title}: ${COPY.currentLabel}`}
              className="overflow-x-auto rounded-md bg-[var(--bg-surface)] p-2.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-secondary)]"
            >
              {pretty(spec.current_json)}
            </pre>
          </figure>
        )}
        <figure className="m-0 flex flex-col gap-1">
          <figcaption className="text-[11px] text-[var(--fg-muted)]">{COPY.draftedLabel}</figcaption>
          <pre
            aria-label={`${title}: ${COPY.draftedLabel}`}
            className="overflow-x-auto rounded-md bg-[var(--bg-surface)] p-2.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-primary)]"
          >
            {pretty(spec.new_json)}
          </pre>
        </figure>
      </div>
    </section>
  );
}

function DraftBody({ d }: { d: OntologyDraftView }) {
  const moved = d.current_version !== d.base_version;
  const facts: { label: string; value: string }[] = [
    { label: COPY.proposer, value: d.proposer },
    { label: COPY.namespace, value: d.namespace },
    { label: COPY.reason, value: d.reason || '—' },
    { label: COPY.drafted, value: formatUnixMs(d.created_at_unix_ms) },
    { label: COPY.base, value: `v${d.base_version}` },
    { label: COPY.current, value: `v${d.current_version}` },
    { label: COPY.state, value: d.detail ? `${d.state} — ${d.detail}` : d.state },
  ];
  return (
    <>
      <dl className="flex flex-col rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3">
        {facts.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-[12.5px] text-[var(--fg-secondary)]">{f.label}</dt>
            <dd className="text-right font-mono text-[12.5px] text-[var(--fg-primary)]">{f.value}</dd>
          </div>
        ))}
      </dl>
      {moved && (
        <p role="note" className="text-[12.5px] text-[var(--status-warn)]">
          {COPY.moved}
        </p>
      )}

      <section className="flex flex-col gap-1.5">
        <h2 className="text-[13px] text-[var(--fg-primary)]">
          {COPY.classification}: <span className="font-mono">{d.class}</span>
        </h2>
        <ChangeList lines={d.changes} label={COPY.classification} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] text-[var(--fg-primary)]">{COPY.specs}</h2>
        {d.specs.map((s) => (
          <SpecDiff key={`${s.type}:${s.name}`} spec={s} />
        ))}
      </section>

      <section className="flex flex-col gap-1.5" aria-label={COPY.dryRun}>
        <h2 className="text-[13px] text-[var(--fg-primary)]">{COPY.dryRun}</h2>
        {!d.dry_run_ran ? (
          <p className="text-[12.5px] text-[var(--fg-secondary)]">{COPY.dryRunNone}</p>
        ) : d.dry_run_refusal ? (
          <p role="alert" className="text-[12.5px] text-[var(--status-err)]">
            {d.dry_run_refusal}
          </p>
        ) : (
          <>
            <p className="text-[12.5px] text-[var(--fg-secondary)]">
              {COPY.dryRunClean} <span className="font-mono">{d.dry_run_class}</span>
            </p>
            <ChangeList lines={d.dry_run_changes} label={COPY.dryRun} />
          </>
        )}
      </section>

      <details className="text-[12px] text-[var(--fg-muted)]">
        <summary className="cursor-pointer select-none">{COPY.raw}</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--bg-surface)] p-2.5 font-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--fg-secondary)]">
          {pretty(d.change_json)}
        </pre>
      </details>
    </>
  );
}

export interface OntologyDraftPanelProps {
  /** The approval's object: the draft id. */
  draftId: string;
  /** The approval id, for the reason field and the decision. */
  interventionId: string;
  onApprove: (reason: string) => void;
  onReject: (reason: string) => void;
  onClose: () => void;
  disabledReason?: string;
  busy?: boolean;
}

/**
 * The approver's full view of an agent-drafted ontology change (ADR-0149 D2;
 * T-20261113-approvers-of-an-ontology-change-see-only-a-200), in the
 * FullScreenApproval pattern: the whole draft first, then the decision. The
 * Inbox row carries only the kernel's ≤200-character preview; this reads the
 * draft by the approval's object over the substrate plane (Operator-only on
 * the kernel). Opened only when the handshake advertises the substrate plane
 * and the person is an Operator (InboxConsole decides).
 */
export function OntologyDraftPanel({
  draftId,
  interventionId,
  onApprove,
  onReject,
  onClose,
  disabledReason,
  busy,
}: OntologyDraftPanelProps) {
  const gate = useReasonGate();
  // A refusal (NotFound, PermissionDenied) is an answer, not a blip: no retry.
  const draft = useKernelQuery(['ontology-draft', draftId], () => ipc.getOntologyDraft(draftId), { retry: false });
  const blocked = Boolean(disabledReason) || draft.data?.state !== 'pending';
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--bg-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label={COPY.dialog}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="type-status text-[var(--fg-secondary)]">{COPY.heading}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          {COPY.close}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-5 px-4 pb-6">
        {draft.isLoading && <p className="text-[13px] text-[var(--fg-secondary)]">{COPY.loading}</p>}
        {draft.error && (
          <ErrorState reason={`${COPY.loadFailed} ${draft.error.message}`} whatToDo={COPY.loadFailedWhat} />
        )}
        {draft.data && <DraftBody d={draft.data} />}

        {draft.data && (
          <>
            <ReasonField
              gate={gate}
              id={`ontology-draft-reason-${interventionId}`}
              label="Reason"
              disabled={blocked || busy}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => onApprove(gate.reason.trim())}
                disabled={!gate.satisfied || blocked || busy}
                title={disabledReason}
              >
                {COPY.approve}
              </Button>
              <Button
                variant="secondary"
                onClick={() => onReject(gate.reason.trim())}
                disabled={!gate.satisfied || blocked || busy}
                title={disabledReason}
              >
                {COPY.reject}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
