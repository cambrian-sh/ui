import { useState } from 'react';
import { Button, Input, ReasonField, useReasonGate } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { errorMessage } from '@/lib/errorMessage';
import { ipc } from '@/ipc';
import type { StudioAck, StudioStatus } from '@/ipc/types';

/**
 * Operations: the dry-run preview, the repair loop, and delivery failures —
 * the running half of the studio.
 */
export function OperationsPane({
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
  return (
    <div className="space-y-4">
      {state === 'DRY_RUN' && <PreviewSection ingressId={ingressId} />}
      <RepairSection
        ingressId={ingressId}
        latest={status?.latest_mapping_revision ?? 0}
        readOnly={readOnly}
        onChanged={onChanged}
      />
      <FailuresSection ingressId={ingressId} />
    </div>
  );
}

/**
 * The DRY_RUN buffer: real deliveries, evaluated through the latest mapping,
 * ephemeral by design — memory only, capped, gone on restart. Polled fast
 * because this is the pane an operator watches while sending test traffic.
 */
function PreviewSection({ ingressId }: { ingressId: string }) {
  const preview = useKernelQuery(['studio', 'preview', ingressId], () => ipc.studioPreview(ingressId), {
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const entries = preview.data ?? [];
  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Dry-run preview</h3>
      <p className="text-[12px] text-[var(--fg-muted)]">
        Live deliveries evaluated, never preserved and never projected. Ephemeral: this buffer is
        memory-only and clears on kernel restart. Polled every 5 s.
      </p>
      {entries.length === 0 && (
        <p className="text-[12px] text-[var(--fg-secondary)]">
          Nothing yet — send signed test traffic at the transport path.
        </p>
      )}
      {entries
        .slice()
        .reverse()
        .map((e) => (
          <div key={e.delivery_ref + e.received_at} className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-2 text-[12px]">
            <p>
              <span className="font-mono text-[var(--fg-primary)]">{e.delivery_ref}</span>{' '}
              <span
                style={{
                  color:
                    e.outcome === 'projected'
                      ? 'var(--status-live)'
                      : e.outcome === 'discarded'
                        ? 'var(--status-warn)'
                        : 'var(--status-err)',
                }}
              >
                {e.outcome}
              </span>{' '}
              <span className="text-[var(--fg-muted)]">{e.received_at}</span>
            </p>
            {e.detail !== '' && <p className="text-[var(--fg-secondary)]">{e.detail}</p>}
            {e.envelopes_json !== '' && (
              <pre className="mt-1 max-h-[160px] overflow-auto font-mono text-[11px] text-[var(--fg-secondary)]">
                {JSON.stringify(JSON.parse(e.envelopes_json), null, 1)}
              </pre>
            )}
          </div>
        ))}
    </section>
  );
}

interface RepairPreview {
  EvidenceExamined?: number;
  Unchanged?: number;
  Additions?: unknown[];
  Removals?: unknown[];
  Changes?: unknown[];
  NewRefusals?: { DeliveryRef?: string; Detail?: string }[];
  ResolvedRefusals?: unknown[];
  NewDiscards?: { DeliveryRef?: string; Detail?: string }[];
}

/**
 * The repair loop (plan D11/D14): shadow first — the diff is the review
 * artifact and the shadow writes NOTHING — then promotion behind a mandatory
 * reason. Old projections are retired by record, never overwritten.
 */
function RepairSection({
  ingressId,
  latest,
  readOnly,
  onChanged,
}: {
  ingressId: string;
  latest: number;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [revision, setRevision] = useState('');
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [error, setError] = useState('');
  const [ack, setAck] = useState<StudioAck | null>(null);
  const gate = useReasonGate();
  const promote = useMutation(ipc.studioPromoteRepair);

  const shadow = async () => {
    setError('');
    setPreview(null);
    setAck(null);
    try {
      const json = await ipc.studioShadowReprocess(ingressId, Number(revision));
      setPreview(JSON.parse(json) as RepairPreview);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Repair (shadow reprocessing)</h3>
      <p className="text-[12px] text-[var(--fg-muted)]">
        Because the raw delivery is the archive, a mapping fix replays original bytes. Shadow
        writes nothing — its diff is what you review. Promotion writes corrected projections
        BESIDE the old ones and retires them by record.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          placeholder={`candidate mapping rev (latest ${latest})`}
          aria-label="Candidate mapping revision"
        />
        <Button size="sm" onClick={() => void shadow()} disabled={revision === ''}>
          Shadow
        </Button>
      </div>
      {error !== '' && <p className="text-[12px] text-[var(--status-err)]">{error}</p>}

      {preview !== null && (
        <div className="space-y-2">
          <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-6">
            <Stat label="examined" value={preview.EvidenceExamined ?? 0} />
            <Stat label="unchanged" value={preview.Unchanged ?? 0} />
            <Stat label="additions" value={(preview.Additions ?? []).length} />
            <Stat label="removals" value={(preview.Removals ?? []).length} />
            <Stat label="changes" value={(preview.Changes ?? []).length} />
            <Stat label="new refusals" value={(preview.NewRefusals ?? []).length} />
          </dl>
          {(preview.NewRefusals ?? []).map((r, i) => (
            <p key={i} className="text-[12px] text-[var(--status-warn)]">
              {r.DeliveryRef}: {r.Detail}
            </p>
          ))}
          {(preview.NewDiscards ?? []).map((r, i) => (
            <p key={i} className="text-[12px] text-[var(--status-warn)]">
              {r.DeliveryRef}: {r.Detail}
            </p>
          ))}
          {!readOnly && (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
              <ReasonField
                gate={gate}
                id="promote-reason"
                note="Promotion rewrites which projections are current for repaired deliveries. The superseded ones remain readable."
              />
              <Button
                size="sm"
                disabled={!gate.satisfied || promote.isLoading}
                onClick={() => {
                  void promote.mutate(ingressId, Number(revision), gate.reason).then((res) => {
                    if (res !== undefined) {
                      setAck(res);
                      if (res.ok) {
                        gate.reset();
                        onChanged();
                      }
                    }
                  });
                }}
              >
                Promote repair
              </Button>
              {promote.error !== null && (
                <p className="text-[12px] text-[var(--status-err)]">{promote.error}</p>
              )}
              {ack !== null && (
                <p
                  role="status"
                  className={
                    ack.ok
                      ? 'text-[12px] text-[var(--fg-secondary)]'
                      : 'text-[12px] text-[var(--status-err)]'
                  }
                >
                  {ack.ok ? ack.detail : ack.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg-primary)]">{value}</dd>
    </div>
  );
}

function FailuresSection({ ingressId }: { ingressId: string }) {
  const failures = useKernelQuery(
    ['studio', 'failures', ingressId],
    () => ipc.studioDeliveryFailures(ingressId),
    { refetchInterval: 15_000, staleTime: 0 },
  );
  const rows = failures.data ?? [];
  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Delivery failures</h3>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-secondary)]">
          None — every preserved delivery projected under its armed revision.
        </p>
      ) : (
        rows.map((f) => (
          <div key={f.evidence_id + String(f.mapping_revision)} className="text-[12px]">
            <p>
              <span className="font-mono text-[var(--fg-primary)]">{f.delivery_ref}</span>{' '}
              <span
                style={{
                  color: f.outcome === 'refused' ? 'var(--status-warn)' : 'var(--status-err)',
                }}
              >
                {f.outcome}
              </span>{' '}
              <span className="text-[var(--fg-muted)]">
                r{f.mapping_revision} · {f.finished_at}
              </span>
            </p>
            <p className="text-[var(--fg-secondary)]">{f.detail}</p>
          </div>
        ))
      )}
      <p className="text-[11px] text-[var(--fg-muted)]">
        A refusal is permanent for that revision — repair is a NEW revision promoted over the
        archive, never a retry.
      </p>
    </section>
  );
}
