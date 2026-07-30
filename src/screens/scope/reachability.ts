import type {
  AccessDecision,
  GroupSpec,
  LinkSpec,
  PolicyContribution,
  PolicySpec,
} from '@/ipc/types';

/**
 * A client-side reachability evaluation.
 *
 * ── Read this before trusting a cell ────────────────────────────────────────
 * This module re-implements the kernel's decision algebra in the webview so the
 * matrix can answer a whole grid without N×M round trips. That is a deliberate
 * trade with a real cost: **this is a second source of truth for access
 * control**, and if it ever disagrees with the kernel, the kernel is right and
 * this is a bug.
 *
 * Two things follow, and both are load-bearing rather than decoration:
 *
 *  1. Every surface that renders these verdicts must say they were computed
 *     locally. A cell here is a *prediction*, not a decision.
 *  2. Every cell must be verifiable against the real `explainAccess` RPC, and a
 *     disagreement must be shown loudly rather than smoothed over — a wrong
 *     "allowed" is a security-shaped bug, and the only cheap way to catch one is
 *     to make checking easy.
 *
 * Nothing here is used to permit anything. The kernel enforces; this predicts.
 */

/** The five things a cell can say. */
export type CellState =
  | 'allowed'
  | 'denied'
  | 'denied_by_default'
  | 'allowed_via_grant'
  | 'report_only_would_deny';

export interface CellVerdict {
  state: CellState;
  /** The specific tag or clause responsible. */
  detail: string;
  /** Ordered contributions, ending in the decision — the Explain shape. */
  decidedBy: PolicyContribution[];
  /** True when a report-only policy is what would have denied. */
  reportOnly: boolean;
}

export interface Principal {
  /** `surface:chat:telegram`, `group:support-team`, `principal:agent-1`. */
  id: string;
  label: string;
  /** Groups this principal resolves into, outermost first. */
  groups?: string[];
}

/** Container kinds in application order — broadest first. This IS precedence. */
const PRECEDENCE = ['organisation', 'group', 'principal', 'surface'] as const;

function linkMatches(link: LinkSpec, principal: Principal): boolean {
  if (link.container_kind === 'organisation') return true;
  const target = `${link.container_kind}:${link.target_id}`;
  if (target === principal.id) return true;
  if (link.container_kind === 'group') {
    return (principal.groups ?? []).includes(link.target_id);
  }
  return false;
}

/**
 * The links that apply to a principal, in precedence order.
 *
 * Block-inheritance is applied here because it is a property of the *path*, not
 * of any one policy: a group that stops inheriting drops everything accumulated
 * above it — except denies, which are absolute, and except links marked
 * `enforced`, which a downstream block cannot switch off.
 */
export function applicableLinks(
  links: readonly LinkSpec[],
  policies: ReadonlyMap<string, PolicySpec>,
  groups: readonly GroupSpec[],
  principal: Principal,
): LinkSpec[] {
  const matching = links
    .filter((l) => linkMatches(l, principal))
    .sort(
      (a, b) =>
        PRECEDENCE.indexOf(a.container_kind as (typeof PRECEDENCE)[number]) -
          PRECEDENCE.indexOf(b.container_kind as (typeof PRECEDENCE)[number]) ||
        a.order - b.order,
    );

  const blocking = groups.filter(
    (g) => g.block_inheritance && (principal.groups ?? []).includes(g.id),
  );
  if (blocking.length === 0) return matching;

  // Everything strictly broader than the blocking group is dropped, unless it
  // is a deny term or an enforced link.
  return matching.filter((link) => {
    if (link.container_kind !== 'organisation') return true;
    if (link.enforced) return true;
    const policy = policies.get(link.policy_id);
    return (policy?.rule.forbidden_tags.length ?? 0) > 0;
  });
}

function contribution(
  policy: PolicySpec,
  link: LinkSpec,
  term: string,
  values: string[],
): PolicyContribution {
  return {
    policy_id: policy.id,
    policy_name: policy.name,
    linked_at:
      link.container_kind === 'organisation'
        ? 'organisation'
        : `${link.container_kind}:${link.target_id}`,
    term,
    values,
    enforced: link.enforced,
  };
}

/**
 * Would this principal be able to read a resource carrying these labels?
 *
 * The order of the checks IS the algebra, and it is the part most likely to
 * drift from the kernel:
 *   forbidden wins absolutely → required must all be present → every any_of
 *   clause needs one member → a closed label needs a matching grant.
 */
