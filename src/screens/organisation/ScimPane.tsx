import { useEffect, useReducer, useState } from 'react';
import { Button, ErrorState, ReasonField, useReasonGate } from '@/design-system/components';
import { ipc } from '@/ipc';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { useCommandGate } from '@/lib/useCommandGate';
import { initialScimSecret, scimSecretReducer } from '@/lib/hierarchy';
import type { ScimConnection } from '@/ipc/types-hierarchy';
import { Notice, Section, TextField, formatTime } from './shared';

const refresh = () => void queryClient.invalidateQueries({ queryKey: ['org', 'scim'] });

/**
 * SCIM connections (ADR-0142 D5): one bearer per directory. The bearer is in
 * the create/rotate ANSWER only; it lives in this component's state until the
 * person dismisses the dialog and is never cached, stored or logged.
 */
export function ScimPane() {
  const conns = useKernelQuery(['org', 'scim'], () => ipc.listScimConnections());
  const gate = useCommandGate('manage SCIM connections');
  const [secret, dispatch] = useReducer(scimSecretReducer, initialScimSecret);
  const reason = useReasonGate();
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const create = useMutation(ipc.createScimConnection);
  const rotate = useMutation(ipc.rotateScimToken);
  const revoke = useMutation(ipc.revokeScimConnection);
  const busy = create.isLoading || rotate.isLoading || revoke.isLoading;

  // Leaving the screen forgets an undismissed bearer too.
  useEffect(() => () => dispatch({ type: 'dismiss' }), []);

  const onCreate = async () => {
    const s = await create.mutate(name.trim(), issuer.trim(), reason.reason);
    if (s) {
      dispatch({ type: 'issued', issued: s });
      setName('');
      setIssuer('');
      reason.reset();
      refresh();
    }
  };
  const onRotate = async (c: ScimConnection) => {
    const s = await rotate.mutate(c.id, reason.reason);
    if (s) {
      dispatch({ type: 'issued', issued: s });
      reason.reset();
      refresh();
    }
  };
  const onRevoke = async (c: ScimConnection) => {
    if (await revoke.mutate(c.id, reason.reason)) {
      reason.reset();
      refresh();
    }
  };
  const err = create.error ?? rotate.error ?? revoke.error ?? conns.error?.message;

  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-[26px] py-4">
      {secret.issued && (
        <div role="dialog" aria-modal="false" aria-labelledby="scim-secret-h" className="flex flex-col gap-2 rounded-md p-3 tint-wash tint-ring" style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}>
          <h2 id="scim-secret-h" className="text-[13px] font-semibold">
            Bearer token for {secret.issued.connection?.name} — shown once
          </h2>
          <p className="text-[12px]">
            Copy it into the directory&rsquo;s SCIM provisioning settings now. Cambrian keeps it only in its secret store and
            will never show it again; if it is lost, rotate it.
          </p>
          {secret.issued.connection?.base_url ? (
            <p className="text-[12px]">
              SCIM base URL: <code>{secret.issued.connection.base_url}</code>
            </p>
          ) : (
            <Notice tone="warn">The kernel&rsquo;s SCIM listener is off, so there is no base URL yet. An administrator must enable it.</Notice>
          )}
          <label htmlFor="scim-token" className="text-[11.5px] text-[var(--fg-secondary)]">
            Token
          </label>
          <input
            id="scim-token"
            readOnly
            value={secret.issued.token}
            autoComplete="off"
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-[12px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(secret.issued!.token).then(() => dispatch({ type: 'copied' }));
              }}
            >
              {secret.copied ? 'Copied' : 'Copy token'}
            </Button>
            <Button size="sm" onClick={() => dispatch({ type: 'dismiss' })}>
              I have stored it — done
            </Button>
          </div>
        </div>
      )}

      {err && <ErrorState reason={err} whatToDo="Nothing was changed." />}
      {!gate && <ReasonField gate={reason} id="scim-reason" note="Required for create, rotate and revoke; it lands in the audit log." />}

      <Section title="Connections">
        <ul className="flex flex-col gap-2">
          {(conns.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium">
                  {c.name} {c.revoked && <span className="text-[11px] text-[var(--status-err)]">revoked</span>}
                </span>
                <span className="text-[11.5px] text-[var(--fg-muted)]">
                  token …{c.token_last4 || '????'} · {c.users} users · {c.groups} groups · last push {formatTime(c.last_used_at_unix_ms)}
                  {c.oidc_issuer && ` · links sign-ins from ${c.oidc_issuer}`}
                </span>
              </div>
              {!c.revoked && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={Boolean(gate) || !reason.satisfied || busy} title={gate} onClick={() => void onRotate(c)}>
                    Rotate token
                  </Button>
                  <Button size="sm" variant="danger" disabled={Boolean(gate) || !reason.satisfied || busy} title={gate} onClick={() => void onRevoke(c)}>
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          ))}
          {conns.data?.length === 0 && <li className="text-[12px] text-[var(--fg-muted)]">No directory pushes to this kernel yet.</li>}
        </ul>
      </Section>

      <Section title="Connect a directory">
        <TextField id="scim-name" label="Name" value={name} onChange={setName} disabled={Boolean(gate)} placeholder="Entra ID" />
        <TextField
          id="scim-issuer"
          label="OIDC issuer of the same directory (optional)"
          value={issuer}
          onChange={setIssuer}
          disabled={Boolean(gate)}
          hint="When set, a provisioned person who signs in through this issuer is the same person."
        />
        <Button size="sm" className="self-start" disabled={Boolean(gate) || !name.trim() || !reason.satisfied || busy} title={gate} onClick={() => void onCreate()}>
          Create connection
        </Button>
      </Section>
    </div>
  );
}
