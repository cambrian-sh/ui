// The ontology, governed (ADR-0149 D2; ENG-1395).
//
// Three things an operator needs to govern the model layer, all read from and
// written to the kernel — nothing about declarations is decided here:
//   - the CURRENT declarations, shown as data (kinds with their typed
//     properties, relations with their endpoints);
//   - a change, dry-run first: the kernel classifies it additive, tightening
//     or breaking; a breaking change is refused by the kernel and the Apply
//     button says so before anyone tries; an apply carries a mandatory reason
//     (audited before it applies) and a command id minted in the Rust core;
//   - the violations report: existing rows the current declarations would
//     refuse if written now (tightened rules apply to new writes only).

import { useState } from 'react';
import { ipc } from '@/ipc';
import type { OntologyApplyOutcome } from '@/ipc/types';
import { Button, ErrorState } from '@/design-system/components';
import { ReasonField, useReasonGate } from '@/design-system/components/cambrian/reason-field';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useCommandGate } from '@/lib/useCommandGate';

/** A property as the kernel declares it (domain.ValueSpec, JSON shape). */
export interface DeclaredProperty {
  type?: string;
  enum?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  indexed?: boolean;
}

/** A kind as the kernel declares it (domain.KindSpec, JSON shape). */
export interface DeclaredKind {
  kind: string;
  id_prefix?: string;
  table?: boolean;
  open?: boolean;
  predicates?: Record<string, DeclaredProperty>;
}

export interface DeclaredRelation {
  name: string;
  family?: string;
  from_kind?: string;
  to_kind?: string;
  cardinality?: string;
  required?: boolean;
}

export interface Declarations {
  kinds: DeclaredKind[];
  relations: DeclaredRelation[];
}

