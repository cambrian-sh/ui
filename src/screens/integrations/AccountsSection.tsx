import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  ReasonField,
  useReasonGate,
} from '@/design-system/components';
import { ipc } from '@/ipc';
import type { Account, AccountGrant, OrgAccount } from '@/ipc/types';
import {
  ACCOUNT_STATE_LABEL,
  ACCOUNT_STATE_TONE,
  accountLabel,
  accountState,
  grantsNeedingConsent,
  orgAccountActions,
  orgInstallConsumers,
  orgAccountLabel,
  orgAccountState,
  revokeImpact,
  runConnectFlow,
  serverSlots,
  type AccountState,
  type ConnectPhase,
  type MyAccountRow,
  type SystemView,
} from '@/lib/accounts';
import { errorMessage } from '@/lib/errorMessage';
import { ago, useCommandGate } from '@/lib/useCommandGate';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { refreshAccounts, type SystemsFlags } from './useSystems';

/**
 * A system's accounts (ADR-0141 D9): organization accounts (operators create,
 * rotate, bind, revoke), MY account (anyone: connect via OAuth in the system
 * browser, confirm, reconnect, disconnect) and — for operators — everyone's
 * personal accounts (revoke). No secret is ever rendered: an account is its
 * identity, scopes, grants, health and dates (an org key: its last four).
 */
export function AccountsSection({ system, flags }: { system: SystemView; flags: SystemsFlags }) {
  if (!flags.accounts) {
    return (
      <p className="text-[12.5px] leading-[1.6] text-[var(--fg-secondary)]">
        This kernel does not serve accounts (capability <code>accounts</code>). Its servers use the credential stored on
        each server, shared by every agent allowed to call it.
      </p>
    );
  }
  const people = flags.orgAdmin ? system.personal_accounts : [];
  return (
    <div className="flex flex-col gap-4">
      {flags.orgAdmin ? (
        <OrgAccounts system={system} flags={flags} />
      ) : (
        <p className="text-[11.5px] text-[var(--fg-muted)]">Organization accounts are managed by operators.</p>
      )}
      {system.mine.length > 0 && <MyAccounts rows={system.mine} />}
      {people.length > 0 && <PeopleAccounts accounts={people} />}
    </div>
  );
}

export function StateBadge({ state }: { state: AccountState }) {
  const tone = ACCOUNT_STATE_TONE[state];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: tone }}>
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tone }} />
      {ACCOUNT_STATE_LABEL[state]}
    </span>
  );
}

const card = 'flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]';

// ── My accounts ─────────────────────────────────────────────────────────────

