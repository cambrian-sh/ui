import { useState } from 'react';
import { Button, ErrorState, Input, ReasonField, Skeleton, useReasonGate } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { ProviderClient } from '@/ipc/types';
import { errorMessage } from '@/lib/errorMessage';
import { ago, useCommandGate } from '@/lib/useCommandGate';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { refreshAccounts } from '@/screens/integrations/useSystems';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';

const KEY = ['accounts', 'providers'] as const;

/**
 * Settings › OAuth providers (ADR-0141 D8 SetProviderClient; capability
 * `accounts`, Operator): the app registration each provider's sign-in uses.
 * Before this existed the client id/secret had no write path at all (ADR-0141
 * observation). The secret is WRITE-ONLY: the page shows configured / last
 * four / updated-at, inputs clear after every attempt, and nothing is kept.
 */
export function ProviderClientsSettings() {
  const q = useKernelQuery(KEY, () => ipc.listProviderClients());
  return (
    <section aria-labelledby="oauth-providers" className="flex max-w-[760px] flex-col gap-4">
      <header>
        <h2 id="oauth-providers" className="text-[15px] font-medium">
          OAuth providers
        </h2>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-[var(--fg-secondary)]">
          The app registration people sign in through when they connect their own account. Register the redirect URI below
          with each provider, then paste its client id and secret here.
        </p>
      </header>
      {q.error && <ErrorState reason={q.error.message} />}
      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        q.data && (
          <>
            <p className="text-[12px]">
              Redirect URI:{' '}
              <code className="select-all rounded-sm bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[11.5px]">
                {q.data.redirect_uri || 'not set (CAMBRIAN_ACCOUNTS_PUBLIC_BASE_URL)'}
              </code>
            </p>
            <ul className="flex flex-col gap-3">
              {q.data.providers.map((p) => (
                <li key={p.provider}>
                  <ProviderCard p={p} />
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  );
}

function status(p: ProviderClient): { text: string; tone: string } {
  if (p.configured) return { text: 'Configured', tone: 'var(--status-live)' };
  if (p.client_id_configured || p.client_secret_configured) return { text: 'Incomplete', tone: 'var(--status-warn)' };
  return { text: 'Not set', tone: 'var(--status-idle)' };
}

function ProviderCard({ p }: { p: ProviderClient }) {
  const gate = useCommandGate('configure OAuth providers');
  const reason = useReasonGate();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const s = status(p);
  const idFor = (k: string) => `oauth-${p.provider}-${k}`;

  return (
    <form
      aria-label={`${p.display_name || p.provider} OAuth client`}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setAck(null);
        const id = clientId.trim();
        const sec = secret.trim();
        setSecret(''); // a secret never lingers in a field, whatever happens next
        try {
          await ipc.setProviderClient({ provider: p.provider, client_id: id, client_secret: sec, reason: reason.reason.trim() });
          setClientId('');
          reason.reset();
          setAck('Saved.');
          refreshAccounts();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{p.display_name || p.provider}</span>
        <span className="font-mono text-[10.5px]" style={{ color: s.tone }}>
          {s.text}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          client id {p.client_id_configured ? `set ····${p.client_id_last_four}` : 'not set'} · secret{' '}
          {p.public_client ? 'not used (PKCE)' : p.client_secret_configured ? 'set' : 'not set'}
          {p.updated_at_unix_ms ? ` · updated ${ago(p.updated_at_unix_ms)} ago` : ''}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor={idFor('id')} className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
          Client id
          <Input id={idFor('id')} autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-8" placeholder={p.client_id_configured ? 'leave empty to keep' : ''} />
        </label>
        {!p.public_client && (
          <label htmlFor={idFor('secret')} className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
            <span>
              Client secret <span className="font-mono text-[10px] text-[var(--fg-muted)]">write-only</span>
            </span>
            <Input id={idFor('secret')} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className="h-8" placeholder={p.client_secret_configured ? 'leave empty to keep' : ''} />
          </label>
        )}
      </div>
      <ReasonField gate={reason} id={idFor('reason')} />
      {error && <ErrorState reason={error} />}
      {ack && (
        <p role="status" className="text-[12px] text-[var(--status-live)]">
          {ack}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={Boolean(gate) || busy || !reason.satisfied || (!clientId.trim() && !secret.trim())}>
          Save
        </Button>
        {(p.client_id_configured || p.client_secret_configured) && (
          <Button type="button" size="sm" variant="ghost" disabled={Boolean(gate)} onClick={() => setClearing(true)}>
            Clear
          </Button>
        )}
      </div>
      {gate && <p className="text-[11px] text-[var(--fg-muted)]">{gate}</p>}
      <ConfirmMutationDialog
        open={clearing}
        onOpenChange={(o) => !o && setClearing(false)}
        title={`Clear the ${p.display_name || p.provider} OAuth client`}
        description="Nobody can connect a new account with this provider until it is configured again. Accounts already connected keep working until their grants need a refresh."
        confirmLabel="Clear"
        destructive
        onConfirm={async (r) => {
          setClearing(false);
          try {
            await ipc.clearProviderClient(p.provider, r);
            refreshAccounts();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </form>
  );
}
