import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { WriteCeiling } from '@/ipc/types';
import type { Vocabulary } from '@/screens/scope/useVocabulary';

/**
 * The signed-in operator's own write ceiling (ENG-2161).
 *
 * `null` means unknown — the kernel has no access-policy plugin, or it predates
 * GetWriteCeiling, or the lookup failed. The upload form then behaves as before and
 * the kernel's refusal (which names the labels to choose from) is the backstop.
 */
export function useWriteCeiling(enabled: boolean): WriteCeiling | null {
  const [ceiling, setCeiling] = useState<WriteCeiling | null>(null);
  useEffect(() => {
    if (!enabled || typeof ipc.getWriteCeiling !== 'function') {
      setCeiling(null);
      return;
    }
    let cancelled = false;
    ipc
      .getWriteCeiling()
      .then((c) => {
        if (!cancelled) setCeiling(c);
      })
      .catch(() => {
        if (!cancelled) setCeiling(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return ceiling;
}

/**
 * The labels an upload may carry: the vocabulary narrowed to the writer's ceiling.
 *
 * The kernel refuses a requested label outside the ceiling (ENG-2115), so offering
 * one would only set up a refusal. With no known ceiling, or an empty one, the
 * vocabulary is returned unchanged.
 */
export function uploadVocabulary(vocabulary: Vocabulary, ceiling: WriteCeiling | null): Vocabulary {
  if (!ceiling || ceiling.tags.length === 0) return vocabulary;
  return {
    ...vocabulary,
    tags: ceiling.tags.map((t) => t.tag),
    configured: true,
    closed: new Set([
      ...ceiling.tags.filter((t) => t.closed).map((t) => t.tag),
      ...[...vocabulary.closed].filter((t) => ceiling.tags.some((c) => c.tag === t)),
    ]),
  };
}
