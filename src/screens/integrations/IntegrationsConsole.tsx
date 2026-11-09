import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  ReasonField,
  ScrollArea,
  useReasonGate,
} from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import type {
  Integration,
  IntegrationCatalogEntry,
  IntegrationMutation,
  IntegrationTestResult,
} from '@/ipc/types';
import { errorMessage } from '@/lib/errorMessage';
import {
  EFFECT_TEXT,
  STATUS_LABEL,
  STATUS_TONE,
  effectiveHealth,
  installable,
  missingFields,
  splitFieldValues,
  statusOf,
} from '@/lib/integrations';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { ago, useCapability, useCommandGate } from '@/lib/useCommandGate';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { IntegrationsSettings } from './IntegrationsSettings';
import { SystemsList } from './SystemsList';

const KEY = ['integrations'] as const;
export const refreshIntegrations = () => void queryClient.invalidateQueries({ queryKey: KEY });

/**
 * Integrations — the external systems (ADR-0141 D9: one page each, see
 * SystemsList / SystemPage) above the MCP catalog to add servers from. MCP
 * servers are connected without editing mcp.json (capability `integrations`; kernel work in
 * T-20261106-integrations-manage-mcp-servers-from-the).
 *
 * Installed integrations first (status from the live health feed), then the
 * catalog grouped by category. Every write says what it did (`outcome.effect`:
 * live / restart required / shadowed / rejected). Secrets are write-only: the
 * page shows whether one is set and where it comes from, never its value.
 *
 * A kernel without the capability gets the read-only listing of configured MCP
 * servers (contract 0097) — a valid deployment, not a fault.
 */