/** Parses GetOntology's declarations_json; an unreadable document is an error, not "nothing declared". */
export function parseDeclarations(json: string): Declarations {
  const raw = JSON.parse(json || '{}') as Partial<Declarations>;
  return {
    kinds: [...(raw.kinds ?? [])].sort((a, b) => a.kind.localeCompare(b.kind)),
    relations: [...(raw.relations ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function propertyLine(name: string, p: DeclaredProperty): string {
  const parts = [p.type ?? 'any'];
  if (p.enum?.length) parts.push(p.enum.join('|'));
  if (p.min !== undefined || p.max !== undefined) parts.push(`${p.min ?? '…'}..${p.max ?? '…'}`);
  if (p.required) parts.push('required');
  if (p.indexed) parts.push('indexed');
  return `${name}: ${parts.join(' · ')}`;
}

export function OntologyPane() {
  const ontology = useKernelQuery(['knowledge', 'ontology'], () => ipc.getOntology(), { staleTime: 30_000 });
  const violations = useKernelQuery(['knowledge', 'ontology-violations'], () => ipc.listOntologyViolations(), {
    staleTime: 30_000,
  });

  if (ontology.isError) {
    return (
      <div className="px-[var(--page-gutter)] py-6">
        <ErrorState
          reason={`The ontology could not be read: ${ontology.error?.message ?? 'the substrate lane did not answer'}.`}
          whatToDo="A read failure, not an empty model. Nothing below would be trustworthy, so nothing is shown."
        />
      </div>
    );
  }
  if (!ontology.data) return null;

  let decls: Declarations;
  try {
    decls = parseDeclarations(ontology.data.declarations_json);
  } catch (e) {
    return (
      <div className="px-[var(--page-gutter)] py-6">
        <ErrorState
          reason={`The kernel's declarations could not be parsed: ${(e as Error).message}.`}
          whatToDo="Report this; the console will not guess at the model."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-[var(--page-gutter)] py-6">
      <section aria-label="Declarations" className="flex flex-col gap-3">
        <h3 className="type-section-title text-[var(--fg-primary)]">
          Declarations <span className="text-[var(--fg-muted)]">· version {ontology.data.version}</span>
        </h3>
        {decls.kinds.length === 0 ? (
          <p className="text-[13px] text-[var(--fg-muted)]">No kinds are declared.</p>
        ) : (
          <table className="w-full text-[13px]" aria-label="Declared kinds">
            <thead>
              <tr className="text-left text-[11.5px] text-[var(--fg-muted)]">
                <th className="py-1 pr-3 font-medium">Kind</th>
                <th className="py-1 pr-3 font-medium">Objects</th>
                <th className="py-1 font-medium">Properties</th>
              </tr>
            </thead>
            <tbody>
              {decls.kinds.map((k) => (
                <tr key={k.kind} className="border-t border-[var(--border-subtle)] align-top">
                  <td className="py-1.5 pr-3 font-mono text-[var(--fg-primary)]">{k.kind}</td>
                  <td className="py-1.5 pr-3 text-[var(--fg-secondary)]">
                    {k.table ? `table · ${k.id_prefix || k.kind}/…` : '—'}
                    {k.open ? ' · open' : ''}
                  </td>
                  <td className="py-1.5 font-mono text-[12px] text-[var(--fg-secondary)]">
                    {Object.entries(k.predicates ?? {})
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, p]) => (
                        <div key={name}>{propertyLine(name, p)}</div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {decls.relations.length > 0 && (
          <table className="w-full text-[13px]" aria-label="Declared relations">
            <thead>
              <tr className="text-left text-[11.5px] text-[var(--fg-muted)]">
                <th className="py-1 pr-3 font-medium">Relation</th>
                <th className="py-1 font-medium">Shape</th>
              </tr>
            </thead>
            <tbody>
              {decls.relations.map((r) => (
                <tr key={r.name} className="border-t border-[var(--border-subtle)]">
                  <td className="py-1.5 pr-3 font-mono text-[var(--fg-primary)]">{r.name}</td>
                  <td className="py-1.5 text-[var(--fg-secondary)]">
                    {(r.from_kind || 'any') + ' → ' + (r.to_kind || 'any')}
                    {r.family ? ` · ${r.family}` : ''}
                    {r.cardinality ? ` · ${r.cardinality}` : ''}
                    {r.required ? ' · required' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ChangeForm
        onApplied={() => {
          void ontology.refetch();
          void violations.refetch();
        }}
      />

      <section aria-label="Violations" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">Violations</h3>
        <p className="text-[12px] text-[var(--fg-muted)]">
          Existing rows the current declarations would refuse if they were written now. Tightened rules apply to new
          writes only; these are reported, never rejected after the fact.
        </p>
        {violations.isError ? (
          <ErrorState
            reason={`Violations could not be read: ${violations.error?.message ?? 'the substrate lane did not answer'}.`}
            whatToDo="Do not read this as a clean model: a failed read and no violations look alike on an empty page."
          />
        ) : !violations.data ? null : violations.data.violations.length === 0 ? (
          <p className="text-[13px] text-[var(--fg-secondary)]">No violations at version {violations.data.version}.</p>
        ) : (
          <>
            <table className="w-full text-[13px]" aria-label="Violation rows">
              <thead>
                <tr className="text-left text-[11.5px] text-[var(--fg-muted)]">
                  <th className="py-1 pr-3 font-medium">Rule</th>
                  <th className="py-1 pr-3 font-medium">Subject</th>
                  <th className="py-1 pr-3 font-medium">Row</th>
                  <th className="py-1 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {violations.data.violations.map((v, i) => (
                  <tr key={`${v.rule}-${v.reference}-${i}`} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 pr-3 font-mono">{v.rule}</td>
                    <td className="py-1.5 pr-3">{v.subject}</td>
                    <td className="py-1.5 pr-3 font-mono text-[12px]">{v.reference}</td>
                    <td className="py-1.5 text-[var(--fg-secondary)]">{v.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {violations.data.truncated && (
              <p className="text-[12px] text-[var(--status-warn)]">More violations exist than are shown.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const CHANGE_PLACEHOLDER = '{"kinds":[{"kind":"order","table":true,"predicates":{"status":{"type":"text"}}}]}';

function ChangeForm({ onApplied }: { onApplied: () => void }) {
  const [change, setChange] = useState('');
  const [dry, setDry] = useState<OntologyApplyOutcome | null>(null);
  const [applied, setApplied] = useState<OntologyApplyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = useReasonGate();
  const blocked = useCommandGate('change the ontology');

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const out = await ipc.applyOntologyChange(change, dryRun ? '' : gate.reason, dryRun);
      if (dryRun) {
        setDry(out);
        setApplied(null);
      } else {
        setApplied(out);
        setDry(null);
        gate.reset();
        onApplied();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Apply only what a dry run of THIS text classified, and never a breaking
  // change: the kernel refuses it anyway, and saying so first is honest.
  const applyBlocked =
    blocked ??
    (dry === null
      ? 'Run a dry run first: the kernel classifies the change before anything is applied.'
      : dry.class === 'breaking'
        ? 'A breaking change is refused by the kernel. Change existing data through a new kind or property instead.'
        : !gate.satisfied
          ? 'A reason is required.'
          : undefined);

  return (
    <section aria-label="Change the ontology" className="flex flex-col gap-2.5">
      <h3 className="type-section-title text-[var(--fg-primary)]">Change</h3>
      <p className="text-[12px] text-[var(--fg-muted)]">
        The kinds and relations to add, or to replace by name, in the declarations' JSON shape.
      </p>
      <label htmlFor="ontology-change" className="sr-only">
        Change (JSON)
      </label>
      <textarea
        id="ontology-change"
        value={change}
        onChange={(e) => {
          setChange(e.target.value);
          setDry(null);
        }}
        placeholder={CHANGE_PLACEHOLDER}
        rows={6}
        className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1.5 font-mono text-[12.5px] text-[var(--input-fg)]"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy || change.trim() === ''} onClick={() => void run(true)}>
          Dry run
        </Button>
      </div>
      {dry && (
        <div aria-label="Dry run result" className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[13px]">
          <p>
            Classified <span className="font-medium">{dry.class || 'no change'}</span>; nothing applied.
          </p>
          <ul className="mt-1 list-disc pl-5 text-[12.5px] text-[var(--fg-secondary)]">
            {dry.changes.map((c, i) => (
              <li key={i}>
                {c.class} — {c.subject}
                {c.detail ? ` (${c.detail})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ReasonField
        gate={gate}
        id="ontology-change-reason"
        label="Why apply this change"
        note="A reason is required — it lands in the audit log next to your name before the change applies."
        disabled={busy}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={busy || applyBlocked !== undefined} onClick={() => void run(false)}>
          Apply
        </Button>
        {applyBlocked && <span className="text-[12px] text-[var(--fg-muted)]">{applyBlocked}</span>}
      </div>
      {applied && (
        <p role="status" className="text-[13px] text-[var(--fg-secondary)]">
          {applied.deduped
            ? 'Already applied under this command; nothing changed again.'
            : applied.applied
              ? `Applied (${applied.class}); the declarations are now at version ${applied.version}.`
              : 'Not applied.'}
        </p>
      )}
      {error && <ErrorState reason={`The change was not applied: ${error}.`} whatToDo="Nothing changed. Read the reason, fix the change, dry-run it again." />}
    </section>
  );
}
