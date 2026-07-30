import { useState } from 'react';
import { Image, Link as LinkIcon, PenLine } from 'lucide-react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import { TagChip } from '@/screens/scope/RuleSentence';
import type { Vocabulary } from '@/screens/scope/useVocabulary';

type CaptureKind = 'note' | 'photo' | 'link';

const KINDS: { id: CaptureKind; label: string; icon: typeof PenLine; hint: string }[] = [
  { id: 'note', label: 'Note', icon: PenLine, hint: 'type it' },
  { id: 'photo', label: 'Photo', icon: Image, hint: 'not on mobile yet' },
  { id: 'link', label: 'Link', icon: LinkIcon, hint: 'paste a URL' },
];

/** What a mobile capture is worth until someone says otherwise. */
const CAPTURE_IMPORTANCE = 0.5;
const CAPTURE_REASON = 'mobile capture';

/**
 * Capture something into memory, from a phone.
 *
 * Deliberately small. The desktop ingest pane has a file picker, an importance
 * dial, a scope editor and an audited-reason field; none of those belong on a
 * surface whose entire job is "write this down before I forget it".
 *
 * So the two settings that would otherwise be decisions are **fixed and
 * stated**: importance 0.5 and the reason `mobile capture`. Stating them
 * matters — an operator who later wonders why a note ranks the way it does can
 * see it was captured, not curated.
 */
export function MobileCapture({
  vocabulary,
  disabled,
  disabledReason,
}: {
  vocabulary: Vocabulary;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [kind, setKind] = useState<CaptureKind>('note');
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const capture = useMutation(async () =>
    ipc.ingestMemory({
      text: kind === 'link' ? `Link: ${text}` : text,
      content: [],
      filename: '',
      content_type: kind === 'link' ? 'text/uri-list' : 'text/plain',
      context,
      tags,
      importance: CAPTURE_IMPORTANCE,
      source: CAPTURE_REASON,
      session_id: '',
      reason: CAPTURE_REASON,
    }),
  );

  const canSave = text.trim() !== '' && !disabled && kind !== 'photo';

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">Capture</h2>
        <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
          Get it into memory now. Curate it later, from a desktop.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const unavailable = k.id === 'photo';
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => !unavailable && setKind(k.id)}
              disabled={unavailable}
              aria-pressed={kind === k.id}
              className={cn(
                'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-xl)] p-3 transition-colors',
                'bg-[var(--bg-surface)] shadow-[var(--elevation-1)]',
                kind === k.id && 'shadow-[inset_0_0_0_1px_var(--accent-bg)]',
                unavailable && 'opacity-40',
              )}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
              <span className="text-[12.5px]">{k.label}</span>
              <span className="text-[10.5px] text-[var(--fg-muted)]">{k.hint}</span>
            </button>
          );
        })}
      </div>

      {kind === 'photo' ? (
        <p className="text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
          Photo capture needs the binary ingest lane and a camera permission this build does
          not request yet. Use a note or a link.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-[var(--fg-secondary)]">
              {kind === 'link' ? 'The URL' : 'What happened'}
            </span>
            {kind === 'link' ? (
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                aria-label="URL"
                disabled={disabled}
              />
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="The vendor said the invoice cycle changes in July…"
                aria-label="Note"
                disabled={disabled}
                className="min-h-[120px] resize-y rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-[15px] leading-[1.5] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-[var(--fg-secondary)]">Context</span>
            <Input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Call with the vendor, 12 Jun"
              aria-label="Context"
              disabled={disabled}
            />
            <span className="text-[11px] text-[var(--fg-muted)]">
              Folded into the body by the kernel, so it is chunked and embedded with it.
            </span>
          </label>

          {vocabulary.tags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-[var(--fg-secondary)]">Labels</span>
              <div className="flex flex-wrap gap-1.5">
                {vocabulary.tags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setTags((t) =>
                        t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag],
                      )
                    }
                    aria-pressed={tags.includes(tag)}
                    className={cn(
                      'min-h-[36px] rounded-sm px-1 py-1',
                      tags.includes(tag) && 'shadow-[inset_0_0_0_1px_var(--accent-bg)]',
                    )}
                  >
                    <TagChip tag={tag} closed={vocabulary.closed.has(tag)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The two decisions this surface makes for you, said out loud. */}
          <div className="rounded-md bg-[var(--bg-surface)] p-2.5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Before you save
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
              Saved at importance <span className="font-mono">{CAPTURE_IMPORTANCE}</span> with
              the reason <span className="font-mono">{CAPTURE_REASON}</span>. Both are fixed
              here — set them deliberately from a desktop if this needs to rank higher.
            </p>
          </div>

          {capture.error && <ErrorState reason={capture.error} />}

          {saved && (
            <p role="status" className="text-[12.5px] text-[var(--status-live)]">
              Captured. It is in memory and retrievable.
            </p>
          )}

          <Button
            className="min-h-12"
            disabled={!canSave || capture.isLoading}
            onClick={async () => {
              const ok = await capture.mutate();
              if (ok) {
                setSaved(true);
                setText('');
                setContext('');
              }
            }}
          >
            {capture.isLoading ? 'Saving…' : 'Capture'}
          </Button>

          {disabled && disabledReason && (
            <p className="text-[11.5px] text-[var(--status-warn)]">{disabledReason}</p>
          )}
        </>
      )}
    </div>
  );
}