function MyAccounts({ rows }: { rows: MyAccountRow[] }) {
  return (
    <section aria-label="My accounts" className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">My account</h3>
      <p className="text-[11.5px] text-[var(--fg-muted)]">
        Your agents act as you on these servers. Nobody else&rsquo;s agent can use your account, and an agent never falls
        back to another credential when yours needs attention.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.server.server_id}>
            <MyAccountCard row={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyAccountCard({ row }: { row: MyAccountRow }) {
  const gate = useCommandGate('connect accounts', { selfService: true });
  const [phase, setPhase] = useState<ConnectPhase>({ phase: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const connect = async () => {
    setError(null);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const end = await runConnectFlow(row.server.server_id, {
      start: ipc.startAccountConnect,
      poll: ipc.getAccountConnectFlow,
      signal: ctl.signal,
      onPhase: setPhase,
    });
    if (end.phase === 'completed') refreshAccounts();
  };

  const busy = phase.phase === 'starting' || phase.phase === 'waiting';
  const a = row.account;
  const name = row.server.display_name || row.server.server_id;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{name}</span>
        <StateBadge state={row.state} />
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
          {row.server.provider} · {row.server.credential_scope === 'either' ? 'yours, else the org account' : 'yours only'}
        </span>
      </div>
      {a && <p className="text-[12.5px]">{accountLabel(a)}</p>}
      {a && (
        <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          {a.scopes.join(' · ') || 'no scopes listed'}
          {a.last_used_unix_ms ? ` · used ${ago(a.last_used_unix_ms)} ago` : ' · never used'}
          {a.connected_at_unix_ms ? ` · connected ${ago(a.connected_at_unix_ms)} ago` : ''}
        </p>
      )}
      {row.state === 'connected' && (a?.missing_scopes?.length ?? 0) > 0 && (
        <p className="text-[12px] text-[var(--status-warn)]">
          Needs more permission: {a?.missing_scopes?.join(', ')}. Your agents cannot use {name} until you reconnect and
          approve it; nothing falls back to another account.
        </p>
      )}
      {row.state === 'provider_unconfigured' && (
        <p className="text-[12px] text-[var(--fg-muted)]">
          Sign-in with {row.server.provider} is not set up on this kernel yet. An operator configures it in Settings › OAuth
          providers.
        </p>
      )}
      {row.state === 'pending_confirmation' && a && (
        <p className="text-[12px] text-[var(--status-warn)]">
          A sign-in as <strong>{accountLabel(a)}</strong> is waiting. It stays off until you confirm it is your account.
        </p>
      )}
      {(row.state === 'reconnect_needed' || row.state === 'error') && (
        <p className="text-[12px] text-[var(--status-err)]">
          {a?.status_detail || 'The provider no longer accepts this sign-in.'} Your agents cannot use {name} until you
          reconnect.
        </p>
      )}
      <ConnectStatus phase={phase} onCancel={() => abort.current?.abort()} />
      {error && <ErrorState reason={error} />}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {row.actions.includes('confirm') && (
          <Button size="sm" disabled={Boolean(gate)} onClick={() => setConfirming(true)}>
            Confirm…
          </Button>
        )}
        {(row.actions.includes('connect') || row.actions.includes('reconnect')) && (
          <Button size="sm" disabled={Boolean(gate) || busy} onClick={() => void connect()}>
            {row.actions.includes('reconnect') ? 'Reconnect' : 'Connect my account'}
          </Button>
        )}
        {row.actions.includes('disconnect') && (
          <Button size="sm" variant="ghost" disabled={Boolean(gate) || busy} onClick={() => setDisconnecting(true)}>
            Disconnect
          </Button>
        )}
      </div>
      {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}

      {confirming && a && <ConfirmIdentityDialog account={a} serverName={name} onClose={() => setConfirming(false)} onError={setError} />}
      <ConfirmMutationDialog
        open={disconnecting}
        onOpenChange={(o) => !o && setDisconnecting(false)}
        title={`Disconnect ${name}`}
        description="Your account is removed and revoked at the provider where it allows. Your agents lose access to this server until you connect again."
        confirmLabel="Disconnect"
        destructive
        onConfirm={async (reason) => {
          setDisconnecting(false);
          try {
            await ipc.disconnectMyAccount(row.server.server_id, reason);
            refreshAccounts();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

/** Live status of a sign-in in the system browser; announced politely to screen readers. */
export function ConnectStatus({ phase, onCancel }: { phase: ConnectPhase; onCancel: () => void }) {
  if (phase.phase === 'idle') return null;
  let text = '';
  switch (phase.phase) {
    case 'starting':
      text = 'Starting sign-in…';
      break;
    case 'waiting':
      text = 'Finish signing in in your browser. This page updates when you are done.';
      break;
    case 'browser_failed':
      text = `The browser did not open: ${phase.detail}`;
      break;
    case 'completed':
      text = `Connected${phase.account ? ` as ${phase.account}` : ''}.`;
      break;
    case 'failed':
      text = `Sign-in failed: ${phase.detail}`;
      break;
    case 'expired':
      text = 'The sign-in link expired. Start again.';
      break;
    case 'cancelled':
      text = 'Stopped waiting. If you finish in the browser, the account still connects.';
      break;
  }
  const bad = phase.phase === 'failed' || phase.phase === 'browser_failed' || phase.phase === 'expired';
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: bad ? 'var(--status-err)' : 'var(--fg-secondary)' }}>
      <span>{text}</span>
      {phase.phase === 'waiting' && phase.scopes.length > 0 && (
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          asks {phase.provider} for: {phase.scopes.join(', ')}
        </span>
      )}
      {phase.phase === 'waiting' && (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Stop waiting
        </Button>
      )}
    </div>
  );
}

/**
 * The phishing defence (ADR-0141 owner position 4): a sign-in someone else may
 * have started is shown by its IDENTITY, and only the person confirms it. The
 * identity shown is the identity sent; the kernel refuses a mismatch.
 */
export function ConfirmIdentityDialog({
  account,
  serverName,
  onClose,
  onError,
}: {
  account: Account;
  serverName: string;
  onClose: () => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      refreshAccounts();
      onClose();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Is this your account?</DialogTitle>
          <DialogDescription>
            Your agents will act as this account on {serverName}. Confirm only if you started this sign-in yourself.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
          <dt className="text-[var(--fg-muted)]">Account</dt>
          <dd className="font-medium">{accountLabel(account)}</dd>
          <dt className="text-[var(--fg-muted)]">Provider</dt>
          <dd>{account.provider}</dd>
          <dt className="text-[var(--fg-muted)]">Access</dt>
          <dd className="font-mono text-[11px]">{account.scopes.join(', ') || '—'}</dd>
          <dt className="text-[var(--fg-muted)]">Signed in</dt>
          <dd>{account.connected_at_unix_ms ? `${ago(account.connected_at_unix_ms)} ago` : '—'}</dd>
        </dl>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => ipc.disconnectMyAccount(account.server_id, 'not my account (rejected at confirmation)'))}>
            Not mine — remove it
          </Button>
          <Button disabled={busy} onClick={() => void act(() => ipc.confirmMyAccount(account.server_id, account.account))}>
            Yes, this is me
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Organization accounts (operator) ────────────────────────────────────────

/** The credential slots of this system's servers, as `server · slot`. */
function slotOptions(system: SystemView): { consumer_id: string; slot: string }[] {
  return system.servers.flatMap((i) => serverSlots(i).map((slot) => ({ consumer_id: i.id, slot })));
}

function OrgAccounts({ system, flags }: { system: SystemView; flags: SystemsFlags }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label="Organization accounts" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-medium">Organization accounts</h3>
        <span className="ml-auto flex items-center gap-1.5">
          {flags.systems && system.org_install_available && <OrgInstallButton system={system} />}
          {orgAccountActions(undefined, { isOperator: true }).includes('create') && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              {system.org_install_available ? 'Paste a key instead' : 'Add an org account'}
            </Button>
          )}
        </span>
      </div>
      {flags.systems && !system.org_install_available && system.org_install_reason && (
        <p className="text-[11.5px] text-[var(--fg-muted)]">Install for the organization is unavailable: {system.org_install_reason}.</p>
      )}
      {system.org_accounts.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">No organization account. Shared servers use the credential stored on the server.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {system.org_accounts.map((a) => (
            <li key={a.id}>
              <OrgAccountCard account={a} system={system} flags={flags} />
            </li>
          ))}
        </ul>
      )}
      {adding && <AddOrgAccountDialog system={system} onClose={() => setAdding(false)} />}
    </section>
  );
}