export function IntegrationsConsole() {
  const hasCatalog = useCapability('integrations');
  const capabilities = useStore(projectionStore, (s) => s.state?.capabilities ?? []);

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-[980px] flex-col gap-6 px-[26px] pb-10 pt-4">
        <header>
          <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">Integrations</h1>
          <p className="mt-1 text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
            One page per external system — its accounts, the data it brings in, and what agents can do there.
          </p>
        </header>
        {hasCatalog ? (
          <Catalog />
        ) : (
          <>
            <p className="text-[12.5px] leading-[1.6] text-[var(--fg-secondary)]">
              This kernel does not serve the integration catalog (capability <code>integrations</code>). The servers
              configured for this deployment are listed below; manage them in Runtime › MCP.
            </p>
            <IntegrationsSettings capabilities={capabilities} />
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function Catalog() {
  const installed = useKernelQuery([...KEY, 'installed'], () => ipc.listIntegrations());
  const catalog = useKernelQuery([...KEY, 'catalog'], () => ipc.listIntegrationCatalog());
  const [installing, setInstalling] = useState<IntegrationCatalogEntry | null>(null);
  const [category, setCategory] = useState<string>('');
  const [last, setLast] = useState<IntegrationMutation | null>(null);

  const list = installed.data?.integrations ?? [];
  const entries = useMemo(
    () => (catalog.data?.entries ?? []).filter((e) => !category || e.category === category),
    [catalog.data, category],
  );

  return (
    <>
      {last?.outcome && <OutcomeNote m={last} />}

      <SystemsList />

      <section aria-label="Integration catalog" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-[14px] font-medium">Add an integration</h2>
          <div role="group" aria-label="Category" className="flex flex-wrap gap-1">
            {['', ...(catalog.data?.categories ?? [])].map((c) => (
              <Button key={c || 'all'} size="sm" variant={c === category ? 'default' : 'ghost'} aria-pressed={c === category} onClick={() => setCategory(c)}>
                {c || 'all'}
              </Button>
            ))}
          </div>
        </div>
        {catalog.error && <ErrorState reason={catalog.error.message} />}
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => {
            const can = installable(e, list);
            return (
              <li key={e.id} className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13.5px] font-medium">{e.name}</span>
                  <TrustBadge tier={e.trust_tier} />
                </div>
                <p className="line-clamp-3 text-[12px] leading-[1.5] text-[var(--fg-secondary)]">{e.description}</p>
                <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                  {e.publisher || '—'} · v{e.version || '?'} · {e.transport}
                  {e.runtimes.length ? ` · needs ${e.runtimes.join(', ')}` : ''}
                </p>
                {e.policy_summary && <p className="text-[11.5px] text-[var(--fg-muted)]">Can: {e.policy_summary}</p>}
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Button size="sm" disabled={!can || !e.platform_supported} onClick={() => setInstalling(e)}>
                    {can ? 'Connect' : 'Connected'}
                  </Button>
                  {!e.platform_supported && <span className="text-[11px] text-[var(--status-warn)]">not supported on this kernel's OS</span>}
                  {e.docs_url && (
                    <a href={e.docs_url} target="_blank" rel="noreferrer" className="ml-auto text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]">
                      Docs ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[11.5px] text-[var(--fg-muted)]">
          Need a server that is not listed? Add it in{' '}
          <Link to="/mcp" search={{ focus: undefined }} className="underline underline-offset-4 hover:text-[var(--fg-primary)]">
            Runtime › MCP
          </Link>
          . Local (stdio) servers run with the kernel's own privileges; there is no sandbox yet.
        </p>
      </section>

      {installing && (
        <InstallDialog
          entry={installing}
          onClose={() => setInstalling(null)}
          onDone={(m) => {
            setLast(m);
            setInstalling(null);
            refreshIntegrations();
          }}
        />
      )}
    </>
  );
}

function TrustBadge({ tier }: { tier: string }) {
  const tone = tier === 'official' ? 'var(--status-live)' : 'var(--status-warn)';
  return (
    <span className="rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] tint-fill" style={{ '--tint': tone, color: tone } as React.CSSProperties}>
      {tier || 'unrated'}
    </span>
  );
}

export function OutcomeNote({ m }: { m: IntegrationMutation }) {
  const o = m.outcome!;
  const bad = o.effect === 'rejected';
  return (
    <p
      role="status"
      className="rounded-md p-2.5 text-[12.5px] tint-wash tint-ring"
      style={{ '--tint': bad ? 'var(--status-err)' : o.effect === 'live' ? 'var(--status-live)' : 'var(--status-warn)' } as React.CSSProperties}
    >
      {EFFECT_TEXT[o.effect] ?? o.effect}
      {o.shadowed_by && ` (${o.shadowed_by})`}
      {o.error && ` ${o.error}`}
    </p>
  );
}

/**
 * One installed MCP server. `accountBacked`: the server's credential comes from
 * accounts (ADR-0141 D11 phase 4) — its per-server secret fields are retired
 * here and the system page's Accounts section is the one place to manage it.
 */
export function InstalledCard({
  integration: i,
  health,
  onResult,
  accountBacked = false,
}: {
  integration: Integration;
  health: ReturnType<typeof effectiveHealth>;
  onResult: (m: IntegrationMutation) => void;
  accountBacked?: boolean;
}) {
  const gate = useCommandGate('change integrations');
  const status = statusOf(i, health);
  const tone = STATUS_TONE[status];
  const [confirm, setConfirm] = useState<'enable' | 'disable' | 'remove' | 'revert' | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [test, setTest] = useState<IntegrationTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = !i.editable;

  const run = async (fn: () => Promise<IntegrationMutation>) => {
    setError(null);
    try {
      onResult(await fn());
      refreshIntegrations();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-2 rounded-full', status === 'ready' && 'cambrian-live-pulse')} style={{ background: tone }} />
        <span className="text-[13.5px] font-medium">{i.name || i.id}</span>
        <span className="font-mono text-[10.5px]" style={{ color: tone }}>
          {STATUS_LABEL[status]}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">{i.source}</span>
      </div>
      <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
        {i.id} · {health?.tool_count ?? 0} tools
        {health?.last_handshake_unix_ms ? ` · handshake ${ago(health.last_handshake_unix_ms)} ago` : ''}
        {health?.restart_count ? ` · ${health.restart_count} restarts` : ''}
        {i.update_available ? ' · update available' : ''}
      </p>
      {status === 'needs_setup' && (
        <p className="text-[12px] text-[var(--status-warn)]">Missing: {i.missing_required.join(', ')}</p>
      )}
      {health?.last_error && status === 'error' && <p className="text-[12px] text-[var(--status-err)]">{health.last_error}</p>}
      {i.policy_summary && <p className="text-[11.5px] text-[var(--fg-muted)]">Can: {i.policy_summary}</p>}
      {readOnly && <p className="text-[11.5px] text-[var(--fg-muted)]">Contributed by a plugin; read-only here.</p>}
      {accountBacked && <p className="text-[11.5px] text-[var(--fg-muted)]">Credentials come from accounts (see Accounts above).</p>}
      {error && <ErrorState reason={error} />}
      {test && <TestResult r={test} />}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Button size="sm" variant="secondary" disabled={Boolean(gate) || readOnly} onClick={() => setConfirm(i.enabled ? 'disable' : 'enable')}>
          {i.enabled ? 'Turn off' : 'Turn on'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(gate) || testing}
          onClick={async () => {
            setTesting(true);
            setError(null);
            try {
              setTest(await ipc.testIntegration({ id: i.id, call_probe: true }));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? 'Testing…' : 'Test'}
        </Button>
        {!accountBacked && (
          <Button size="sm" variant="ghost" disabled={Boolean(gate) || readOnly} onClick={() => setConfiguring(true)}>
            Credentials
          </Button>
        )}
        {i.overrides_file && (
          <Button size="sm" variant="ghost" disabled={Boolean(gate) || readOnly} onClick={() => setConfirm('revert')}>
            Revert to file
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" disabled={Boolean(gate) || readOnly} onClick={() => setConfirm('remove')}>
          Remove
        </Button>
      </div>
      {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}

      <ConfirmMutationDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === 'remove'
            ? `Remove ${i.name || i.id}`
            : confirm === 'revert'
              ? `Revert ${i.name || i.id} to its config file`
              : confirm === 'enable'
                ? `Turn on ${i.name || i.id}`
                : `Turn off ${i.name || i.id}`
        }
        description={
          confirm === 'remove'
            ? 'The server is stopped and its tools disappear from every agent. Stored credentials are deleted too.'
            : confirm === 'revert'
              ? 'The changes made here are dropped and the config-file (mcp.json) entry applies again; the server restarts on it now. Stored credentials are kept.'
              : confirm === 'enable'
                ? 'The server starts now and its tools become available to agents allowed to use them.'
                : 'The server stops now; its tools disappear until it is turned back on.'
        }
        confirmLabel={confirm === 'remove' ? 'Remove' : confirm === 'revert' ? 'Revert' : confirm === 'enable' ? 'Turn on' : 'Turn off'}
        destructive={confirm === 'remove'}
        onConfirm={async (reason) => {
          const kind = confirm;
          setConfirm(null);
          if (kind === 'remove') await run(() => ipc.removeIntegration({ id: i.id, reason }));
          else if (kind === 'revert') await run(() => ipc.revertIntegrationToFile({ id: i.id, reason }));
          else await run(() => ipc.setIntegrationEnabled({ id: i.id, enabled: kind === 'enable', reason }));
        }}
      />
      {configuring && <SecretsDialog integration={i} onClose={() => setConfiguring(false)} onResult={onResult} />}
    </div>
  );
}

function TestResult({ r }: { r: IntegrationTestResult }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-[var(--bg-canvas)] p-2 text-[12px] shadow-[inset_0_0_0_1px_var(--border-subtle)]" role="status">
      <p style={{ color: r.ok ? 'var(--status-live)' : 'var(--status-err)' }}>
        {r.ok ? `Connected in ${r.latency_ms} ms` : `Failed: ${r.error || 'no detail'}`}
        {r.used_live_session ? ' (live session)' : ' (test launch)'}
      </p>
      {r.probe_tool && (
        <p className="text-[var(--fg-secondary)]">
          Probe {r.probe_tool}: {r.probe_ok ? 'ok' : 'failed'}
          {r.probe_output && <span className="block truncate font-mono text-[11px] text-[var(--fg-muted)]">{r.probe_output}</span>}
        </p>
      )}
      {!r.probe_tool && r.probe_skipped_reason && <p className="text-[var(--fg-muted)]">Probe skipped: {r.probe_skipped_reason}</p>}
      {r.tools.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[var(--fg-secondary)]">{r.tools.length} tools and the policy each gets</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {r.tools.map((t) => (
              <li key={t.name} className="font-mono text-[11px]">
                {t.name} — {t.dangerous ? 'needs approval' : 'allowed'} · {t.effects.join('+') || 'no effects'}
                {t.policy_source === 'fail_closed' && <span className="text-[var(--status-warn)]"> (undeclared: fail-closed)</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function InstallDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: IntegrationCatalogEntry;
  onClose: () => void;
  onDone: (m: IntegrationMutation) => void;
}) {
  const gate = useCommandGate('connect integrations');
  const reason = useReasonGate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [id, setId] = useState(entry.id);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingFields(entry, values);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect {entry.name}</DialogTitle>
          <DialogDescription>
            {entry.notes || entry.description}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const { settings, secrets } = splitFieldValues(entry, values);
              const m = await ipc.installIntegration({
                catalog_id: entry.id,
                id: id.trim() || entry.id,
                settings,
                secrets,
                enabled,
                reason: reason.reason.trim(),
              });
              if (m.outcome?.effect === 'rejected') setError(m.outcome.error || 'The kernel refused the install.');
              else onDone(m);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {entry.multi_instance && (
            <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
              Name for this connection
              <Input value={id} onChange={(e) => setId(e.target.value)} className="h-8" />
            </label>
          )}
          {entry.fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
              <span>
                {f.label || f.name}
                {f.required && <span aria-hidden="true"> *</span>}
                {f.secret && <span className="ml-1 font-mono text-[10px] text-[var(--fg-muted)]">secret · write-only</span>}
              </span>
              <Input
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                required={f.required}
                placeholder={f.placeholder || (f.secret ? '' : f.default_value)}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="h-8"
              />
              {f.help && <span className="text-[11px] text-[var(--fg-muted)]">{f.help}</span>}
            </label>
          ))}
          <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Start it now
          </label>
          {entry.policy_summary && <p className="text-[11.5px] text-[var(--fg-muted)]">Agents will be able to: {entry.policy_summary}</p>}
          <ReasonField gate={reason} id="install-reason" />
          {error && <ErrorState reason={error} />}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(gate) || busy || missing.length > 0 || !reason.satisfied}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
          {(gate || missing.length > 0) && (
            <p className="text-[11px] text-[var(--fg-muted)]">{gate ?? `Still needed: ${missing.join(', ')}`}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretsDialog({
  integration: i,
  onClose,
  onResult,
}: {
  integration: Integration;
  onClose: () => void;
  onResult: (m: IntegrationMutation) => void;
}) {
  const gate = useCommandGate('change credentials');
  const reason = useReasonGate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<IntegrationMutation>) => {
    setBusy(true);
    setError(null);
    try {
      const m = await fn();
      onResult(m);
      if (m.outcome?.effect === 'rejected') setError(m.outcome.error || 'Refused.');
      refreshIntegrations();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credentials — {i.name || i.id}</DialogTitle>
          <DialogDescription>
            Values are write-only: they are encrypted at rest, given only to this server, and never shown again.
            Changing one restarts this server.
          </DialogDescription>
        </DialogHeader>
        {i.secrets.length === 0 ? (
          <EmptyState title="This integration takes no credentials" />
        ) : (
          <ul className="flex flex-col gap-3">
            {i.secrets.map((s) => (
              <li key={s.name} className="flex flex-col gap-1">
                <span className="text-[12px] text-[var(--fg-secondary)]">
                  {s.label || s.name}
                  {s.required && <span aria-hidden="true"> *</span>}
                  <span className="ml-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
                    {s.set ? `set${s.source ? ` (${s.source})` : ''}${s.updated_at_unix_ms ? ` · ${ago(s.updated_at_unix_ms)} ago` : ''}` : 'not set'}
                  </span>
                </span>
                {s.source.startsWith('env:') && (
                  <span className="text-[11px] text-[var(--status-warn)]">The kernel's environment variable wins over a stored value.</span>
                )}
                <div className="flex gap-1.5">
                  <Input
                    type="password"
                    autoComplete="off"
                    aria-label={`New value for ${s.label || s.name}`}
                    value={values[s.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [s.name]: e.target.value }))}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    disabled={Boolean(gate) || busy || !reason.satisfied || !(values[s.name] ?? '').trim()}
                    onClick={() =>
                      void act(async () => {
                        const m = await ipc.setIntegrationSecret({ id: i.id, name: s.name, value: values[s.name].trim(), reason: reason.reason.trim() });
                        setValues((v) => ({ ...v, [s.name]: '' }));
                        return m;
                      })
                    }
                  >
                    Save
                  </Button>
                  {s.set && s.source === 'store' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(gate) || busy || !reason.satisfied}
                      onClick={() => void act(() => ipc.clearIntegrationSecret({ id: i.id, name: s.name, reason: reason.reason.trim() }))}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <ReasonField gate={reason} id="secret-reason" />
        {error && <ErrorState reason={error} />}
        {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
