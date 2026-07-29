import { useState } from 'react';
import { Button, Checkbox, EmptyState, Input, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { Role } from '@/ipc/types';
import type { Vocabulary } from './useVocabulary';
import { TagPicker } from './TagPicker';
import { cn } from '@/design-system/lib/utils';

const DEFAULT_BULK_REASON = 'bulk label from console';

/**
 * One labellable row, from either lane.
 *
 * Search and browse produce the SAME row type on purpose: labelling, bulk labelling
 * and the vocabulary picker below are identical whichever way the operator arrived,
 * and a second row shape would mean a second set of those controls to keep in step.
 */
interface Hit {
  id: string;
  /** The chunk body (search) or the document title (browse). */
  text: string;
  tags: string[];
  /** Provenance line shown under a browsed row: source type and chunk count. */
  meta?: string;
}

type Lane = 'search' | 'browse';

const PAGE_SIZE = 50;

/** What a bulk run actually did. Never collapsed into a single boolean. */
interface BulkOutcome {
  tag: string;
  add: boolean;
  attempted: number;
  succeeded: number;
  failures: { id: string; message: string }[];
}

/**
 * Label documents and memories (ADR-0093).
 *
 * This pane exists because the policy model **acts on labels, never on a document by
 * name** — and an unlabelled document has nothing for any rule to act on. Without a way
 * to label from here, an operator could write a perfectly correct policy that matched
 * nothing, and the console gave no hint why. The assistant hit exactly that: asked to
 * keep a document away from a chat surface, it resolved the surface and then had no tag
 * to forbid.
 *
 * Labelling a DOCUMENT is authoritative and atomic. The kernel moves the document row
 * and every one of its chunks in one transaction, so a document can never end up
 * half-labelled — some chunks reachable and some not, which is not a boundary at all.
 *
 * Labelling is also a BULK job in practice. A policy is written about a label, so the
 * label has to already be on every document the rule is meant to reach; doing that one
 * document at a time is how a label set ends up almost-right, which is indistinguishable
 * from correct until something leaks. `TagMemory` is per-document, so a bulk apply is N
 * calls — each atomic on its own document, none atomic across the selection. The UI
 * therefore reports what actually happened ("labelled 7 of 9") and names the failures,
 * rather than reporting one blanket success it cannot honestly claim.
 */
export function LabelsPane({
  vocabulary,
  role,
  canBrowse = false,
}: {
  vocabulary: Vocabulary;
  role: Role | null;
  /** False when the kernel predates contract 0070 (`document-listing`). */
  canBrowse?: boolean;
}) {
  const readOnly = role !== 'operator';
  const [lane, setLane] = useState<Lane>('search');
  const [query, setQuery] = useState('');
  // Defaults ON: the unlabelled set is the worklist, not a filter on it. Browsing
  // the whole corpus is the special case.
  const [unlabelledOnly, setUnlabelledOnly] = useState(true);
  const [idPrefix, setIdPrefix] = useState('');
  const [cursor, setCursor] = useState('');
  const [totalMatching, setTotalMatching] = useState<number | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState(DEFAULT_BULK_REASON);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const clearFeedback = () => {
    setError(null);
    setStatus(null);
    setOutcome(null);
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    clearFeedback();
    try {
      const res = await ipc.queryMemory({
        query,
        top_k: 20,
        source: '',
        session: '',
        min_importance: 0,
      });
      setHits(
        (res.hits ?? []).map((h) => ({
          id: h.doc_id ?? '',
          text: h.text ?? '',
          tags: Array.isArray(h.tags) ? h.tags : [],
        })),
      );
      // A new result set is a new population; carrying a selection across it would let
      // a bulk action land on documents the operator can no longer see.
      setSelected(new Set());
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Enumerate documents by row.
   *
   * `append` continues the current page rather than replacing it, so paging through
   * a large unlabelled set does not lose what is already on screen. A fresh browse
   * always clears the selection: a bulk action must never reach a row the operator
   * can no longer see.
   */
  const browse = async (append = false) => {
    setBusy(true);
    clearFeedback();
    try {
      const res = await ipc.listDocuments({
        limit: PAGE_SIZE,
        cursor: append ? cursor : '',
        unlabelled_only: unlabelledOnly,
        id_prefix: idPrefix.trim(),
      });
      const rows: Hit[] = (res.documents ?? []).map((d) => ({
        id: d.id,
        text: d.title || d.id,
        tags: Array.isArray(d.tags) ? d.tags : [],
        meta: `${d.source_type || 'unknown source'} · ${d.chunk_count} chunk${d.chunk_count === 1 ? '' : 's'}`,
      }));
      setHits((prev) => (append ? [...prev, ...rows] : rows));
      if (!append) setSelected(new Set());
      setCursor(res.next_cursor ?? '');
      setTotalMatching(res.total_matching ?? 0);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchLane = (next: Lane) => {
    setLane(next);
    setHits([]);
    setSelected(new Set());
    setSearched(false);
    setCursor('');
    setTotalMatching(null);
    clearFeedback();
  };

  /** Fold one applied label into the local view without re-querying. */
  const reflect = (docID: string, tag: string, add: boolean) =>
    setHits((prev) =>
      prev.map((h) =>
        h.id === docID
          ? { ...h, tags: add ? [...new Set([...h.tags, tag])] : h.tags.filter((t) => t !== tag) }
          : h,
      ),
    );

  const applyTag = async (docID: string, tag: string, add: boolean) => {
    clearFeedback();
    try {
      await ipc.tagMemory(docID, tag, add, add ? `label ${tag}` : `remove label ${tag}`);
      // Reflect it locally rather than re-running the search: a re-query would reorder
      // the results under the operator mid-edit, which is disorienting when you are
      // labelling several things in a row.
      reflect(docID, tag, add);
      setStatus(`${add ? 'Applied' : 'Removed'} ${tag} on ${docID}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runBulk = async (add: boolean) => {
    if (!bulkTag || selected.size === 0) return;
    const ids = hits.map((h) => h.id).filter((id) => selected.has(id));
    const reason = bulkReason.trim() || DEFAULT_BULK_REASON;

    setBulkBusy(true);
    clearFeedback();

    const failures: { id: string; message: string }[] = [];
    let succeeded = 0;
    // Sequential, not Promise.all: every one of these is an audited mutation, and the
    // audit log reads far better as an ordered run than as N interleaved writes. It
    // also keeps a failing kernel from being hit with the whole selection at once.
    for (const id of ids) {
      try {
        await ipc.tagMemory(id, bulkTag, add, reason);
        reflect(id, bulkTag, add);
        succeeded++;
      } catch (e: unknown) {
        failures.push({ id, message: e instanceof Error ? e.message : String(e) });
      }
    }

    setOutcome({ tag: bulkTag, add, attempted: ids.length, succeeded, failures });
    setBulkBusy(false);
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = hits.length > 0 && hits.every((h) => selected.has(h.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(hits.map((h) => h.id)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border-subtle)] px-4 py-2">
        <span className="text-xs text-[var(--fg-muted)]">
          Rules act on labels, never on a document by name. An unlabelled document has nothing for
          any rule to act on &mdash; label it here first, then restrict the label.
        </span>
      </div>

      {canBrowse && (
        <div
          role="tablist"
          aria-label="How to find documents"
          className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-4 py-2"
        >
          {(['search', 'browse'] as Lane[]).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lane === l}
              onClick={() => switchLane(l)}
              className={cn(
                'rounded-[var(--radius-sm,3px)] px-2 py-0.5 text-xs capitalize transition-colors',
                lane === l
                  ? 'bg-[var(--bg-elevated)] text-[var(--fg-primary)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
              )}
            >
              {l}
            </button>
          ))}
          <span className="ml-2 text-[11px] text-[var(--fg-muted)]">
            {lane === 'search'
              ? 'Finds a document by what it says.'
              : 'Lists documents by row — the only way to find one that has no labels.'}
          </span>
        </div>
      )}

      {lane === 'search' ? (
        <form
          className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a document or memory&hellip;"
            aria-label="Find a document or memory"
            className="max-w-md"
          />
          <Button type="submit" size="sm" disabled={busy || !query.trim()}>
            {busy ? 'Searching…' : 'Search'}
          </Button>
          {readOnly && (
            <span className="text-xs text-[var(--fg-muted)]">
              Labelling needs the operator role.
            </span>
          )}
        </form>
      ) : (
        <form
          className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void browse(false);
          }}
        >
          <label className="flex items-center gap-2 text-xs text-[var(--fg-secondary)]">
            <Checkbox
              checked={unlabelledOnly}
              onCheckedChange={(v) => setUnlabelledOnly(v === true)}
              aria-label="Unlabelled only"
            />
            Unlabelled only
          </label>
          <Input
            value={idPrefix}
            onChange={(e) => setIdPrefix(e.target.value)}
            placeholder="id starts with&hellip;"
            aria-label="Filter by id prefix"
            className="h-7 max-w-[16rem] text-xs"
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Listing…' : 'List documents'}
          </Button>
          {totalMatching !== null && (
            // The number that matters. "50 shown" says nothing about how much of the
            // corpus no rule can reach.
            <span className="text-xs text-[var(--fg-secondary)]">
              {hits.length} of {totalMatching} {unlabelledOnly ? 'unlabelled ' : ''}
              document{totalMatching === 1 ? '' : 's'}
            </span>
          )}
          {readOnly && (
            <span className="text-xs text-[var(--fg-muted)]">
              Labelling needs the operator role.
            </span>
          )}
        </form>
      )}

      {hits.length > 0 && !readOnly && (
        <div className="border-b border-[var(--border-subtle)] px-4 py-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--fg-secondary)]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all results"
              />
              Select all
            </label>
            <span className="text-xs text-[var(--fg-muted)]">
              {selected.size === 0
                ? 'Select documents to label several at once.'
                : `${selected.size} selected`}
            </span>
          </div>

          {selected.size > 0 && (
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm,3px)] border border-[var(--border-subtle)] p-2">
              <TagPicker
                vocabulary={vocabulary}
                selected={bulkTag ? [bulkTag] : []}
                disabled={bulkBusy}
                label="Label to apply or remove"
                hint="One label, across every selected document. Each document moves atomically; the selection does not."
                onChange={(next) => {
                  // One at a time: a bulk run applies a SINGLE label so the audit entry
                  // and the partial-failure count both refer to one unambiguous change.
                  const added = next.find((t) => t !== bulkTag);
                  setBulkTag(added ?? null);
                }}
              />
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-[var(--fg-secondary)]">
                  Reason
                  <Input
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    aria-label="Reason for this bulk change"
                    className="h-7 w-64 text-xs"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkBusy || !bulkTag}
                  onClick={() => void runBulk(true)}
                >
                  {bulkBusy ? 'Working…' : `Apply to ${selected.size}`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy || !bulkTag}
                  onClick={() => void runBulk(false)}
                >
                  Remove from {selected.size}
                </Button>
              </div>
              <p className="text-[11px] text-[var(--fg-muted)]">
                One reason, written to the audit log once per document.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mx-4 mt-3 text-xs text-[var(--color-status-err)]">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="mx-4 mt-3 text-xs text-[var(--fg-secondary)]">
          {status}
        </p>
      )}
      {outcome && (
        // Stated as a count, always — "labelled 7 of 9" is the honest form even when
        // the two numbers agree, and it never lets a partial run read as a success.
        <div className="mx-4 mt-3">
          <p
            role={outcome.failures.length > 0 ? 'alert' : 'status'}
            className={
              outcome.failures.length > 0
                ? 'text-xs text-[var(--color-status-warn)]'
                : 'text-xs text-[var(--fg-secondary)]'
            }
          >
            {outcome.add ? 'Labelled' : 'Unlabelled'} {outcome.succeeded} of {outcome.attempted}{' '}
            with {outcome.tag}.
          </p>
          {outcome.failures.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {outcome.failures.map((f) => (
                <li key={f.id} className="text-[11px] text-[var(--color-status-err)]">
                  <code>{f.id}</code> — {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        {hits.length === 0 && searched && !busy && (
          <div className="p-4">
            {lane === 'search' ? (
              <EmptyState
                title="Nothing matched"
                body="Try a different phrase from the document."
              />
            ) : (
              <EmptyState
                title={unlabelledOnly ? 'Every document has a label' : 'No documents'}
                body={
                  unlabelledOnly
                    ? 'Nothing in the corpus is unreachable by policy for want of a label. Untick “Unlabelled only” to list everything.'
                    : 'This kernel has no ingested documents yet.'
                }
              />
            )}
          </div>
        )}
        {hits.length === 0 && !searched && (
          <div className="p-4">
            <EmptyState
              title={lane === 'browse' ? 'List your documents' : 'Search for what you want to label'}
              body={
                lane === 'browse'
                  ? 'Labels are how policy reaches a document, and a document with none is unreachable by every rule. List the unlabelled ones and give them a label.'
                  : 'Labels are how policy reaches a document. Find it, give it a label from the controlled vocabulary, then write a rule about that label.'
              }
            />
          </div>
        )}

        <ul role="list" className="divide-y divide-[var(--border-subtle)]">
          {hits.map((h) => (
            <li key={h.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                {!readOnly && (
                  <Checkbox
                    checked={selected.has(h.id)}
                    onCheckedChange={() => toggleSelected(h.id)}
                    aria-label={`Select ${h.id}`}
                  />
                )}
                <code className="text-[11px] text-[var(--fg-muted)]">{h.id}</code>
                {h.tags.length === 0 && (
                  // Said plainly, because it is the reason a policy would not reach it.
                  <span className="text-[11px] text-[var(--color-status-warn)]">
                    no labels &mdash; no rule can reach this
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--fg-secondary)]">{h.text}</p>
              {h.meta && <p className="mt-0.5 text-[11px] text-[var(--fg-muted)]">{h.meta}</p>}
              <div className="mt-2">
                <TagPicker
                  vocabulary={vocabulary}
                  selected={h.tags}
                  disabled={readOnly}
                  label="Labels"
                  hint="What this document is. Rules are written about these, so a document with none is unreachable by any rule."
                  onChange={(next) => {
                    const added = next.find((t) => !h.tags.includes(t));
                    const removed = h.tags.find((t) => !next.includes(t));
                    if (added) void applyTag(h.id, added, true);
                    else if (removed) void applyTag(h.id, removed, false);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        {lane === 'browse' && cursor !== '' && (
          <div className="p-4">
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void browse(true)}>
              {busy ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