type OrgDialog =
  | { kind: 'rotate' }
  | { kind: 'rename' }
  | { kind: 'revoke' }
  | { kind: 'bind'; consumer_id: string; slot: string }
  | { kind: 'unbind'; grant: AccountGrant };

/**
 * Organization OAuth install (ADR-0141): the kernel's start URL opens in the
 * system browser (Rust core), the provider's admin installs or consents, and
 * the kernel stores an ORG account bound to this system's servers. The kernel
 * asks for exactly the scopes those servers declare. With `account` it widens
 * that account (incremental consent) or recovers a dead grant.
 */
function OrgInstallButton({ system, account, label }: { system: SystemView; account?: OrgAccount; label?: string }) {
  const gate = useCommandGate('install organization accounts');
  const [phase, setPhase] = useState<ConnectPhase>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const provider = account?.provider ?? system.provider;
  const go = async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const end = await runConnectFlow(system.id, {
      start: () =>
        ipc.startOrgAccountInstall({
          provider,
          account_id: account?.id,
          consumers: account ? [] : orgInstallConsumers(system),
          reason: account ? `widen ${account.id} from the console` : `install ${system.name} for the organization`,
        }),
      poll: ipc.getAccountConnectFlow,
      signal: ctl.signal,
      onPhase: setPhase,
    });
    if (end.phase === 'completed') refreshAccounts();
  };
  const busy = phase.phase === 'starting' || phase.phase === 'waiting';
  return (
    <span className="flex flex-col gap-1">
      <Button size="sm" disabled={Boolean(gate) || busy} onClick={() => void go()}>
        {label ?? `Install ${system.name} for the organization`}
      </Button>
      <ConnectStatus phase={phase} onCancel={() => abort.current?.abort()} />
    </span>
  );
}

