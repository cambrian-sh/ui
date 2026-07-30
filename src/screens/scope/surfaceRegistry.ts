import type {
  AgentSummary,
  IngressSpec,
  LinkSpec,
  PolicySpec,
} from '@/ipc/types';

/**
 * A surface, assembled from the four places that each know part of it.
 *
 * Today a surface is a string that appears in other people's config: the
 * ingress registry stamps it, policy links target it, a daemon serves it, and
 * nothing puts those together. So "the Telegram surface" is not a thing an
 * operator can point at and inspect — which is a problem, because it is the
 * unit policy is written against.
 */

export type SurfaceProblem =
  | 'no-ingress'
  | 'no-policy'
  | 'unrestricted-namespace'
  | 'daemon-silent';

export interface SurfaceRow {
  /** `surface:chat:telegram` — the form a `LinkSpec.target_id` uses. */
  id: string;
  kind: string;
  surfaceId: string;
  /** What registered it. Null when policy targets a surface nobody stamps. */
  ingress: IngressSpec | null;
  /** The daemon serving it, if one has reported. */
  daemon: AgentSummary | null;
  /** Policies linked at this surface. */
  policies: PolicySpec[];
  links: LinkSpec[];
  namespace: string[];
  problems: SurfaceProblem[];
}

/** `surface:chat:telegram` from its parts. */
export function surfaceKey(kind: string, id: string): string {
  return `surface:${kind}:${id}`;
}

/** Split a `LinkSpec.target_id` back into kind + id. */
function parseTarget(targetId: string): { kind: string; id: string } {
  const [kind, ...rest] = targetId.split(':');
  return { kind: kind ?? '', id: rest.join(':') };
}

/**
 * Every surface this deployment knows about.
 *
 * Deliberately unions two sources rather than listing the registry alone:
 *
 * - **registered ingresses** — surfaces something actually stamps, and
 * - **surfaces referenced by a policy link** — because a policy linked to a
 *   surface nobody registered applies to *nothing*, and today that looks
 *   identical to a working boundary from every other screen.
 *
 * That second case is the reason this screen earns its place.
 */
export function buildSurfaceRegistry(
  ingresses: readonly IngressSpec[],
  links: readonly LinkSpec[],
  policies: readonly PolicySpec[],
  agents: readonly AgentSummary[],
): SurfaceRow[] {
  const policyById = new Map(policies.map((p) => [p.id, p]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const rows = new Map<string, SurfaceRow>();

  const ensure = (kind: string, id: string): SurfaceRow => {
    const key = surfaceKey(kind, id);
    let row = rows.get(key);
    if (!row) {
      row = {
        id: key,
        kind,
        surfaceId: id,
        ingress: null,
        daemon: null,
        policies: [],
        links: [],
        namespace: [],
        problems: [],
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const ingress of ingresses) {
    const row = ensure(ingress.surface_kind, ingress.surface_id);
    row.ingress = ingress;
    row.namespace = ingress.namespace;
    row.daemon = agentById.get(ingress.agent_id) ?? null;
  }

  for (const link of links) {
    if (link.container_kind !== 'surface') continue;
    const { kind, id } = parseTarget(link.target_id);
    const row = ensure(kind, id);
    row.links.push(link);
    const policy = policyById.get(link.policy_id);
    if (policy) row.policies.push(policy);
  }

  for (const row of rows.values()) {
    if (!row.ingress) row.problems.push('no-ingress');
    if (row.policies.length === 0) row.problems.push('no-policy');
    if (row.ingress && row.ingress.namespace.length === 0) {
      row.problems.push('unrestricted-namespace');
    }
    if (row.ingress && !row.daemon) row.problems.push('daemon-silent');
  }

  return Array.from(rows.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * What a problem means, in the operator's terms.
 *
 * Each of these is a state that looks fine from every other screen, which is
 * why the wording has to name the consequence rather than the condition.
 */
export const PROBLEM_COPY: Record<
  SurfaceProblem,
  { kicker: string; tone: 'err' | 'warn'; body: string }
> = {
  'no-ingress': {
    kicker: 'NOTHING REGISTERS THIS',
    tone: 'err',
    body: 'Policy is linked to this surface, but no ingress stamps it — so nothing ever arrives carrying it and those policies apply to nobody. From the Policies pane this looks exactly like a working boundary.',
  },
  'no-policy': {
    kicker: 'NO POLICY LINKED',
    tone: 'warn',
    body: 'Traffic arrives stamped with this surface and no policy is linked at it, so it is bounded only by whatever applies at broader containers — the organisation, and any group the principal resolves into.',
  },
  'unrestricted-namespace': {
    kicker: 'UNRESTRICTED NAMESPACE',
    tone: 'warn',
    body: 'This ingress may speak for any external identity. That is safe only while it is the single ingress — once a second exists, either one can inject messages as the other’s users.',
  },
  'daemon-silent': {
    kicker: 'NO DAEMON HAS REPORTED',
    tone: 'warn',
    body: 'An ingress is registered but its agent has not appeared on the feed, so nothing is known to be serving this surface. It may be down, or it may simply not have started yet — the console cannot tell those apart.',
  },
};
