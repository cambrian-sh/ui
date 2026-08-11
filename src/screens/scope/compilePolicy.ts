import type {
  ContainerKind,
  DocumentSummary,
  LinkSpec,
  PolicySpec,
  ScopeRule,
} from '@/ipc/types';
import { TERM_FIELD, type TermKind } from './RuleSentence';

/** The sentence's state, before it becomes a policy. */
export interface RuleDraft {
  policyId: string;
  policyName: string;
  container: string;
  term: TermKind;
  tags: string[];
}

/** `surface:chat:telegram` → `{ kind: 'surface', id: 'chat:telegram' }`. */
export function parseContainer(container: string): {
  kind: ContainerKind;
  targetId: string;
} {
  if (container === 'organisation') return { kind: 'organisation', targetId: '' };
  const [head, ...rest] = container.split(':');
  const kind: ContainerKind =
    head === 'group' || head === 'principal' || head === 'surface' ? head : 'surface';
  return { kind, targetId: rest.join(':') };
}

const EMPTY_RULE: ScopeRule = {
  required_tags: [],
  any_of_tags: [],
  forbidden_tags: [],
  granted_tags: [], party_scoped_tags: [],
};

/**
 * The sentence, compiled to the tuple the kernel actually stores.
 *
 * The algebra is never hidden — an operator who wants the `PolicySpec` and
 * `LinkSpec` gets exactly what will be sent, not a paraphrase. Hiding it would
 * make the sentence a second source of truth, and the first time the two
 * disagreed nobody would be able to tell which one the kernel believed.
 */
export function compileRule(draft: RuleDraft): { policy: PolicySpec; link: LinkSpec } {
  const rule: ScopeRule = { ...EMPTY_RULE, [TERM_FIELD[draft.term]]: draft.tags };
  const { kind, targetId } = parseContainer(draft.container);

  return {
    policy: {
      id: draft.policyId,
      name: draft.policyName,
      version: 0,
      rule,
      effects: { allow: [], deny: [] },
      // Saving NEVER enforces. Enforcing is a separate, deliberate act — that
      // separation is what removes the whole class of "I saved it and locked
      // production out".
      mode: 'report_only',
      expires_at_unix_ms: 0,
      granted_by: '',
      updated_at_unix_ms: 0,
    },
    link: {
      policy_id: draft.policyId,
      container_kind: kind,
      target_id: targetId,
      enforced: false,
      order: 0,
      expires_at_unix_ms: 0,
      granted_by: '',
    },
  };
}

export interface BlastRadius {
  /** The documents this rule changes access to, named. */
  affected: DocumentSummary[];
  /** How many documents were considered. */
  considered: number;
  /**
   * True when the rule can never match anything, so there is no radius to
   * measure. Three zeroes here would read as "no effect" rather than "no rule".
   */
  unsatisfiable: boolean;
  unsatisfiableReason: string;
}

/**
 * Which documents this rule reaches.
 *
 * Computed from the console's own document listing, and the affected documents
 * are NAMED rather than counted — "9 documents" is a number an operator cannot
 * check, and the whole point of a radius is that it can be checked before it is
 * enforced.
 */
export function computeBlastRadius(
  documents: readonly DocumentSummary[],
  draft: RuleDraft,
  closed: ReadonlySet<string>,
): BlastRadius {
  const base = {
    considered: documents.length,
    unsatisfiable: false,
    unsatisfiableReason: '',
  };

  if (draft.tags.length === 0) {
    return { ...base, affected: [] };
  }

  // A required term naming a closed label with no matching grant is a boundary
  // that matches nothing — safe, and therefore the easiest to mistake for "no
  // data". It has to be said, not implied by an empty list.
  if (draft.term === 'required' && draft.tags.some((t) => closed.has(t))) {
    const offending = draft.tags.filter((t) => closed.has(t));
    return {
      ...base,
      affected: [],
      unsatisfiable: true,
      unsatisfiableReason: `${offending.join(', ')} ${offending.length === 1 ? 'is' : 'are'} closed. Requiring a closed label with no matching grant is a boundary that matches nothing.`,
    };
  }

  const wanted = new Set(draft.tags);

  const affected = documents.filter((doc) => {
    const has = doc.tags.some((t) => wanted.has(t));
    // A required term narrows to documents that DON'T carry the tag — those are
    // the ones that stop being reachable.
    return draft.term === 'required' ? !has : has;
  });

  return { ...base, affected };
}