export function evaluateCell(
  principal: Principal,
  resourceTags: readonly string[],
  policies: readonly PolicySpec[],
  links: readonly LinkSpec[],
  groups: readonly GroupSpec[],
  closed: ReadonlySet<string>,
): CellVerdict {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const applicable = applicableLinks(links, byId, groups, principal);
  const decidedBy: PolicyContribution[] = [];
  const tags = new Set(resourceTags);

  let reportOnlyWouldDeny = false;

  // 1. Forbidden wins, absolutely. A grant cannot override it.
  for (const link of applicable) {
    const policy = byId.get(link.policy_id);
    if (!policy) continue;
    const hit = policy.rule.forbidden_tags.filter((t) => tags.has(t));
    if (hit.length > 0) {
      decidedBy.push(contribution(policy, link, 'forbidden', hit));
      if (policy.mode === 'report_only') {
        reportOnlyWouldDeny = true;
        continue;
      }
      return {
        state: 'denied',
        detail: hit.join(', '),
        decidedBy,
        reportOnly: false,
      };
    }
  }

  // 2. Every required tag must be present.
  for (const link of applicable) {
    const policy = byId.get(link.policy_id);
    if (!policy) continue;
    const missing = policy.rule.required_tags.filter((t) => !tags.has(t));
    if (missing.length > 0) {
      decidedBy.push(contribution(policy, link, 'required', missing));
      if (policy.mode === 'report_only') {
        reportOnlyWouldDeny = true;
        continue;
      }
      return {
        state: 'denied',
        detail: `missing ${missing.join(', ')}`,
        decidedBy,
        reportOnly: false,
      };
    }
  }

  // 3. Each any_of clause needs at least one member present.
  for (const link of applicable) {
    const policy = byId.get(link.policy_id);
    if (!policy) continue;
    const clause = policy.rule.any_of_tags;
    if (clause.length > 0 && !clause.some((t) => tags.has(t))) {
      decidedBy.push(contribution(policy, link, 'any_of', clause));
      if (policy.mode === 'report_only') {
        reportOnlyWouldDeny = true;
        continue;
      }
      return {
        state: 'denied',
        detail: `none of ${clause.join(', ')}`,
        decidedBy,
        reportOnly: false,
      };
    }
  }

  // 4. A closed label is deny-by-default: it needs a grant to be reachable.
  const closedHere = resourceTags.filter((t) => closed.has(t));
  if (closedHere.length > 0) {
    const granted = new Set<string>();
    for (const link of applicable) {
      const policy = byId.get(link.policy_id);
      if (!policy) continue;
      const hit = (policy.rule.granted_tags ?? []).filter((t) => closedHere.includes(t));
      if (hit.length > 0) {
        decidedBy.push(contribution(policy, link, 'granted', hit));
        hit.forEach((t) => granted.add(t));
      }
    }
    const ungranted = closedHere.filter((t) => !granted.has(t));
    if (ungranted.length > 0) {
      return {
        state: 'denied_by_default',
        detail: ungranted.join(', '),
        decidedBy,
        reportOnly: false,
      };
    }
    return {
      state: 'allowed_via_grant',
      detail: closedHere.join(', '),
      decidedBy,
      reportOnly: false,
    };
  }

  if (reportOnlyWouldDeny) {
    return {
      state: 'report_only_would_deny',
      detail: 'a report-only policy would have denied this',
      decidedBy,
      reportOnly: true,
    };
  }

  return { state: 'allowed', detail: '', decidedBy, reportOnly: false };
}

/**
 * The verdict, in the shape `DecisionCard` already renders.
 *
 * The trace renderer is reused rather than duplicated — the handoff is explicit
 * about that, and a second renderer would be a second place for the two to
 * drift apart in how they *describe* a decision on top of how they compute it.
 */
export function toDecision(verdict: CellVerdict): AccessDecision {
  const allowed =
    verdict.state === 'allowed' ||
    verdict.state === 'allowed_via_grant' ||
    verdict.state === 'report_only_would_deny';

  const reason =
    verdict.state === 'denied_by_default'
      ? 'forbidden_tag'
      : verdict.state === 'denied'
        ? 'forbidden_tag'
        : 'allowed';

  return {
    allowed,
    reason,
    detail: verdict.detail,
    decided_by: verdict.decidedBy,
    policy_version: 'computed in this console',
    report_only: verdict.reportOnly,
    would_have_denied: verdict.state === 'report_only_would_deny',
    explain: '',
  };
}

/** Does the kernel agree with what this module predicted? */
export function agreesWithKernel(
  verdict: CellVerdict,
  kernel: AccessDecision,
): boolean {
  const predictedAllowed =
    verdict.state === 'allowed' ||
    verdict.state === 'allowed_via_grant' ||
    verdict.state === 'report_only_would_deny';
  return predictedAllowed === kernel.allowed;
}
