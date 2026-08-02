import { useState } from 'react';
import { Button, Input, ReasonField, useReasonGate } from '@/design-system/components';
import { Checkbox } from '@/design-system/components/ui/checkbox';
import { useMutation } from '@/lib/useMutation';
import { ipc } from '@/ipc';
import type { StudioAck, StudioStatus } from '@/ipc/types';

/**
 * The lifecycle pane: where a human moves an ingress through the state
 * machine. Buttons appear by state, but LEGALITY is the kernel's call — a
 * refused move renders its named reason right here, never a toast.
 */
export function LifecyclePane({
  ingressId,
  state,
  status,
  readOnly,
  onChanged,
}: {
  ingressId: string;
  state: string;
  status: StudioStatus | null;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [ack, setAck] = useState<StudioAck | null>(null);
  const lifecycle = useMutation(ipc.studioLifecycle);
  const arm = useMutation(ipc.studioArm);
  const rollback = useMutation(ipc.studioRollback);

  const run = async (verb: string, reason = '') => {
    setAck(null);
    const res = await lifecycle.mutate(verb, ingressId, reason);
    if (res !== undefined) {
      setAck(res);
      if (res.ok) onChanged();
    }
  };

  const retireGate = useReasonGate();
  const [retiring, setRetiring] = useState(false);

  const armReasonGate = useReasonGate();
  const [armTransport, setArmTransport] = useState('');
  const [armMapping, setArmMapping] = useState('');

  const rollbackGate = useReasonGate();
  const [rollbackRelease, setRollbackRelease] = useState('');
  const [rollbackResume, setRollbackResume] = useState(true);

  return (
    <div className="space-y-5">
      {status !== null && <StatusCard status={status} readOnly={readOnly} onChanged={onChanged} />}

      {!readOnly && (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Lifecycle</h3>
          <div className="flex flex-wrap gap-2">
            {state === 'DRAFT' && (
              <Button size="sm" onClick={() => void run('start_capture')} disabled={lifecycle.isLoading}>
                Start capture
              </Button>
            )}
            {state === 'CAPTURING' && (
              <Button size="sm" onClick={() => void run('confirm_mapping')} disabled={lifecycle.isLoading}>
                Confirm mapping
              </Button>
            )}
            {state === 'MAPPED' && (
              <Button size="sm" onClick={() => void run('start_dry_run')} disabled={lifecycle.isLoading}>
                Start dry run
              </Button>
            )}
            {state === 'ARMED' && (
              <Button size="sm" variant="secondary" onClick={() => void run('pause')} disabled={lifecycle.isLoading}>
                Pause
              </Button>
            )}
            {state === 'PAUSED' && (
              <Button size="sm" onClick={() => void run('resume')} disabled={lifecycle.isLoading}>
                Resume
              </Button>
            )}
            {state !== 'RETIRED' && (
              <Button size="sm" variant="secondary" onClick={() => setRetiring((v) => !v)}>
                Retire…
              </Button>
            )}
          </div>

          {retiring && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
              <p className="text-[12px] text-[var(--fg-secondary)]">
                Retiring is terminal: a retired ingress is recreated under a new id, never revived.
                Its archive and projections remain readable.
              </p>
              <ReasonField gate={retireGate} id="retire-reason" note="Recorded beside the terminal transition." />
              <Button
                size="sm"
                variant="danger"
                disabled={!retireGate.satisfied || lifecycle.isLoading}
                onClick={() => {
                  void run('retire', retireGate.reason).then(() => {
                    setRetiring(false);
                    retireGate.reset();
                  });
                }}
              >
                Retire permanently
              </Button>
            </div>
          )}

          {state === 'DRY_RUN' && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
              <p className="text-[12px] font-medium text-[var(--fg-primary)]">Arm</p>
              <p className="text-[12px] text-[var(--fg-secondary)]">
                Arming mints an immutable release from the named revisions and pins it. An armed
                door always runs exactly this pairing — editing later mints a new draft, never a
                change in place.
              </p>
              <div className="flex gap-2">
                <Input
                  value={armTransport}
                  onChange={(e) => setArmTransport(e.target.value)}
                  placeholder={`transport rev (latest ${status?.latest_transport_revision ?? '?'})`}
                  aria-label="Transport revision"
                />
                <Input
                  value={armMapping}
                  onChange={(e) => setArmMapping(e.target.value)}
                  placeholder={`mapping rev (latest ${status?.latest_mapping_revision ?? '?'})`}
                  aria-label="Mapping revision"
                />
              </div>
              <ReasonField gate={armReasonGate} id="arm-reason" note="Recorded beside the release." />
              <Button
                size="sm"
                disabled={!armReasonGate.satisfied || arm.isLoading || armTransport === '' || armMapping === ''}
                onClick={() => {
                  setAck(null);
                  void arm
                    .mutate(ingressId, Number(armTransport), Number(armMapping), armReasonGate.reason)
                    .then((res) => {
                      if (res !== undefined) {
                        setAck(res);
                        if (res.ok) {
                          armReasonGate.reset();
                          onChanged();
                        }
                      }
                    });
                }}
              >
                Arm
              </Button>
            </div>
          )}

          {state === 'PAUSED' && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
              <p className="text-[12px] font-medium text-[var(--fg-primary)]">Rollback</p>
              <p className="text-[12px] text-[var(--fg-secondary)]">
                Rolling back re-pins an EXISTING release — pinning older, never editing.
                {status?.release_id !== '' && ` Currently pinned: ${status?.release_id}.`}
              </p>
              <Input
                value={rollbackRelease}
                onChange={(e) => setRollbackRelease(e.target.value)}
                placeholder="release id, e.g. rel_1a2b3c"
                aria-label="Release id"
              />
              <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
                <Checkbox
                  checked={rollbackResume}
                  onCheckedChange={(v) => setRollbackResume(v === true)}
                />
                Resume immediately after the pin
              </label>
              <ReasonField gate={rollbackGate} id="rollback-reason" note="Recorded beside the re-pin." />
              <Button
                size="sm"
                disabled={!rollbackGate.satisfied || rollback.isLoading || rollbackRelease.trim() === ''}
                onClick={() => {
                  setAck(null);
                  void rollback
                    .mutate(ingressId, rollbackRelease.trim(), rollbackGate.reason, rollbackResume)
                    .then((res) => {
                      if (res !== undefined) {
                        setAck(res);
                        if (res.ok) {
                          rollbackGate.reset();
                          setRollbackRelease('');
                          onChanged();
                        }
                      }
                    });
                }}
              >
                Roll back
              </Button>
            </div>
          )}

          {lifecycle.error !== null && (
            <p className="text-[12px] text-[var(--status-err)]">{lifecycle.error}</p>
          )}
          {arm.error !== null && <p className="text-[12px] text-[var(--status-err)]">{arm.error}</p>}
          {rollback.error !== null && (
            <p className="text-[12px] text-[var(--status-err)]">{rollback.error}</p>
          )}
          {ack !== null && (
            <p
              role="status"
              className={
                ack.ok ? 'text-[12px] text-[var(--fg-secondary)]' : 'text-[12px] text-[var(--status-err)]'
              }
            >
              {ack.ok ? ack.detail : ack.error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function StatusCard({
  status,
  readOnly,
  onChanged,
}: {
  status: StudioStatus;
  readOnly: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--fg-primary)]">Status</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
        <Fact label="Transport revisions" value={String(status.latest_transport_revision)} />
        <Fact label="Mapping revisions" value={String(status.latest_mapping_revision)} />
        <Fact
          label="Pinned release"
          value={
            status.release_id === ''
              ? '— (arms on first release)'
              : `${status.release_id} (t${status.armed_transport_revision} · m${status.armed_mapping_revision})`
          }
        />
        <Fact label="Capture samples" value={String(status.capture_samples)} />
        <Fact label="Delivery failures" value={String(status.failure_count)} />
      </dl>
      <CredentialList ingressId={status.summary.ingress_id} status={status} readOnly={readOnly} onChanged={onChanged} />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg-primary)]">{value}</dd>
    </div>
  );
}

/**
 * Credentials are WRITE-ONLY end to end: the input clears on both success and
 * failure, and the only thing ever rendered back is presence + last four.
 */
function CredentialList({
  ingressId,
  status,
  readOnly,
  onChanged,
}: {
  ingressId: string;
  status: StudioStatus;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [acks, setAcks] = useState<Record<string, string>>({});
  const set = useMutation(ipc.studioSetCredential);
  const clear = useMutation(ipc.studioClearCredential);
  const clearGate = useReasonGate();
  const [clearing, setClearing] = useState('');

  if (status.credentials.length === 0) {
    return (
      <p className="mt-3 text-[12px] text-[var(--fg-muted)]">
        No credential bindings yet — the transport spec declares them.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-[12px] font-medium text-[var(--fg-primary)]">Credentials</h4>
      {status.credentials.map((c) => (
        <div key={c.name} className="space-y-1">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-[var(--fg-primary)]">{c.name}</span>
            {c.configured ? (
              <span className="text-[var(--status-live)]">configured ····{c.last_four}</span>
            ) : (
              <span className="text-[var(--status-warn)]">not configured — deliveries answer 503</span>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={values[c.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                placeholder="new value (write-only)"
                aria-label={`Credential ${c.name}`}
              />
              <Button
                size="sm"
                disabled={set.isLoading || (values[c.name] ?? '') === ''}
                onClick={() => {
                  void set.mutate(ingressId, c.name, values[c.name] ?? '').then((res) => {
                    // Cleared on BOTH outcomes: a secret never lingers in a field.
                    setValues((v) => ({ ...v, [c.name]: '' }));
                    if (res !== undefined) {
                      setAcks((a) => ({ ...a, [c.name]: res.ok ? res.detail : res.error }));
                      if (res.ok) onChanged();
                    }
                  });
                }}
              >
                Store
              </Button>
              {c.configured && (
                <Button size="sm" variant="secondary" onClick={() => setClearing(clearing === c.name ? '' : c.name)}>
                  Clear…
                </Button>
              )}
            </div>
          )}
          {clearing === c.name && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-2">
              <ReasonField
                gate={clearGate}
                id={`clear-${c.name}`}
                note="Clearing can take a live ingress down; deliveries answer 503 until a new value is set."
              />
              <Button
                size="sm"
                variant="danger"
                disabled={!clearGate.satisfied || clear.isLoading}
                onClick={() => {
                  void clear.mutate(ingressId, c.name, clearGate.reason).then((res) => {
                    clearGate.reset();
                    setClearing('');
                    if (res !== undefined) {
                      setAcks((a) => ({ ...a, [c.name]: res.ok ? res.detail : res.error }));
                      if (res.ok) onChanged();
                    }
                  });
                }}
              >
                Clear credential
              </Button>
            </div>
          )}
          {(acks[c.name] ?? '') !== '' && (
            <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
              {acks[c.name]}
            </p>
          )}
        </div>
      ))}
      {set.error !== null && <p className="text-[12px] text-[var(--status-err)]">{set.error}</p>}
      {clear.error !== null && <p className="text-[12px] text-[var(--status-err)]">{clear.error}</p>}
    </div>
  );
}
