import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { formatDuration } from '@/lib/format';

/**
 * Embedding.
 *
 * The one setting on this screen that can invalidate the entire corpus, so it
 * gets a consequence panel rather than a form field.
 *
 * The failure mode is what makes it dangerous: changing the model or the
 * dimensions does not error. Every stored vector was produced by the old model,
 * so retrieval starts returning near-random chunks and every grounded answer in
 * the app becomes quietly wrong — with no error anywhere, and citations that
 * still look like citations.
 */
export function EmbeddingSettings({ canMutate }: { canMutate: boolean }) {
  const gate = useReasonGate();
  const [model, setModel] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [queryPrefix, setQueryPrefix] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Corpus size is real — the document listing serves it. Everything else about
  // the embedder needs a config read the kernel does not offer yet.
  const corpus = useKernelQuery(['documents', 'total'], () => ipc.listDocuments({ limit: 1 }));
  const schema = useKernelQuery(['config-schema'], () => ipc.getConfigSchema(), { retry: 0 });

  const documents = corpus.data?.total_matching ?? null;
  // ~1 chunk/sec is a deliberately coarse public figure; the point of the number
  // is its order of magnitude, and a fake precision would be worse than none.
  const estimateMs = documents != null ? documents * 4 * 1000 : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="type-page-title">Embedding</h2>
        <p className="type-page-description mt-1 max-w-[660px]">
          What turns text into the vectors retrieval searches. Changing it is not like changing
          a threshold.
        </p>
      </div>

      {/* Current state. */}
      <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="type-label text-[var(--fg-muted)]">
          Current
        </h3>
        {schema.error ? (
          <p className="text-[12px] leading-[1.55] text-[var(--fg-muted)]">
            <span className="text-[var(--status-warn)]">
              This kernel does not publish its configuration,
            </span>{' '}
            so the model, dimensions, endpoint and vector count cannot be read back. The corpus
            size below comes from the document listing and is real.
          </p>
        ) : (
          <p className="text-[12px] text-[var(--fg-muted)]">Loading…</p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-[var(--fg-muted)]">Documents</dt>
          <dd className="font-mono">
            {documents != null ? documents.toLocaleString() : 'unknown'}
          </dd>
          <dt className="text-[var(--fg-muted)]">Vectors stored</dt>
          <dd className="font-mono text-[var(--fg-muted)]">not reported by this kernel</dd>
          <dt className="text-[var(--fg-muted)]">Model / dimensions</dt>
          <dd className="font-mono text-[var(--fg-muted)]">not reported by this kernel</dd>
        </dl>
      </section>

      {/* Safe to change, and it says why. */}
      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="text-[13.5px] font-medium">
          Query prefix
          <span className="type-status ml-2 text-[var(--status-live)]">
            Safe to change
          </span>
        </h3>
        <Input
          value={queryPrefix}
          onChange={(e) => setQueryPrefix(e.target.value)}
          placeholder="Represent this sentence for searching relevant passages: "
          aria-label="Query prefix"
          disabled={!canMutate}
        />
        <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
          Applied to <strong>queries only</strong>, never to stored documents. That asymmetry is
          what this model expects, and it is why changing the prefix does not invalidate
          anything: the stored side is untouched, so the next query simply asks better.
        </p>
      </section>

      {/* The danger. */}
      <section
        className="flex flex-col gap-3 rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
        style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
      >
        <div>
          <span className="type-status text-[var(--status-err)]">
            Changing the model invalidates every stored vector
          </span>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
            Every vector in the store was produced by the current model. Under a different model
            — or different dimensions — they no longer mean anything.{' '}
            <strong>Nothing errors.</strong> Retrieval starts returning near-random chunks, and
            every grounded answer in the app becomes quietly wrong while still showing
            citations.
          </p>
        </div>

        <div>
          <div className="type-label mb-1 text-[var(--fg-muted)]">
            If you change it
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-[var(--fg-muted)]">Documents to re-embed</dt>
            <dd className="font-mono">
              {documents != null ? documents.toLocaleString() : 'unknown'}
            </dd>
            <dt className="text-[var(--fg-muted)]">Rough re-embed time</dt>
            <dd className="font-mono">
              {estimateMs != null ? `~${formatDuration(estimateMs)}` : 'unknown'}
            </dd>
            <dt className="text-[var(--fg-muted)]">Retrieval during it</dt>
            <dd>degraded — partially old vectors, partially new</dd>
            <dt className="text-[var(--fg-muted)]">Knowledge graph</dt>
            <dd className="text-[var(--status-live)]">kept — it attaches to documents</dd>
            <dt className="text-[var(--fg-muted)]">Labels</dt>
            <dd className="text-[var(--status-live)]">kept — they attach to documents</dd>
          </dl>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
            New model
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="bge-large-en-v1.5"
              aria-label="New embedding model"
              disabled={!canMutate}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
            Dimensions
            <Input
              value={dimensions}
              onChange={(e) => setDimensions(e.target.value)}
              placeholder="1024"
              aria-label="Dimensions"
              disabled={!canMutate}
            />
            <span className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
              A mismatch is rejected at the first embed, not silently padded — so a wrong number
              here fails loudly rather than corrupting the store.
            </span>
          </label>
        </div>

        <label className="flex items-start gap-2 text-[12px] text-[var(--fg-primary)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmed}
            disabled={!canMutate}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I understand this re-embeds the whole corpus and that retrieval is degraded until it
            finishes.
          </span>
        </label>

        {(model || dimensions) && (
          <ReasonField gate={gate} id="embedding-reason" disabled={!canMutate} />
        )}

        {/* ONE action, not two. A model change without a re-embed leaves the
            store meaningless, so the button does not offer that as a choice. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="danger"
            disabled={
              !canMutate || !confirmed || !gate.satisfied || (!model && !dimensions)
            }
            onClick={() => {
              /* wired when the kernel serves an embedding config + re-embed job */
            }}
          >
            Change model and re-embed
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            One action, deliberately. A model change without a re-embed leaves every stored
            vector meaningless, so it is not offered as a separate step.
          </span>
        </div>

        <p className="text-[11.5px] leading-[1.5] text-[var(--status-warn)]">
          Not wired yet: this kernel serves no embedding configuration and no re-embed job, so
          the button cannot do anything. The panel is built so the consequence is reviewable
          before the capability lands.
        </p>
      </section>
    </div>
  );
}
