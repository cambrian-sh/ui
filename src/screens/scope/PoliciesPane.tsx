import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { GroupSpec, IngressSpec, LinkSpec, PolicySpec } from '@/ipc/types';
import { CONTAINER_KINDS, TOOL_EFFECTS } from '@/ipc/types';
import {
  Button,
  EmptyState,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { cn } from '@/design-system/lib/utils';
import { TagPicker } from './TagPicker';
import type { Vocabulary } from './useVocabulary';

const BLANK: PolicySpec = {
  id: '',
  name: '',
  version: 0,
  rule: { required_tags: [], any_of_tags: [], forbidden_tags: [], granted_tags: [] },
  effects: { allow: [], deny: [] },
  mode: 'enforced',
  expires_at_unix_ms: 0,
  granted_by: '',
  updated_at_unix_ms: 0,
};

interface PoliciesPaneProps {
  vocabulary: Vocabulary;
  groups: GroupSpec[];
  principals: string[];
  onChanged: () => void;
  /** Registered ingresses, so their surfaces are offerable as link targets. */
  ingresses: IngressSpec[];
}

/**
 * Policy objects and their links.
 *
 * The structural idea this screen has to carry: **policy is authored once and
 * LINKED to a container, never assigned to a person.** Administering 500
 * individuals is not a product; administering 12 groups is. So the editor is one
 * form, and attaching it is a separate, repeatable act.
 */
/**
 * Surfaces the kernel establishes itself, independent of any registration
 * (internal/authz/surface.go). Offered as link targets because a surface link
 * typed by hand is the same defect as a free-text tag field: `operatr`, or
 * `console` instead of `operator`, produces a link that silently never applies.
 *
 * A bare KIND matches every instance of that kind — `operator` matches
 * `operator:console` — which is the form an operator granting themselves wants,
 * and is not guessable from an empty text box.
 */
export const WELL_KNOWN_SURFACES: { target: string; hint: string }[] = [
  { target: 'operator', hint: 'the console and CLI — a human at the operator plane' },
  { target: 'agent', hint: 'the agent-facing gRPC plane' },
  { target: 'chat:*', hint: 'every chat ingress' },
  { target: 'reactive', hint: 'unattended reactive and daemon execution' },
  { target: 'internal', hint: 'in-process kernel call paths' },
];

export function PoliciesPane({
  vocabulary,
  groups,
  principals,
  ingresses,
  onChanged,
}: PoliciesPaneProps) {
  const [policies, setPolicies] = useState<PolicySpec[]>([]);
  const [links, setLinks] = useState<LinkSpec[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PolicySpec>(BLANK);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([ipc.listPolicies(), ipc.listLinks()]);
      setPolicies(p);
      setLinks(l);
      setLoadError(null);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = (p: PolicySpec) => {
    setSelectedId(p.id);
    setDraft(p);
    setSaveError('');
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(BLANK);
    setSaveError('');
  };

  const save = async () => {
    setBusy(true);
    setSaveError('');
    try {
      const outcome = await ipc.savePolicy(draft);
      if (!outcome.ok) {
        // An unsatisfiable rule or a coined tag is an AUTHORING outcome, not a
        // transport failure — it belongs next to the form, not in a toast.
        setSaveError(outcome.error);
        return;
      }
      await reload();
      onChanged();
      setSelectedId(draft.id);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await ipc.deletePolicy(id);
      await reload();
      onChanged();
      if (selectedId === id) startNew();
    } finally {
      setBusy(false);
    }
  };

  const linksFor = (policyId: string) => links.filter((l) => l.policy_id === policyId);

  if (loadError) {
    return (
      <div className="p-4">
        <ErrorState
          reason={`Could not load policies: ${loadError}`}
          whatToDo="The access-policy plugin may not be installed on this kernel. Check the connection, then reload."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-[var(--border-subtle)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--fg-primary)]">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
          </span>
          <Button variant="secondary" size="sm" onClick={startNew}>
            New
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {policies.length === 0 ? (
            <p className="p-4 text-xs text-[var(--fg-muted)]">
              No policies yet. A policy is a named bundle of rules; linking it to a container is
              what makes it apply.
            </p>
          ) : (
            <ul role="list" aria-label="Policies" className="divide-y divide-[var(--border-subtle)]">
              {policies.map((p) => {
                const n = linksFor(p.id).length;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => select(p)}
                      aria-pressed={selectedId === p.id}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors hover:bg-[var(--list-row-bg-hover)]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
                        selectedId === p.id && 'bg-[var(--list-row-bg-selected)]',
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm text-[var(--fg-primary)]">
                          {p.name || p.id}
                        </span>
                        {p.mode === 'report_only' && (
                          <span className="shrink-0 text-xs text-[var(--color-status-warn)]">
                            report-only
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--fg-muted)]">
                        v{p.version} · {n === 0 ? 'not linked' : `${n} link${n === 1 ? '' : 's'}`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pol-id" className="text-xs font-medium text-[var(--fg-primary)]">
                Id
              </label>
              <Input
                id="pol-id"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="support-boundary"
                disabled={selectedId !== null}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label htmlFor="pol-name" className="text-xs font-medium text-[var(--fg-primary)]">
                Name
              </label>
              <Input
                id="pol-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Support boundary"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-[var(--fg-primary)]">Mode</span>
            <p className="mb-1.5 text-xs text-[var(--fg-muted)]">
              Report-only evaluates the policy on every decision and records what it would have
              blocked, without blocking anything. Watch the blast radius, then enforce.
            </p>
            <Select value={draft.mode} onValueChange={(m) => setDraft({ ...draft, mode: m })}>
              <SelectTrigger className="h-8 w-52 text-sm" aria-label="Policy mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enforced">enforced</SelectItem>
                <SelectItem value="report_only">report-only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
            <TagPicker
              label="Required"
              hint="Every one of these must be present. Adding a required tag narrows access."
              selected={draft.rule.required_tags}
              onChange={(t) => setDraft({ ...draft, rule: { ...draft.rule, required_tags: t } })}
              vocabulary={vocabulary}
            />
            <TagPicker
              label="Any of"
              hint="At least one must be present. Each policy's any-of set is a separate clause, and all clauses must hold."
              selected={draft.rule.any_of_tags}
              onChange={(t) => setDraft({ ...draft, rule: { ...draft.rule, any_of_tags: t } })}
              vocabulary={vocabulary}
            />
            <TagPicker
              label="Forbidden"
              hint="Any one of these disqualifies the resource. A deny can never be removed by another policy."
              selected={draft.rule.forbidden_tags}
              onChange={(t) => setDraft({ ...draft, rule: { ...draft.rule, forbidden_tags: t } })}
              vocabulary={vocabulary}
              tone="deny"
            />
            {/* The grant is the only term that ADDS access, so it is separated from
                the three narrowing terms rather than sitting among them — a reader
                skimming this form should not have to remember which is which. */}
            {vocabulary.closed.size > 0 && (
              <div className="border-t border-dashed border-[var(--border-subtle)] pt-4">
                <TagPicker
                  label="Grants"
                  hint="Reopens a closed tag for whoever this policy is linked to. The only term here that adds access — it can never override a Forbidden tag, and closed tags are the only thing it may name."
                  selected={draft.rule.granted_tags}
                  onChange={(t) => setDraft({ ...draft, rule: { ...draft.rule, granted_tags: t } })}
                  vocabulary={vocabulary}
                  tone="grant"
                  closedOnly
                />
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
            <div>
              <span className="text-xs font-medium text-[var(--fg-primary)]">Effects denied</span>
              <p className="mb-2 text-xs text-[var(--fg-muted)]">
                A tag says what a resource is about; an effect says what the invocation does to
                it. Denying <code>egress</code> here is how “no tool may transmit outside this
                network” is stated once and checked everywhere.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TOOL_EFFECTS.map((eff) => {
                  const on = draft.effects.deny.includes(eff);
                  return (
                    <button
                      key={eff}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          effects: {
                            ...draft.effects,
                            deny: on
                              ? draft.effects.deny.filter((x) => x !== eff)
                              : [...draft.effects.deny, eff],
                          },
                        })
                      }
                      aria-pressed={on}
                      className={cn(
                        'rounded-[var(--radius-sm,3px)] border px-2 py-0.5 text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                        on
                          ? 'border-[var(--color-status-err)] text-[var(--color-status-err)]'
                          : 'border-dashed border-[var(--border-subtle)] text-[var(--fg-muted)]',
                      )}
                    >
                      {eff}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {saveError && (
            <ErrorState
              reason={saveError}
              whatToDo="Fix the rule and save again. The kernel refuses a policy that can never match anything, and a tag outside the vocabulary, at save time rather than letting you discover it through an empty result."
            />
          )}

          <div className="flex gap-2 border-t border-[var(--border-subtle)] pt-4">
            <Button onClick={() => void save()} disabled={!draft.id.trim() || busy}>
              {selectedId ? 'Save policy' : 'Create policy'}
            </Button>
            {selectedId && (
              <Button variant="secondary" onClick={() => void remove(selectedId)} disabled={busy}>
                Delete
              </Button>
            )}
          </div>

          {selectedId && (
            <LinkEditor
              policyId={selectedId}
              links={linksFor(selectedId)}
              groups={groups}
              principals={principals}
              ingresses={ingresses}
              onChanged={async () => {
                await reload();
                onChanged();
              }}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface LinkEditorProps {
  policyId: string;
  links: LinkSpec[];
  groups: GroupSpec[];
  principals: string[];
  onChanged: () => void | Promise<void>;
  ingresses: IngressSpec[];
}

/**
 * Where a policy applies. Containers are listed in APPLICATION order — broadest
 * first — because that order is the precedence rule, not a display preference.
 */
function LinkEditor({ policyId, links, groups, principals, ingresses, onChanged }: LinkEditorProps) {
  const [kind, setKind] = useState<string>('organisation');
  const [target, setTarget] = useState('');
  const [enforced, setEnforced] = useState(false);
  const [err, setErr] = useState('');

  const needsTarget = kind !== 'organisation';
  const suggestions =
    kind === 'group'
      ? groups.map((g) => g.id)
      : kind === 'principal'
        ? principals
        : kind === 'surface'
          ? // Well-known kinds first, then the surface each registered ingress stamps —
            // those are the ones that exist in THIS deployment, and an operator should
            // not have to remember them.
            [
              ...WELL_KNOWN_SURFACES.map((w) => w.target),
              ...ingresses.map((i) => `${i.surface_kind}:${i.surface_id}`),
            ].filter((v, i, a) => a.indexOf(v) === i)
          : [];

  const add = async () => {
    setErr('');
    try {
      await ipc.linkPolicy({
        policy_id: policyId,
        container_kind: kind,
        target_id: needsTarget ? target.trim() : '',
        enforced,
        order: 0,
        expires_at_unix_ms: 0,
        granted_by: '',
      });
      setTarget('');
      await onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section aria-label="Links" className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
      <div>
        <h3 className="text-xs font-medium text-[var(--fg-primary)]">Applies to</h3>
        <p className="text-xs text-[var(--fg-muted)]">
          Link the policy to a container. Everyone in it inherits — that is what makes this
          administrable at more than a dozen people.
        </p>
      </div>

      {links.length === 0 ? (
        <EmptyState
          title="Not linked"
          body="This policy is authored but attached to nothing, so it currently affects no one."
        />
      ) : (
        <ul className="space-y-1" aria-label="Existing links">
          {links.map((l) => (
            <li
              key={`${l.container_kind}-${l.target_id}`}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-sm,3px)] border border-[var(--border-subtle)] px-2 py-1 text-xs"
            >
              <span className="text-[var(--fg-secondary)]">
                <code>{l.container_kind}</code>
                {l.target_id && <> · {l.target_id}</>}
                {l.enforced && (
                  <span className="ml-2 text-[var(--color-status-warn)]">enforced</span>
                )}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await ipc.unlinkPolicy({
                    policy_id: policyId,
                    container_kind: l.container_kind,
                    target_id: l.target_id,
                  });
                  await onChanged();
                }}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="link-kind">
            Container
          </label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="link-kind" className="mt-1 h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTAINER_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsTarget && (
          <div>
            <label className="text-xs text-[var(--fg-muted)]" htmlFor="link-target">
              {kind === 'surface' ? 'Surface' : 'Target'}
            </label>
            <Input
              id="link-target"
              list="link-target-options"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 h-8 w-52 text-sm"
            />
            <datalist id="link-target-options">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {kind === 'surface' && (
              <p className="mt-1 max-w-52 text-[11px] leading-snug text-[var(--fg-muted)]">
                A bare kind matches every instance of it &mdash; <code>operator</code> covers
                <code> operator:console</code>. Use <code>kind:id</code> for one instance.
              </p>
            )}
          </div>
        )}
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-[var(--fg-secondary)]">
          <input
            type="checkbox"
            checked={enforced}
            onChange={(e) => setEnforced(e.target.checked)}
          />
          Enforced
        </label>
        <Button
          variant="secondary"
          size="sm"
          className="mb-0.5"
          onClick={() => void add()}
          disabled={needsTarget && !target.trim()}
        >
          Link
        </Button>
      </div>
      <p className="text-xs text-[var(--fg-muted)]">
        Enforced means a group that blocks inheritance cannot shake this link off.
      </p>
      {err && <ErrorState reason={err} whatToDo="Check the container exists, then link again." />}
    </section>
  );
}

/** Just the target strings, exported so a test can assert the set an operator sees. */
export const WELL_KNOWN_SURFACE_TARGETS = WELL_KNOWN_SURFACES.map((w) => w.target);