function OrgAccountCard({ account: a, system, flags }: { account: OrgAccount; system: SystemView; flags: SystemsFlags }) {
  const gate = useCommandGate('change organization accounts');
  const actions = orgAccountActions(a, { isOperator: true });
  const state = orgAccountState(a);
  const [dialog, setDialog] = useState<OrgDialog | null>(null);
  const [bindTo, setBindTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refreshAccounts();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const unbound = slotOptions(system).filter((o) => !a.grants.some((g) => g.purpose === 'mcp' && g.consumer_id === o.consumer_id && g.slot === o.slot));
  const short = grantsNeedingConsent(a);
  // What revoking would stop, from the kernel (ListAccountConsumers).
  const [impact, setImpact] = useState<string | null>(null);
  useEffect(() => {
    if (dialog?.kind !== 'revoke' || !flags.systems) return;
    let live = true;
    ipc
      .listAccountConsumers(a.id)
      .then((r) => live && setImpact(revokeImpact(r.consumers).text))
      .catch(() => live && setImpact(null));
    return () => {
      live = false;
    };
  }, [dialog?.kind, flags.systems, a.id]);

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{orgAccountLabel(a)}</span>
        <StateBadge state={state} />
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">{a.id}</span>
      </div>
      <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
        {a.provider} · {a.external_account}
        {a.secret_last_four ? ` · key ····${a.secret_last_four}` : ''}
        {a.rotated_at_unix_ms ? ` · rotated ${ago(a.rotated_at_unix_ms)} ago` : ''}
        {a.last_used_unix_ms ? ` · used ${ago(a.last_used_unix_ms)} ago` : ' · never used'}
        {a.origin.startsWith('migrated:') ? ` · migrated from ${a.origin.slice('migrated:'.length)}` : ''}
        {a.auth_kind ? ` · installed (${a.auth_kind === 'client_credentials' ? 'admin consent' : 'OAuth'}), refreshes itself` : ''}
      </p>
      {a.scopes && a.scopes.length > 0 && (
        <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">granted: {a.scopes.join(' · ')}</p>
      )}
      {short.length > 0 && (
        <p className="text-[12px] text-[var(--status-warn)]">
          Needs more permission for {short.map((g) => `${g.consumer_id} (${(g.missing_scopes ?? []).join(', ')})`).join('; ')}. Those
          consumers fail closed until the account is {a.auth_kind ? 're-installed with the added scopes' : 'replaced by a key that carries them'}.
        </p>
      )}
      {a.status_detail && state !== 'connected' && <p className="text-[12px] text-[var(--status-err)]">{a.status_detail}</p>}
      {state === 'revoked' && a.grants.length > 0 && (
        <p className="text-[12px] text-[var(--status-err)]">Everything bound below fails closed until the key is replaced.</p>
      )}
      {a.grants.length > 0 && (
        <ul aria-label={`Bindings of ${orgAccountLabel(a)}`} className="flex flex-col gap-0.5">
          {a.grants.map((g) => (
            <li key={`${g.purpose}:${g.consumer_id}:${g.slot}`} className="flex items-center gap-2 font-mono text-[10.5px] text-[var(--fg-secondary)]">
              <span>
                {g.purpose === 'ingress' ? 'data in' : 'agent actions'} · {g.consumer_id} · {g.slot}
                {g.scopes.length ? ` · ${g.scopes.join(', ')}` : ''}
                {g.scope_check === 'needs_consent' && <span className="text-[var(--status-warn)]"> · needs {(g.missing_scopes ?? []).join(', ')}</span>}
                {g.scope_check === 'unverified' && <span> · scopes unverified</span>}
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10.5px]" disabled={Boolean(gate)} onClick={() => setDialog({ kind: 'unbind', grant: g })} aria-label={`Unbind ${g.consumer_id} ${g.slot}`}>
                Unbind
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorState reason={error} />}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {(actions.includes('rotate') || actions.includes('reactivate')) && (
          <Button size="sm" variant="secondary" disabled={Boolean(gate)} onClick={() => setDialog({ kind: 'rotate' })}>
            {actions.includes('reactivate') ? 'Replace key' : 'Rotate key'}
          </Button>
        )}
        {actions.includes('reinstall') && flags.systems && (
          <OrgInstallButton system={system} account={a} label={short.length > 0 ? 'Grant more permission' : 'Re-install'} />
        )}
        {actions.includes('rename') && (
          <Button size="sm" variant="ghost" disabled={Boolean(gate)} onClick={() => setDialog({ kind: 'rename' })}>
            Rename
          </Button>
        )}
        {actions.includes('revoke') && (
          <Button size="sm" variant="ghost" disabled={Boolean(gate)} onClick={() => setDialog({ kind: 'revoke' })}>
            Revoke
          </Button>
        )}
        {unbound.length > 0 && state === 'connected' && (
          <span className="ml-auto flex items-center gap-1">
            <label className="sr-only" htmlFor={`bind-${a.id}`}>
              Bind {orgAccountLabel(a)} to
            </label>
            <select
              id={`bind-${a.id}`}
              value={bindTo}
              onChange={(e) => setBindTo(e.target.value)}
              className="h-7 rounded-sm bg-[var(--bg-canvas)] px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
            >
              <option value="">Bind to a server…</option>
              {unbound.map((o) => (
                <option key={`${o.consumer_id}\u0000${o.slot}`} value={`${o.consumer_id}\u0000${o.slot}`}>
                  {o.consumer_id} · {o.slot}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(gate) || !bindTo}
              onClick={() => {
                const [consumer_id, slot] = bindTo.split('\u0000');
                setDialog({ kind: 'bind', consumer_id, slot });
              }}
            >
              Bind
            </Button>
          </span>
        )}
      </div>
      {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}

      {dialog?.kind === 'rotate' && <RotateDialog account={a} onClose={() => setDialog(null)} onDone={() => refreshAccounts()} onError={setError} />}
      {dialog?.kind === 'rename' && <RenameDialog account={a} onClose={() => setDialog(null)} onError={setError} />}
      <ConfirmMutationDialog
        open={dialog?.kind === 'revoke' || dialog?.kind === 'bind' || dialog?.kind === 'unbind'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog?.kind === 'revoke'
            ? `Revoke ${orgAccountLabel(a)}`
            : dialog?.kind === 'bind'
              ? `Bind ${orgAccountLabel(a)} to ${dialog.consumer_id}`
              : dialog?.kind === 'unbind'
                ? `Unbind ${dialog.grant.consumer_id} from ${orgAccountLabel(a)}`
                : ''
        }
        description={
          dialog?.kind === 'revoke'
            ? `The key is dropped and the account marked revoked. Every server and ingress bound to it fails closed on its next use; the bindings are kept so you can see what broke.${impact ? ` ${impact}` : ''}`
            : dialog?.kind === 'bind'
              ? `${dialog.consumer_id} uses this account for its ${dialog.slot} credential from now on, instead of a copy stored on the server.`
              : dialog?.kind === 'unbind'
                ? 'The consumer stops using this account. The account itself is not revoked.'
                : ''
        }
        confirmLabel={dialog?.kind === 'revoke' ? 'Revoke' : dialog?.kind === 'bind' ? 'Bind' : 'Unbind'}
        destructive={dialog?.kind === 'revoke'}
        onConfirm={async (reason) => {
          const d = dialog;
          setDialog(null);
          if (d?.kind === 'revoke') await run(() => ipc.revokeOrgAccount(a.id, reason));
          else if (d?.kind === 'bind') {
            setBindTo('');
            await run(() => ipc.bindOrgAccount(a.id, { purpose: 'mcp', consumer_id: d.consumer_id, slot: d.slot }, reason));
          } else if (d?.kind === 'unbind') await run(() => ipc.unbindOrgAccount(a.id, d.grant, reason));
        }}
      />
    </div>
  );
}

function RotateDialog({ account: a, onClose, onDone, onError }: { account: OrgAccount; onClose: () => void; onDone: () => void; onError: (e: string) => void }) {
  const reason = useReasonGate();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{orgAccountState(a) === 'revoked' ? 'Replace key' : 'Rotate key'} — {orgAccountLabel(a)}</DialogTitle>
          <DialogDescription>
            The new key replaces the old one for every consumer bound to this account
            {orgAccountState(a) === 'revoked' ? ' and makes the account live again' : ''}. It is write-only: stored encrypted and never shown again.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const value = secret.trim();
            setSecret(''); // never lingers in a field, whatever happens next
            try {
              await ipc.rotateOrgAccount(a.id, value, reason.reason.trim());
              onDone();
            } catch (err) {
              onError(errorMessage(err));
            } finally {
              setBusy(false);
              onClose();
            }
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            <span>
              New key <span className="font-mono text-[10px] text-[var(--fg-muted)]">write-only</span>
            </span>
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className="h-8" />
          </label>
          <ReasonField gate={reason} id="rotate-reason" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.satisfied || !secret.trim()}>
              Save key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ account: a, onClose, onError }: { account: OrgAccount; onClose: () => void; onError: (e: string) => void }) {
  const reason = useReasonGate();
  const [name, setName] = useState(a.display_name);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Rename {orgAccountLabel(a)}</DialogTitle>
          <DialogDescription>The id ({a.id}) does not change, so nothing bound to it needs updating.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await ipc.updateOrgAccount(a.id, name.trim(), reason.reason.trim());
              refreshAccounts();
            } catch (err) {
              onError(errorMessage(err));
            }
            onClose();
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            Display name
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
          </label>
          <ReasonField gate={reason} id="rename-reason" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason.satisfied || !name.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddOrgAccountDialog({ system, onClose }: { system: SystemView; onClose: () => void }) {
  const gate = useCommandGate('add organization accounts');
  const reason = useReasonGate();
  const [provider, setProvider] = useState(system.provider || 'static_token');
  const [external, setExternal] = useState('');
  const [display, setDisplay] = useState('');
  const [secret, setSecret] = useState('');
  const options = slotOptions(system);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[520px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an organization account — {system.name}</DialogTitle>
          <DialogDescription>
            A key or bot token the organization holds. Servers and ingresses bind to it by reference — one key, rotated and
            revoked in one place.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const value = secret.trim();
            setSecret('');
            try {
              await ipc.createOrgAccount({
                provider: provider.trim(),
                external_account: external.trim(),
                display_name: display.trim(),
                secret: value,
                grants: [...grants].map((k) => {
                  const [consumer_id, slot] = k.split('\u0000');
                  return { purpose: 'mcp', consumer_id, slot, scopes: [] };
                }),
                reason: reason.reason.trim(),
              });
              refreshAccounts();
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            Kind or provider
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-8" placeholder="static_token, api_key or a provider id" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            Account at the provider
            <Input value={external} onChange={(e) => setExternal(e.target.value)} className="h-8" placeholder="workspace, login or a label" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            Display name
            <Input value={display} onChange={(e) => setDisplay(e.target.value)} className="h-8" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            <span>
              Key <span className="font-mono text-[10px] text-[var(--fg-muted)]">write-only</span>
            </span>
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className="h-8" />
          </label>
          {options.length > 0 && (
            <fieldset className="flex flex-col gap-1 text-[12px]">
              <legend className="mb-1 text-[var(--fg-secondary)]">Use it for</legend>
              {options.map((o) => {
                const k = `${o.consumer_id}\u0000${o.slot}`;
                return (
                  <label key={k} className="flex items-center gap-2 font-mono text-[11px]">
                    <input
                      type="checkbox"
                      checked={grants.has(k)}
                      onChange={(e) =>
                        setGrants((g) => {
                          const n = new Set(g);
                          if (e.target.checked) n.add(k);
                          else n.delete(k);
                          return n;
                        })
                      }
                    />
                    {o.consumer_id} · {o.slot}
                  </label>
                );
              })}
            </fieldset>
          )}
          <ReasonField gate={reason} id="org-account-reason" />
          {error && <ErrorState reason={error} />}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(gate) || busy || !reason.satisfied || !provider.trim() || !external.trim() || !secret.trim()}>
              Add account
            </Button>
          </DialogFooter>
          {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Everyone's personal accounts (operator) ─────────────────────────────────

function PeopleAccounts({ accounts }: { accounts: Account[] }) {
  const gate = useCommandGate('revoke accounts');
  const [revoking, setRevoking] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-label="People's accounts" className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">People&rsquo;s accounts</h3>
      <table className="w-full text-left text-[12px]">
        <thead className="text-[11px] text-[var(--fg-muted)]">
          <tr>
            <th scope="col" className="py-1 font-normal">Person</th>
            <th scope="col" className="py-1 font-normal">Server</th>
            <th scope="col" className="py-1 font-normal">Account</th>
            <th scope="col" className="py-1 font-normal">State</th>
            <th scope="col" className="py-1 font-normal">Last used</th>
            <th scope="col" className="py-1 font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={`${a.principal_id}\u0000${a.server_id}`} className="border-t border-[var(--border-subtle)]">
              <td className="py-1.5">{a.principal_id}</td>
              <td className="py-1.5 font-mono text-[11px]">{a.server_id}</td>
              <td className="py-1.5">{accountLabel(a)}</td>
              <td className="py-1.5">
                <StateBadge state={accountState(a)} />
              </td>
              <td className="py-1.5">{a.last_used_unix_ms ? `${ago(a.last_used_unix_ms)} ago` : 'never'}</td>
              <td className="py-1.5 text-right">
                <Button size="sm" variant="ghost" disabled={Boolean(gate)} onClick={() => setRevoking(a)} aria-label={`Revoke ${a.principal_id}'s ${a.server_id} account`}>
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <ErrorState reason={error} />}
      {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}
      <ConfirmMutationDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={revoking ? `Revoke ${revoking.principal_id}'s ${revoking.server_id} account` : ''}
        description="The account is deleted and revoked at the provider; that person's agents lose access until they connect again."
        confirmLabel="Revoke"
        destructive
        onConfirm={async (reason) => {
          const a = revoking;
          setRevoking(null);
          if (!a) return;
          try {
            await ipc.revokeAccount(a.server_id, a.principal_id, reason);
            refreshAccounts();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </section>
  );
}
