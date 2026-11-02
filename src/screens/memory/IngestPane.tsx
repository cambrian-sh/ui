import { useState } from 'react';
import { Upload } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ipc } from '@/ipc';
import type { IngestFileParams, IngestMemoryParams } from '@/ipc/types';
import { errorMessage } from '@/lib/errorMessage';
import { IngestQueue } from './IngestQueue';
import type { IngestRow } from './useIngestQueue';
import { TagPicker } from '@/screens/scope/TagPicker';
import type { Vocabulary } from '@/screens/scope/useVocabulary';
import { cn } from '@/design-system/lib/utils';
import { localTimeZoneName, occurredAtFromInput } from '@/lib/eventTime';

const DEFAULT_REASON = 'operator upload';

interface StagedFile {
  path: string;
  name: string;
  size: number;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

export interface IngestPaneProps {
  rows: IngestRow[];
  onIngest: (label: string, params: IngestMemoryParams) => void;
  onIngestFile: (label: string, params: IngestFileParams) => void;
  /** False when the kernel does not advertise `memory-ingest-binary`. */
  canUploadFiles: boolean;
  /**
   * The controlled classification vocabulary (ADR-0085 D11).
   *
   * Labels applied here are the same labels access policy acts on, so this field
   * offers SELECTION rather than free text. It used to be a draft `<input>`: a typo
   * coined a label no rule would ever match, and nothing downstream could catch it
   * because a tag is an opaque string. That is the exact defect the scope console
   * already solved — a document labelled `internal-only` when the vocabulary says
   * `internal_only` is not restricted, it is merely mislabelled, and it looks
   * identical from here.
   *
   * When the kernel has no vocabulary the coinage check is off, free entry is honest,
   * and `TagPicker` falls back to it — an unscoped OSS deployment must still be able
   * to tag.
   */
  vocabulary: Vocabulary;
  disabled: boolean;
  disabledReason?: string;
  /**
   * True when the kernel advertises `memory-event-time` (contract 0099). An older
   * kernel would silently drop `occurred_at`, so the input is hidden there rather
   * than accepted and ignored.
   */
  canDateEvents?: boolean;
}

export function IngestPane({
  rows,
  onIngest,
  onIngestFile,
  canUploadFiles,
  vocabulary,
  disabled,
  disabledReason,
  canDateEvents = false,
}: IngestPaneProps) {
  const [pasteMode, setPasteMode] = useState(!canUploadFiles);
  const [pasteText, setPasteText] = useState('');
  const [context, setContext] = useState('');
  const [restricted, setRestricted] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [importance, setImportance] = useState(0.5);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  // ADR-0134: when the content happened. Optional — "unknown" sends nothing and the
  // kernel dates the document by its ingest clock, labelled `ingest_default`.
  const [whenMode, setWhenMode] = useState<'unknown' | 'date' | 'datetime'>('unknown');
  const [whenValue, setWhenValue] = useState('');
  const when = whenMode === 'unknown' ? null : occurredAtFromInput(whenMode, whenValue);
  const whenInvalid = whenMode !== 'unknown' && whenValue.trim() !== '' && when === null;
  const whenFields = when ?? {};

  const effectiveTags = restricted ? tags : [];

  // Closed labels are deny-by-default and there is no operator exemption (ADR-0091).
  // Applying one at ingest makes the document unreachable for EVERYONE — including
  // whoever is uploading it, from this console — until a policy grants it. That is
  // usually the intent, but it is a surprising thing to discover afterwards by
  // failing to find your own upload, so it is said before the write, not after.
  const closedSelected = effectiveTags.filter((t) => vocabulary.closed.has(t));

  // The OS file dialog returns PATHS, not bytes. The Rust core reads the file, so
  // a 500 MB document never enters the webview's memory or crosses IPC as an
  // array — it is streamed off disk by the native side.
  const pickFiles = async () => {
    setPickError(null);
    try {
      const selected = await open({ multiple: true, title: 'Choose documents to ingest' });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const stats = await Promise.all(
        paths.map(async (path) => {
          const s = await ipc.statFile(path);
          return { path, name: s.name, size: s.size };
        }),
      );
      setStaged((prev) => [...prev, ...stats]);
    } catch (err) {
      setPickError(errorMessage(err));
    }
  };

  const ingestStaged = () => {
    for (const file of staged) {
      onIngestFile(file.name, {
        path: file.path,
        context,
        tags: effectiveTags,
        importance,
        reason: reason.trim() || DEFAULT_REASON,
        ...whenFields,
      });
    }
    setStaged([]);
  };

  const submitText = () => {
    const text = pasteText.trim();
    if (!text) return;
    onIngest(text.slice(0, 48) || 'pasted text', {
      text,
      content: [],
      filename: '',
      content_type: 'text/plain',
      context,
      tags: effectiveTags,
      importance,
      source: '',
      session_id: '',
      reason: reason.trim() || DEFAULT_REASON,
      ...whenFields,
    });
    setPasteText('');
  };

  return (
    <div className="flex flex-col gap-3">
      {canUploadFiles && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPasteMode(false)}
            aria-pressed={!pasteMode}
            className={cn(
              'rounded-sm border px-2 py-0.5 text-[11px]',
              !pasteMode
                ? 'border-[var(--accent-bg)] bg-[var(--accent-bg)] text-[var(--fg-on-accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)]',
            )}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setPasteMode(true)}
            aria-pressed={pasteMode}
            className={cn(
              'rounded-sm border px-2 py-0.5 text-[11px]',
              pasteMode
                ? 'border-[var(--accent-bg)] bg-[var(--accent-bg)] text-[var(--fg-on-accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)]',
            )}
          >
            Paste text
          </button>
        </div>
      )}

      {!canUploadFiles && (
        <p className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-[10px] text-[var(--fg-muted)]">
          This kernel does not advertise <code className="font-mono">memory-ingest-binary</code>.
          File upload is hidden; paste text instead.
        </p>
      )}

      {pasteMode || !canUploadFiles ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="paste-text" className="text-[11px] font-medium text-[var(--fg-secondary)]">
            Text
          </label>
          <textarea
            id="paste-text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            rows={5}
            placeholder="Paste a document…"
            className="resize-y rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-[11px] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submitText}
            disabled={disabled || !pasteText.trim() || whenInvalid}
            title={disabled ? disabledReason : undefined}
            className="self-end rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-[11px] font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ingest text
          </button>
        </div>
      ) : (
        // The drop target leads the pane. Ingest is the reason this pane
        // exists, and it used to sit at the same weight as the reason field.
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] p-[22px_16px] text-center',
            'tint-wash tint-ring',
            disabled && 'opacity-50',
          )}
          style={{ '--tint': 'var(--accent-bg)' } as React.CSSProperties}
        >
          <Upload
            aria-hidden="true"
            size={24}
            strokeWidth={1.75}
            className="text-[var(--color-accent-400)]"
          />
          <p className="text-[12.5px] text-[var(--fg-secondary)]">
            Drop documents here, or
          </p>
          <button
            type="button"
            onClick={pickFiles}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            aria-label="Choose files to ingest"
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed"
          >
            Choose files…
          </button>
          {/* The picker hands the core a path and the core reads the bytes —
              the webview never holds them, so document size is not a limit. */}
          <p className="text-[11px] text-[var(--fg-muted)]">
            or paste text instead. The app reads files natively, so large documents are fine.
          </p>
          {pickError && (
            <p role="alert" className="text-[11px] text-[var(--status-err)]">
              {pickError}
            </p>
          )}
        </div>
      )}

      {!pasteMode && canUploadFiles && staged.length > 0 && (
        <div className="flex flex-col gap-1">
          <h2 className="text-[11px] font-medium text-[var(--fg-secondary)]">
            Ready to ingest ({staged.length})
          </h2>
          <ul aria-label="Staged files" className="flex flex-col gap-1">
            {staged.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px]"
              >
                <span className="truncate text-[var(--fg-primary)]" title={file.name}>
                  {file.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--fg-muted)]">
                    {humanSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${file.name}`}
                    className="text-[var(--fg-muted)] hover:text-[var(--status-err)]"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-[var(--fg-muted)]">
            Nothing has been sent yet. Set the context, scope and importance below, then ingest.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-context" className="text-[11px] font-medium text-[var(--fg-secondary)]">
          Context
        </label>
        <textarea
          id="ingest-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="Q3 board pack; figures provisional"
          className="resize-y rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-[11px] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-[10px] text-[var(--fg-muted)]">
          Folded into the document body by the kernel, so it is chunked and embedded with it.
        </p>
      </div>

      {canDateEvents && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[11px] font-medium text-[var(--fg-secondary)]">
            When did this happen?
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Event time kind"
              value={whenMode}
              onChange={(e) => {
                setWhenMode(e.target.value as 'unknown' | 'date' | 'datetime');
                setWhenValue('');
              }}
              disabled={disabled}
              className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-[11px] text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <option value="unknown">Unknown — use the ingest time</option>
              <option value="date">On a date</option>
              <option value="datetime">At a date and time</option>
            </select>
            {whenMode !== 'unknown' && (
              <input
                type={whenMode === 'date' ? 'date' : 'datetime-local'}
                aria-label={whenMode === 'date' ? 'Event date' : 'Event date and time'}
                value={whenValue}
                onChange={(e) => setWhenValue(e.target.value)}
                disabled={disabled}
                className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-[11px] text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            )}
          </div>
          <p className="text-[10px] text-[var(--fg-muted)]">
            {whenMode === 'unknown' &&
              'The kernel dates it by when it was ingested, and labels it so — never as when it happened.'}
            {whenMode === 'date' && 'Sent as a date (day precision); no time of day is invented.'}
            {whenMode === 'datetime' &&
              `Read in your time zone (${localTimeZoneName()}) and sent as an absolute instant, minute precision.`}
          </p>
          {whenInvalid && (
            <p role="alert" className="text-[11px] text-[var(--status-err)]">
              That is not a complete {whenMode === 'date' ? 'date' : 'date and time'}.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-[11px] font-medium text-[var(--fg-secondary)]">Scope</legend>
        <label className="flex items-center gap-2 text-[11px] text-[var(--fg-primary)]">
          <input
            type="radio"
            name="scope"
            checked={!restricted}
            onChange={() => setRestricted(false)}
            disabled={disabled}
          />
          Anyone, anywhere
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--fg-primary)]">
          <input
            type="radio"
            name="scope"
            checked={restricted}
            onChange={() => setRestricted(true)}
            disabled={disabled}
          />
          Restrict…
        </label>
        <p className="text-[10px] text-[var(--fg-muted)]">
          {restricted
            ? 'Only principals whose scope matches these labels can retrieve it.'
            : 'Readable by any agent or principal on this kernel.'}
        </p>
        {restricted && (
          <div className="mt-1 flex flex-col gap-1">
            <TagPicker
              vocabulary={vocabulary}
              selected={tags}
              onChange={setTags}
              disabled={disabled}
              label="Labels"
              hint="What this document is. Rules are written about these, so a document with none is unreachable by any rule."
            />
            {/* This is a deny-by-default outcome with no operator exemption. It
                was 10px grey text, which is how an operator locks themselves
                out of a document without noticing. */}
            {closedSelected.length > 0 && (
              <div
                role="status"
                className="flex flex-col gap-1 rounded-md p-2.5 tint-wash tint-ring"
                style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
                  {closedSelected.join(', ')} {closedSelected.length === 1 ? 'is a closed label' : 'are closed labels'}
                </span>
                <span className="text-[12px] leading-[1.5] text-[var(--fg-primary)]">
                  This document will be deny-by-default for everyone — including you, from this
                  console — until a policy grants it. There is no operator exemption.
                </span>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="importance" className="text-[11px] font-medium text-[var(--fg-secondary)]">
          Importance <span className="font-mono text-[10px] text-[var(--fg-muted)]">{importance.toFixed(1)}</span>
        </label>
        <input
          id="importance"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={importance}
          onChange={(e) => setImportance(Number(e.target.value))}
          disabled={disabled}
          className="accent-[var(--accent-bg)]"
        />
      </div>

      <details className="rounded-sm border border-[var(--border-subtle)] p-2">
        <summary className="cursor-pointer text-[11px] text-[var(--fg-secondary)]">Advanced</summary>
        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor="ingest-reason" className="text-[11px] font-medium text-[var(--fg-secondary)]">
            Reason
          </label>
          <input
            id="ingest-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={disabled}
            className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-[11px] text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-[10px] text-[var(--fg-muted)]">
            Mandatory kernel-side; written to the durable audit log.
          </p>
        </div>
      </details>

      {!pasteMode && canUploadFiles && staged.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2">
          <button
            type="button"
            onClick={ingestStaged}
            disabled={disabled || whenInvalid}
            title={disabled ? disabledReason : undefined}
            className="rounded-sm bg-[var(--button-primary-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ingest {staged.length} file{staged.length === 1 ? '' : 's'} with this context
          </button>
          <p className="text-[10px] text-[var(--fg-muted)]">
            Structure-aware parsing of a large PDF can take a minute or more; the row stays
            in <span className="font-mono">parsing…</span> until the first chunk lands.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2">
        <h2 className="text-[11px] font-medium text-[var(--fg-secondary)]">Queue</h2>
        <IngestQueue rows={rows} />
      </div>
    </div>
  );
}
