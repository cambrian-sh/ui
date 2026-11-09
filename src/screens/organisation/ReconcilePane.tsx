import { Button, ErrorState, ReasonField, useReasonGate } from '@/design-system/components';
import { ipc } from '@/ipc';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { useCommandGate } from '@/lib/useCommandGate';
import { Notice, Section, formatTime } from './shared';

/** The Keycloak reconcile adapter's status (ADR-0142 D5: leavers and moves). */
export function ReconcilePane() {
  const status = useKernelQuery(['org', 'reconcile'], () => ipc.getReconcileStatus());
  const gate = useCommandGate('run a directory sync');
  const reason = useReasonGate();
  const run = useMutation(ipc.runReconcileNow);
  const s = status.data;
  return (
    <div className="flex max-w-[720px] flex-col gap-4 px-[26px] py-4">
      {status.error && <ErrorState reason={status.error.message} whatToDo="The sync status could not be read." />}
      {s && !s.enabled && (
        <Notice>
          No identity-provider sync is configured. People arrive by SCIM push, by signing in, or through this editor.
        </Notice>
      )}
      {s && s.enabled && (
        <Section title={`${s.provider || 'Identity provider'} sync · ${s.realm}`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-[var(--fg-muted)]">Provider</dt>
            <dd className="break-all font-mono">{s.base_url}</dd>
            <dt className="text-[var(--fg-muted)]">State</dt>
            <dd className={s.last_error ? 'text-[var(--status-err)]' : ''}>{s.running ? 'running now' : s.last_error ? 'last run failed' : 'idle'}</dd>
            <dt className="text-[var(--fg-muted)]">Last run</dt>
            <dd>{formatTime(s.last_run_at_unix_ms)}</dd>
            <dt className="text-[var(--fg-muted)]">Last success</dt>
            <dd>{formatTime(s.last_ok_at_unix_ms)}</dd>
            <dt className="text-[var(--fg-muted)]">Next run</dt>
            <dd>{formatTime(s.next_run_at_unix_ms)}</dd>
            <dt className="text-[var(--fg-muted)]">Seen</dt>
            <dd>
              {s.users_seen} users · {s.groups_seen} groups
            </dd>
            <dt className="text-[var(--fg-muted)]">Last changes</dt>
            <dd>
              {s.created} created · {s.updated} updated · {s.suspended} suspended
            </dd>
          </dl>
          {s.last_error && <Notice tone="warn">Last error: {s.last_error}</Notice>}
          {!gate && <ReasonField gate={reason} id="reconcile-reason" />}
          {run.error && <ErrorState reason={run.error} whatToDo="The sync did not start." />}
          <Button
            size="sm"
            className="self-start"
            disabled={Boolean(gate) || !reason.satisfied || run.isLoading || s.running}
            title={gate}
            onClick={() =>
              void run.mutate(reason.reason).then((r) => {
                if (r) {
                  reason.reset();
                  queryClient.setQueryData(['org', 'reconcile'], r);
                }
              })
            }
          >
            Sync now
          </Button>
        </Section>
      )}
    </div>
  );
}
