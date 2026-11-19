import { useState } from 'react';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { IngestPane } from './IngestPane';
import { InspectTab } from './InspectTab';
import { AskPane } from './AskPane';
import { useIngestQueue } from './useIngestQueue';
import { useVocabulary } from '@/screens/scope/useVocabulary';
import { uploadVocabulary, useWriteCeiling } from './useWriteCeiling';
import { cn } from '@/design-system/lib/utils';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { MobileCapture } from './MobileCapture';
import { NotesPane } from './NotesPane';
import { PageHeader } from '@/design-system/components';

type LeftTab = 'ingest' | 'inspect';

export function MemoryPage() {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const [tab, setTab] = useState<LeftTab>('ingest');
  const isMobile = useBreakpoint() === 'mobile';
  // On a phone the two-pane console does not fit and does not make sense: Ask is
  // what the tab bar points at, and Capture is a separate, much smaller job.
  const [mobileTab, setMobileTab] = useState<'ask' | 'capture'>('ask');
  // ADR-0139 D14: principal memory notes, a second section beside documents.
  const [section, setSection] = useState<'documents' | 'notes'>('documents');

  const memoryWritten = state?.memory_written ?? [];
  // Contract 0111 (ENG-2143): a large upload is accepted and embedded in the
  // background; with `ingest-status` the queue follows it to searchable / failed.
  // Absent the capability the queue behaves as before (the call returning = indexed).
  const { rows, enqueue, enqueueFile } = useIngestQueue(memoryWritten, {
    ingestStatus: (state?.capabilities ?? []).includes('ingest-status'),
  });

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
  const canDateEvents = capabilities.includes('memory-event-time');
  // Contract 0100 (ADR-0138 B1): the kernel keys uploads by name; ask before replacing.
  const canReplaceUploads = capabilities.includes('upload-replace');
  // The vocabulary lives behind the access-policy plugin — it is the same list the
  // scope console selects from, because a label applied at ingest and a label applied
  // afterwards must be the same term or the rule written about it reaches only half
  // the corpus. Absent the plugin this reports "not configured" and the picker
  // correctly falls back to free entry.
  const vocabulary = useVocabulary(capabilities.includes('access-policy'));
  // ENG-2161: the operator's own write ceiling. When it holds a closed label the
  // kernel refuses an unlabelled upload, so the forms ask for a classification —
  // chosen from the ceiling — before sending.
  const writeCeiling = useWriteCeiling(capabilities.includes('access-policy') && isOperator);
  const ingestVocabulary = uploadVocabulary(vocabulary, writeCeiling);
  const classificationRequired = writeCeiling?.classification_required === true;
  const hasNotes = capabilities.includes('memory-notes');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The connection and kernel version used to be repeated here; the app
          header already carries both, so this header carries only what is
          specific to Memory. */}
      <PageHeader
        divider
        title="Memory"
        description="Add documents, then ask questions that are answered from them, with every claim linked to its source."
        actions={hasNotes ? (
          <div role="tablist" aria-label="Memory section" className="flex items-center gap-1">
            {(['documents', 'notes'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={section === t}
                onClick={() => setSection(t)}
                className={cn(
                  'rounded-sm px-2 py-0.5 text-[12px] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  section === t
                    ? 'bg-[var(--bg-elevated)] text-[var(--fg-primary)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        ) : undefined}
      />

      {hasNotes && section === 'notes' ? (
        <div className="min-h-0 flex-1">
          <NotesPane />
        </div>
      ) : isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            role="tablist"
            aria-label="Memory"
            className="flex flex-none items-center gap-1 px-3 py-2 shadow-[inset_0_-1px_0_var(--border-subtle)]"
          >
            {(['ask', 'capture'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={mobileTab === t}
                onClick={() => setMobileTab(t)}
                className={cn(
                  'min-h-[36px] rounded-md px-3 text-[13px] capitalize',
                  mobileTab === t
                    ? 'bg-[var(--bg-elevated)] font-medium text-[var(--fg-primary)]'
                    : 'text-[var(--fg-muted)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mobileTab === 'ask' ? (
              <AskPane
                disabled={mutationsDisabled}
                disabledReason={mutationsDisabledReason}
                canAnswer={canAnswer}
              />
            ) : (
              <MobileCapture
                vocabulary={ingestVocabulary}
                classificationRequired={classificationRequired}
                disabled={mutationsDisabled}
                disabledReason={mutationsDisabledReason}
              />
            )}
          </div>
        </div>
      ) : (
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[400px_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div
            role="tablist"
            aria-label="Memory left pane"
            className="flex items-center gap-4 border-b border-[var(--border-subtle)] px-[var(--page-gutter)]"
          >
            {(['ingest', 'inspect'] as LeftTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  '-mb-px border-b-2 py-2.5 text-[13px] font-medium capitalize transition-colors',
                  tab === t
                    ? 'border-[var(--button-primary-bg)] text-[var(--fg-primary)]'
                    : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-[var(--page-gutter)] py-4">
            {tab === 'ingest' ? (
              <IngestPane
                rows={rows}
                onIngest={enqueue}
                onIngestFile={enqueueFile}
                canUploadFiles={canUploadFiles}
                canDateEvents={canDateEvents}
                canReplaceUploads={canReplaceUploads}
                vocabulary={ingestVocabulary}
                classificationRequired={classificationRequired}
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
      )}
    </div>
  );
}
