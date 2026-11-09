import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, ErrorState } from '@/design-system/components';
import { ipc } from '@/ipc';
import { ACCOUNTS_CAPABILITY, ingressAccountChoices, orgAccountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errorMessage';
import { useCapability, useCommandGate } from '@/lib/useCommandGate';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { refreshAccounts } from '@/screens/integrations/useSystems';

/**
 * Ingress Studio's account picker (ADR-0141 D9): an ingress's OUTBOUND
 * credential (an API key or bot token it presents to the source) binds to an
 * organization account by reference — BindOrgAccount{purpose: ingress,
 * consumer_id: <ingress>, slot: <credential binding name>} — over the same
 * list the system pages show. One key, rotated and revoked in one place.
 *
 * INBOUND secrets (webhook signing secrets, bearer tokens, upload tokens) are
 * not accounts (D4) and stay in the credential list above it. Binding the
 * owner's PERSONAL account (`account: owner`) arrives with phase 3.
 *
 * Gated on capability `accounts` and the Operator role (ListOrgAccounts is
 * Operator-only); absent either, nothing renders and the credential list is
 * the whole story.
 */
export function AccountPicker({ ingressId, slot, readOnly }: { ingressId: string; slot: string; readOnly: boolean }) {
  const hasAccounts = useCapability(ACCOUNTS_CAPABILITY);
  const isOperator = useStore(projectionStore, (s) => s.state?.role === 'operator');
  const enabled = hasAccounts && isOperator;
  const org = useKernelQuery(['accounts', 'org'], () => ipc.listOrgAccounts(), { enabled });
  const gate = useCommandGate('bind accounts');
  const [choice, setChoice] = useState('');
  const [confirm, setConfirm] = useState<'bind' | 'unbind' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return null;

  const choices = ingressAccountChoices(org.data ?? [], ingressId, slot);
  const bound = choices.find((c) => c.bound)?.account;
  const selectId = `acct-${ingressId}-${slot}`;
  const picked = choices.find((c) => c.account.id === choice)?.account;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <label htmlFor={selectId} className="text-[var(--fg-muted)]">
        Outbound account
      </label>
      {bound ? (
        <span className="text-[var(--fg-primary)]">
          {orgAccountLabel(bound)}
          {bound.status !== 'connected' && <span className="text-[var(--status-err)]"> ({bound.status})</span>}
        </span>
      ) : (
        <span className="text-[var(--fg-muted)]">none — the value stored here is used</span>
      )}
      {!readOnly && (
        <>
          <select
            id={selectId}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="h-7 rounded-sm bg-[var(--bg-canvas)] px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
          >
            <option value="">{bound ? 'Use another account…' : 'Use an organization account…'}</option>
            {choices
              .filter((c) => !c.bound)
              .map((c) => (
                <option key={c.account.id} value={c.account.id}>
                  {orgAccountLabel(c.account)} ({c.account.provider})
                </option>
              ))}
          </select>
          <Button size="sm" variant="secondary" disabled={Boolean(gate) || !choice} onClick={() => setConfirm('bind')}>
            Bind
          </Button>
          {bound && (
            <Button size="sm" variant="ghost" disabled={Boolean(gate)} onClick={() => setConfirm('unbind')}>
              Unbind
            </Button>
          )}
        </>
      )}
      <Link to="/integrations" className="text-[11px] text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg-primary)]">
        Manage accounts
      </Link>
      {org.error && <ErrorState reason={org.error.message} />}
      {error && <ErrorState reason={error} />}
      <ConfirmMutationDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'bind' ? `Use ${picked ? orgAccountLabel(picked) : 'this account'} for ${slot}` : `Stop using ${bound ? orgAccountLabel(bound) : 'the account'} for ${slot}`}
        description={
          confirm === 'bind'
            ? `${ingressId} presents this organization account's key as ${slot} from its next fetch. A revoked account makes the ingress fail closed; it never falls back.`
            : `${ingressId} goes back to the value stored on the ingress for ${slot}. The account itself is not revoked.`
        }
        confirmLabel={confirm === 'bind' ? 'Bind' : 'Unbind'}
        onConfirm={async (reason) => {
          const kind = confirm;
          setConfirm(null);
          setError(null);
          try {
            if (kind === 'bind' && picked) {
              await ipc.bindOrgAccount(picked.id, { purpose: 'ingress', consumer_id: ingressId, slot }, reason);
              setChoice('');
            } else if (kind === 'unbind' && bound) {
              await ipc.unbindOrgAccount(bound.id, { purpose: 'ingress', consumer_id: ingressId, slot }, reason);
            }
            refreshAccounts();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
