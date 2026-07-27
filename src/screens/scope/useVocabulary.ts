import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';

/**
 * The controlled classification vocabulary (ADR-0085 D11).
 *
 * Two states matter and they are not the same:
 *
 * - **`configured`** — the kernel has a vocabulary, so tag fields must offer
 *   SELECTION. A free-text tag field is a defect: a typo is the primary route to
 *   a scope that silently matches nothing, and an opaque-string model gives no
 *   natural protection against it.
 * - **not configured** — the kernel accepts any tag (the coinage check is off).
 *   Free entry is then honest, but the UI says so rather than pretending the
 *   field is safe.
 *
 * Fetched once per mount rather than folded into the feed: the vocabulary changes
 * at deploy time, not at runtime, and putting it on the absolute-state feed would
 * make every operator pay for a surface most never open.
 */
export interface Vocabulary {
  tags: string[];
  /** True when the kernel has a controlled vocabulary to select from. */
  configured: boolean;
  /**
   * Tags that are deny-by-default (ADR-0091): nobody reaches them unless a policy
   * grants them.
   *
   * Surfaced because closed-ness changes what every other term means. Without it an
   * author cannot tell why a Required tag produced a boundary that matches nothing,
   * and the grant field has nothing safe to offer.
   */
  closed: Set<string>;
  loading: boolean;
  /** Set when the lookup failed — distinct from "there is no vocabulary". */
  error: string | null;
}

export function useVocabulary(enabled: boolean): Vocabulary {
  const [tags, setTags] = useState<string[]>([]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // The premium plane carries closed-ness; the pinned OSS contract carries only
    // names. Fall back to the OSS list so a kernel without the policy plugin still
    // gets vocabulary-driven selection rather than free text.
    ipc
      .listTags()
      .then((specs) => {
        if (cancelled) return;
        setTags(specs.map((s) => s.tag));
        setClosed(new Set(specs.filter((s) => s.closed).map((s) => s.tag)));
        setError(null);
      })
      .catch(() =>
        ipc.listClassificationTags().then((t) => {
          if (cancelled) return;
          setTags(t);
          setClosed(new Set());
          setError(null);
        }),
      )
      .catch((e: unknown) => {
        if (cancelled) return;
        // A kernel without the policy plugin answers Unimplemented. That is not
        // an error state for the operator — it is the OSS posture — so callers
        // gate on the capability and this only surfaces a genuine failure.
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { tags, configured: tags.length > 0, closed, loading, error };
}
