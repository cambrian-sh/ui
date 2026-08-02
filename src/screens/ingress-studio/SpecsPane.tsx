import { useCallback, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { useMutation } from '@/lib/useMutation';
import { errorMessage } from '@/lib/errorMessage';
import { ipc } from '@/ipc';
import type { StudioDiff, StudioStatus } from '@/ipc/types';

/**
 * Spec authoring: JSON in, strict kernel-side validation, every save an
 * immutable new revision. The editor deliberately has no client-side schema —
 * the kernel's parser is the single grammar, and its refusals name their
 * constraint, which is exactly what gets rendered next to the editor.
 */
export function SpecsPane({
  ingressId,
  status,
  readOnly,
  onChanged,
}: {
  ingressId: string;
  status: StudioStatus | null;
  readOnly: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-5">
      <SpecEditor
        kind="transport"
        title="Transport spec"
        hint="Endpoint, verifier profile, credential bindings (references only — a value can never appear here), limits, quotas, retention."
        ingressId={ingressId}
        latest={status?.latest_transport_revision ?? 0}
        readOnly={readOnly}
        onChanged={onChanged}
      />
      <SpecEditor
        kind="mapping"
        title="Mapping spec"
        hint="ingress-mapping/v1 — the deterministic transform. Every save is an immutable revision, the unit of repair."
        ingressId={ingressId}
        latest={status?.latest_mapping_revision ?? 0}
        readOnly={readOnly}
        onChanged={onChanged}
      />
      <DiffSection ingressId={ingressId} latest={status?.latest_mapping_revision ?? 0} />
    </div>
  );
}

function SpecEditor({
  kind,
  title,
  hint,
  ingressId,
  latest,
  readOnly,
  onChanged,
}: {
  kind: 'transport' | 'mapping';
  title: string;
  hint: string;
  ingressId: string;
  latest: number;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [refusal, setRefusal] = useState('');
  const save = useMutation(ipc.studioSaveSpec);

  const loadLatest = useCallback(async () => {
    setRefusal('');
    setNotice('');
    try {
      const spec = await ipc.studioGetRevision(kind, ingressId, latest);
      if (spec.ok) {
        setText(JSON.stringify(JSON.parse(spec.spec_json), null, 2));
        setNotice(`loaded revision ${spec.revision}`);
      } else {
        setRefusal(spec.error);
      }
    } catch (e) {
      setRefusal(errorMessage(e));
    }
  }, [kind, ingressId, latest]);

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">
          {title}
          {latest > 0 && (
            <span className="ml-2 text-[11px] text-[var(--fg-muted)]">latest r{latest}</span>
          )}
        </h3>
        <Button size="sm" variant="secondary" onClick={() => void loadLatest()} disabled={latest === 0}>
          Load latest
        </Button>
      </div>
      <p className="text-[12px] text-[var(--fg-muted)]">{hint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={readOnly}
        rows={10}
        spellCheck={false}
        aria-label={`${title} JSON`}
        className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 font-mono text-[12px] text-[var(--fg-primary)]"
      />
      {!readOnly && (
        <Button
          size="sm"
          disabled={save.isLoading || text.trim() === ''}
          onClick={() => {
            setRefusal('');
            setNotice('');
            void save.mutate(kind, ingressId, text).then((res) => {
              if (res === undefined) return;
              if (res.ok) {
                setNotice(`saved as revision ${res.revision} — earlier revisions are immutable`);
                onChanged();
              } else {
                setRefusal(res.error);
              }
            });
          }}
        >
          Save as new revision
        </Button>
      )}
      {save.error !== null && <p className="text-[12px] text-[var(--status-err)]">{save.error}</p>}
      {refusal !== '' && <p className="text-[12px] text-[var(--status-err)]">{refusal}</p>}
      {notice !== '' && (
        <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
          {notice}
        </p>
      )}
    </section>
  );
}

function DiffSection({ ingressId, latest }: { ingressId: string; latest: number }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [diff, setDiff] = useState<StudioDiff | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    setDiff(null);
    try {
      const d = await ipc.studioDiffMapping(ingressId, Number(from), Number(to));
      if (d.ok) setDiff(d);
      else setError(d.error);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Diff mapping revisions</h3>
      <div className="flex items-center gap-2">
        <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from rev" aria-label="From revision" />
        <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={`to rev (latest ${latest})`} aria-label="To revision" />
        <Button size="sm" onClick={() => void run()} disabled={from === '' || to === ''}>
          Diff
        </Button>
      </div>
      {error !== '' && <p className="text-[12px] text-[var(--status-err)]">{error}</p>}
      {diff !== null && (
        <div className="space-y-1 text-[12px]">
          {diff.added.length + diff.removed.length + diff.changed.length === 0 && (
            <p className="text-[var(--fg-muted)]">No field-level differences.</p>
          )}
          {diff.added.map((c) => (
            <p key={`a-${c.target}`}>
              <span className="text-[var(--status-live)]">+ {c.target}</span>{' '}
              <span className="text-[var(--fg-secondary)]">{c.to}</span>
            </p>
          ))}
          {diff.removed.map((c) => (
            <p key={`r-${c.target}`}>
              <span className="text-[var(--status-err)]">− {c.target}</span>{' '}
              <span className="text-[var(--fg-secondary)]">{c.from}</span>
            </p>
          ))}
          {diff.changed.map((c) => (
            <p key={`c-${c.target}`}>
              <span className="text-[var(--status-warn)]">~ {c.target}</span>{' '}
              <span className="text-[var(--fg-secondary)]">
                {c.from} → {c.to}
              </span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
