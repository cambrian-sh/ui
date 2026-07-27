import { useState } from 'react';
import { ipc } from '@/ipc';
import type { AccessDecision, ResultantPolicy } from '@/ipc/types';
import {
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { TagPicker } from './TagPicker';
import { DecisionCard } from './DecisionCard';
import type { Vocabulary } from './useVocabulary';

const RESOURCE_KINDS = ['memory', 'skill', 'agent', 'tool', 'artifact'] as const;
const SURFACE_KINDS = ['', 'operator', 'agent', 'chat', 'reactive', 'internal'] as const;

interface ExplainPaneProps {
  vocabulary: Vocabulary;
  /** Known agent ids, so the principal field can suggest rather than demand typing. */
  principals: string[];
  /** True when the kernel advertises `access-policy` — enables the resultant lane. */
  hasPolicyPlane: boolean;
}

/**
 * "Why can / can't this principal reach this?" — the `gpresult` surface.
 *
 * Microsoft ships a tool that reports the resultant set of policy AND which GPO
 * won each setting, and considered it essential at their scale. This is that, at
 * ours. It answers WITHOUT performing the access, so asking is never the thing
 * that changes the answer.
 */
export function ExplainPane({ vocabulary, principals, hasPolicyPlane }: ExplainPaneProps) {
  const [principalId, setPrincipalId] = useState('');
  const [surfaceKind, setSurfaceKind] = useState('');
  const [surfaceId, setSurfaceId] = useState('');
  const [resourceKind, setResourceKind] = useState<string>('memory');
  const [resourceId, setResourceId] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [resultant, setResultant] = useState<ResultantPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAsk = principalId.trim().length > 0;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await ipc.explainAccess({
        principal_id: principalId.trim(),
        surface_kind: surfaceKind || undefined,
        surface_id: surfaceId.trim() || undefined,
        resource_kind: resourceKind,
        resource_id: resourceId.trim() || undefined,
        tags,
      });
      setDecision(d);
      // The resultant set is the other half of the answer: the decision says what
      // happened to THIS resource, the resultant says what the principal can
      // reach at all. Best-effort — a kernel without the policy plane has no
      // resultant to report, and that is not an error.
      if (hasPolicyPlane) {
        try {
          setResultant(
            await ipc.resultantPolicy({
              principal_id: principalId.trim(),
              surface_kind: surfaceKind || undefined,
              surface_id: surfaceId.trim() || undefined,
            }),
          );
        } catch {
          setResultant(null);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDecision(null);
      setResultant(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <form
        className="w-[380px] shrink-0 space-y-4 overflow-y-auto border-r border-[var(--border-subtle)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAsk) void ask();
        }}
      >
        <div>
          <label htmlFor="explain-principal" className="text-xs font-medium text-[var(--fg-primary)]">
            Principal
          </label>
          <p className="mb-1.5 text-xs text-[var(--fg-muted)]">Who is asking.</p>
          <Input
            id="explain-principal"
            list="explain-principal-options"
            value={principalId}
            onChange={(e) => setPrincipalId(e.target.value)}
            placeholder="agent id"
            className="h-8 text-sm"
          />
          <datalist id="explain-principal-options">
            {principals.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div>
          <span className="text-xs font-medium text-[var(--fg-primary)]">Surface</span>
          <p className="mb-1.5 text-xs text-[var(--fg-muted)]">
            Where they arrived from. A surface can clamp what may be done no matter who is
            asking.
          </p>
          <div className="flex gap-2">
            <Select value={surfaceKind} onValueChange={setSurfaceKind}>
              <SelectTrigger className="h-8 flex-1 text-sm" aria-label="Surface kind">
                <SelectValue placeholder="any" />
              </SelectTrigger>
              <SelectContent>
                {SURFACE_KINDS.map((k) => (
                  <SelectItem key={k || 'any'} value={k}>
                    {k || 'any'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={surfaceId}
              onChange={(e) => setSurfaceId(e.target.value)}
              placeholder="instance (optional)"
              aria-label="Surface instance"
              className="h-8 flex-1 text-sm"
            />
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-[var(--fg-primary)]">Resource</span>
          <p className="mb-1.5 text-xs text-[var(--fg-muted)]">What they are reaching for.</p>
          <div className="flex gap-2">
            <Select value={resourceKind} onValueChange={setResourceKind}>
              <SelectTrigger className="h-8 flex-1 text-sm" aria-label="Resource kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="id (optional)"
              aria-label="Resource id"
              className="h-8 flex-1 text-sm"
            />
          </div>
        </div>

        <TagPicker
          label="Resource tags"
          hint="The classification the resource carries. This is what the predicate is applied to."
          selected={tags}
          onChange={setTags}
          vocabulary={vocabulary}
        />

        <Button type="submit" disabled={!canAsk || busy} className="w-full">
          {busy ? 'Asking…' : 'Explain access'}
        </Button>
        <p className="text-xs text-[var(--fg-muted)]">
          This performs no access and changes nothing. It answers the same question the kernel
          answers at runtime, against the same policy snapshot.
        </p>
      </form>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {error && (
            <ErrorState
              reason={`Could not explain access: ${error}`}
              whatToDo="If the kernel lacks the access-policy capability there is no policy to explain. Otherwise check the connection."
            />
          )}

          {!error && !decision && (
            <p className="text-sm text-[var(--fg-muted)]">
              Ask about a principal to see whether it may reach a resource, and which policy —
              linked where — decides it.
            </p>
          )}

          {decision && <DecisionCard decision={decision} />}

          {resultant && (
            <section
              aria-label="Resultant policy"
              className="rounded-[var(--radius-md)] border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
            >
              <h3 className="mb-1 text-sm font-medium text-[var(--fg-primary)]">
                Everything this principal can reach
              </h3>
              <p className="mb-3 text-xs text-[var(--fg-muted)]">
                The composed boundary, and the containers it came from.
              </p>

              {resultant.unsatisfiable_reason && (
                <p className="mb-3 rounded-[var(--radius-sm,3px)] border border-[var(--color-status-err)] p-2 text-xs text-[var(--color-status-err)]">
                  This boundary can never match anything: {resultant.unsatisfiable_reason}. It
                  returns zero rows for every query — which looks exactly like an empty corpus.
                </p>
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-[var(--fg-muted)]">Groups</dt>
                <dd className="text-[var(--fg-secondary)]">
                  {resultant.groups.length > 0 ? resultant.groups.join(' → ') : '—'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Required</dt>
                <dd className="text-[var(--fg-secondary)]">
                  {resultant.effective.required_tags.join(', ') || '—'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Any-of</dt>
                <dd className="text-[var(--fg-secondary)]">
                  {resultant.any_of_clauses.length > 0
                    ? resultant.any_of_clauses.map((c) => `(${c.join(' | ')})`).join(' AND ')
                    : '—'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Forbidden</dt>
                <dd className="text-[var(--color-status-err)]">
                  {resultant.effective.forbidden_tags.join(', ') || '—'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Effects denied</dt>
                <dd className="text-[var(--color-status-err)]">
                  {resultant.effects.deny.join(', ') || '—'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Effects allowed</dt>
                <dd className="text-[var(--fg-secondary)]">
                  {resultant.effects.allow.length > 0 ? resultant.effects.allow.join(', ') : 'all'}
                </dd>
              </dl>

              {resultant.contributions.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--border-subtle)] pt-3 text-xs">
                  {resultant.contributions.map((c, i) => (
                    <li key={`${c.policy_id}-${i}`} className="flex flex-wrap gap-x-2">
                      <code className="text-[var(--fg-secondary)]">{c.linked_at}</code>
                      <span className="text-[var(--fg-muted)]">
                        {c.policy_name || c.policy_id} · {c.term} {c.values.join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
