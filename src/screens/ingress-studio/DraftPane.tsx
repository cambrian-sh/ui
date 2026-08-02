import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { ipc } from '@/ipc';
import type { StudioDraft } from '@/ipc/types';

interface Coverage {
  Samples?: number;
  MappedPaths?: string[];
  UnmappedPaths?: string[];
  DiscardedPaths?: string[];
  MissRates?: Record<string, number>;
}

/**
 * Drafting (plan D1): the model PROPOSES; saving is the separate human action
 * on this pane, and arming lives a tab away behind its own gates. An
 * abstention renders as a first-class outcome with the model's reason — a
 * drafter that cannot say "I don't know" is a drafter that guesses.
 *
 * The confirm half is the coverage report (plan D13): what the draft maps,
 * what it ignores, what it throws away — review is meaningful only when the
 * omissions are visible.
 */
export function DraftPane({
  ingressId,
  readOnly,
  onSaved,
}: {
  ingressId: string;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const capture = useKernelQuery(
    ['studio', 'capture', ingressId],
    () => ipc.studioCaptureStatus(ingressId),
    { refetchInterval: 15_000, staleTime: 0 },
  );
  const [guidance, setGuidance] = useState('');
  const [result, setResult] = useState<StudioDraft | null>(null);
  const [notice, setNotice] = useState('');
  const draft = useMutation(ipc.studioDraftMapping);
  const save = useMutation(ipc.studioSaveSpec);

  const samples = capture.data?.samples ?? 0;
  const coverage: Coverage | null =
    result !== null && result.coverage_json !== '' ? (JSON.parse(result.coverage_json) as Coverage) : null;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
        <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">Draft a mapping</h3>
        <p className="text-[12px] text-[var(--fg-muted)]">
          {samples === 0
            ? 'No captured coverage yet — start capture and send verified traffic first. The drafter abstains on zero samples rather than guessing.'
            : `Drafting reads the schema profile + redacted samples from ${samples} captures. Raw values never reach the model unless a field is explicitly opted in.`}
        </p>
        <Input
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Guidance, e.g. 'track pushes; the actor is the pusher'"
          aria-label="Drafting guidance"
        />
        <Button
          size="sm"
          disabled={readOnly || draft.isLoading || samples === 0}
          onClick={() => {
            setResult(null);
            setNotice('');
            void draft.mutate(ingressId, guidance).then((res) => {
              if (res !== undefined) setResult(res);
            });
          }}
        >
          {draft.isLoading ? 'Drafting…' : 'Draft'}
        </Button>
        {draft.error !== null && <p className="text-[12px] text-[var(--status-err)]">{draft.error}</p>}
        {result !== null && !result.ok && (
          <p className="text-[12px] text-[var(--status-err)]">{result.error}</p>
        )}
      </section>

      {result !== null && result.ok && result.abstained !== '' && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <h3 className="text-[13px] font-medium text-[var(--status-warn)]">The drafter abstained</h3>
          <p className="mt-1 text-[12px] text-[var(--fg-secondary)]">{result.abstained}</p>
          <p className="mt-2 text-[11px] text-[var(--fg-muted)]">
            An abstention is a result, not a failure — capture more variants, sharpen the guidance,
            or author the mapping by hand in Specs.
          </p>
        </section>
      )}

      {result !== null && result.ok && result.spec_json !== '' && (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">
              Proposal
              <span className="ml-2 text-[11px] text-[var(--fg-muted)]">
                {result.first_draft_accepted
                  ? 'first draft'
                  : `${result.corrections} correction round${result.corrections === 1 ? '' : 's'}`}
              </span>
            </h3>
            {!readOnly && (
              <Button
                size="sm"
                disabled={save.isLoading}
                onClick={() => {
                  void save.mutate('mapping', ingressId, result.spec_json).then((res) => {
                    if (res === undefined) return;
                    setNotice(
                      res.ok
                        ? `saved as mapping revision ${res.revision} — confirm on the Lifecycle tab when the coverage below reads right`
                        : res.error,
                    );
                    if (res.ok) onSaved();
                  });
                }}
              >
                Save as revision
              </Button>
            )}
          </div>
          <pre className="max-h-[320px] overflow-auto rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-2 font-mono text-[11px] text-[var(--fg-primary)]">
            {JSON.stringify(JSON.parse(result.spec_json), null, 2)}
          </pre>
          {notice !== '' && (
            <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
              {notice}
            </p>
          )}
        </section>
      )}

      {coverage !== null && (
        <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <h3 className="text-[13px] font-medium text-[var(--fg-primary)]">
            Coverage — the confirm checklist
          </h3>
          <PathList label="Mapped" paths={coverage.MappedPaths ?? []} tone="var(--status-live)" />
          <PathList
            label="Unmapped (observed but ignored — check each is intentional)"
            paths={coverage.UnmappedPaths ?? []}
            tone="var(--status-warn)"
          />
          <PathList
            label="Discarded (named destructive filters)"
            paths={coverage.DiscardedPaths ?? []}
            tone="var(--status-err)"
          />
          {Object.keys(coverage.MissRates ?? {}).length > 0 && (
            <div className="text-[12px]">
              <p className="text-[var(--fg-muted)]">Absence rates across samples</p>
              {Object.entries(coverage.MissRates ?? {}).map(([path, rate]) => (
                <p key={path} className="font-mono text-[11px] text-[var(--fg-secondary)]">
                  {path} — absent in {Math.round(rate * 100)}%
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PathList({ label, paths, tone }: { label: string; paths: string[]; tone: string }) {
  if (paths.length === 0) return null;
  return (
    <div className="text-[12px]">
      <p className="text-[var(--fg-muted)]">{label}</p>
      <p className="font-mono text-[11px]" style={{ color: tone }}>
        {paths.join('  ')}
      </p>
    </div>
  );
}
