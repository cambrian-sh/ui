import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Input, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { IngressSpec, Role } from '@/ipc/types';

/**
 * Ingress registry (ADR-0090 D2/D13) — which daemons are entry points into
 * Cambrian, and what surface the kernel stamps on what arrives through them.
 *
 * This pane exists because **registering an ingress mints a surface.** It decides
 * what an entry point is permitted to reach, which is policy-grade authority, and
 * until it had a surface here the registry was reachable only by API — so an
 * operator could see policies and groups but not the thing that decides which
 * traffic a policy applies to.
 *
 * The two facts a reader needs are the two the kernel refuses to infer:
 *
 * - **The surface** is stamped by the kernel from this registration, never claimed
 *   by the daemon. A black box asserting its own privilege level is not a boundary.
 * - **The namespace** bounds which external identities the ingress may speak for,
 *   so one bridge cannot inject messages as another's users.
 */
export function IngressPane({ role }: { role: Role | null }) {
  const readOnly = role !== 'operator';
  const [ingresses, setIngresses] = useState<IngressSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<IngressSpec | null>(null);
  const [formError, setFormError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setIngresses(await ipc.listIngresses());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async () => {
    if (!draft) return;
    setFormError('');
    try {
      const out = await ipc.registerIngress(draft);
      if (!out.ok) {
        // A rejected registration is an authoring outcome with a specific fix — an
        // inert registration, or a namespace prefix that would read as a wildcard —
        // so it belongs next to the form, not in a toast that disappears.
        setFormError(out.error || 'the kernel refused this registration');
        return;
      }
      setDraft(null);
      await reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (agentId: string) => {
    try {
      await ipc.deregisterIngress(agentId);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2">
        <span className="text-xs text-[var(--fg-muted)]">
          An entry point&rsquo;s surface is stamped by the kernel from its registration &mdash; a
          daemon never declares its own.
        </span>
        {!readOnly && (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() =>
              setDraft({ agent_id: '', surface_kind: 'chat', surface_id: '', namespace: [] })
            }
          >
            Register an ingress
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-3 text-xs text-[var(--color-status-err)]">
          {error}
        </p>
      )}

      <ScrollArea className="flex-1">
        {draft && (
          <form
            className="m-4 space-y-3 border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="text-xs text-[var(--color-status-warn)]">
              Registering an ingress <strong>mints a surface</strong>: it decides what this entry
              point may reach. Treat it with the same care as a policy.
            </p>

            <label className="block text-xs">
              <span className="text-[var(--fg-primary)]">Daemon agent id</span>
              <Input
                value={draft.agent_id}
                onChange={(e) => setDraft({ ...draft, agent_id: e.target.value })}
                placeholder="telegram_ingress"
                className="mt-1"
              />
              <span className="mt-1 block text-[var(--fg-muted)]">
                The principal the kernel sees on the connection. This is the lookup key, which is
                why the daemon cannot choose its own registration.
              </span>
            </label>

            <div className="flex gap-2">
              <label className="block flex-1 text-xs">
                <span className="text-[var(--fg-primary)]">Surface kind</span>
                <Input
                  value={draft.surface_kind}
                  onChange={(e) => setDraft({ ...draft, surface_kind: e.target.value })}
                  placeholder="chat"
                  className="mt-1"
                />
              </label>
              <label className="block flex-1 text-xs">
                <span className="text-[var(--fg-primary)]">Surface id</span>
                <Input
                  value={draft.surface_id}
                  onChange={(e) => setDraft({ ...draft, surface_id: e.target.value })}
                  placeholder="telegram"
                  className="mt-1"
                />
              </label>
            </div>

            <label className="block text-xs">
              <span className="text-[var(--fg-primary)]">Namespace prefixes</span>
              <Input
                value={draft.namespace.join(', ')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    namespace: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="tg:"
                className="mt-1"
              />
              <span className="mt-1 block text-[var(--fg-muted)]">
                Which external identities this ingress may speak for. Leave empty only while it is
                the single ingress &mdash; once a second exists, an empty namespace lets either one
                inject messages as the other&rsquo;s users.
              </span>
            </label>

            {formError && (
              <p role="alert" className="text-xs text-[var(--color-status-err)]">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" type="submit">
                Register
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="p-4 text-xs text-[var(--fg-muted)]">Loading&hellip;</p>
        ) : ingresses.length === 0 ? (
          <EmptyState
            title="No registered ingress"
            body="Nothing is an entry point yet, so no external message becomes a conversation and every surface is derived from the transport. That is a correct deployment, not a missing step."
          />
        ) : (
          <ul role="list" aria-label="Registered ingresses" className="divide-y divide-[var(--border-subtle)]">
            {ingresses.map((i) => (
              <li key={i.agent_id} className="flex items-baseline gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-[var(--fg-primary)]">{i.agent_id}</p>
                  <p className="text-xs text-[var(--fg-muted)]">
                    stamps surface{' '}
                    <span className="font-mono text-[var(--fg-secondary)]">
                      {i.surface_kind}:{i.surface_id}
                    </span>
                    {' · '}
                    {i.namespace.length > 0 ? (
                      <>
                        may speak for{' '}
                        <span className="font-mono text-[var(--fg-secondary)]">
                          {i.namespace.join(', ')}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--color-status-warn)]">
                        unrestricted namespace — may speak for any identity
                      </span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(i.agent_id)}
                    title="Deregister. Takes effect on conversations that already exist, because delivery re-checks the registration."
                  >
                    Deregister
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
