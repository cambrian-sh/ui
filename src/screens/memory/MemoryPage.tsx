import { useState } from 'react';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { IngestPane } from './IngestPane';
import { InspectTab } from './InspectTab';
import { AskPane } from './AskPane';
import { useIngestQueue } from './useIngestQueue';
import { cn } from '@/design-system/lib/utils';

type LeftTab = 'ingest' | 'inspect';

const CONNECTION_LABEL: Record<string, string> = {
  live: 'live',
  reconnecting: 'reconnecting',
  down: 'down',
};

const CONNECTION_CLASS: Record<string, string> = {
  live: 'text-[var(--status-ok)]',
  reconnecting: 'text-[var(--status-warn)]',
  down: 'text-[var(--status-err)]',
};

export function MemoryPage() {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const [tab, setTab] = useState<LeftTab>('ingest');

  const memoryWritten = state?.memory_written ?? [];
  const { rows, enqueue, enqueueFile } = useIngestQueue(memoryWritten);

  const connection = state?.connection.status ?? 'down';
  const isOperator = state?.role === 'operator';
  const connectionDown = connection !== 'live';

  const mutationsDisabled = connectionDown || !isOperator;
  const mutationsDisabledReason = connectionDown
    ? connection === 'reconnecting'
      ? 'Reconnecting…'
      : 'Kernel unreachable'
    : isOperator
      ? undefined
      : 'Operator role required.';

  const capabilities = state?.capabilities ?? [];
  const canUploadFiles = capabilities.includes('memory-ingest-binary');
  const canAnswer = capabilities.includes('memory-answer');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
        <h1 className="text-sm font-semibold tracking-tight">Memory</h1>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--fg-muted)]">
          <span className={CONNECTION_CLASS[connection]}>
            ● {CONNECTION_LABEL[connection]}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            kernel {state?.kernel_version || '—'} · {state?.contract_version || '—'}
          </span>
        </div>
      </header>

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[380px_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--border-subtle)]">
          <div
            role="tablist"
            aria-label="Memory left pane"
            className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-2 py-1"
          >
            {(['ingest', 'inspect'] as LeftTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-sm px-2 py-0.5 text-[11px] capitalize',
                  tab === t
                    ? 'bg-[var(--bg-elevated)] text-[var(--fg-primary)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tab === 'ingest' ? (
              <IngestPane
                rows={rows}
                onIngest={enqueue}
                onIngestFile={enqueueFile}
                canUploadFiles={canUploadFiles}
                disabled={mutationsDisabled}
                disabledReason={mutationsDisabledReason}
              />
            ) : (
              <InspectTab events={memoryWritten} />
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <AskPane
            disabled={mutationsDisabled}
            disabledReason={mutationsDisabledReason}
            canAnswer={canAnswer}
          />
        </main>
      </div>
    </div>
  );
}
