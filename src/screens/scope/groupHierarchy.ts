import type { GroupSpec } from '@/ipc/types';

/**
 * Groups form a DAG, not a tree.
 *
 * Nothing stops a group being nested under two parents, and that is a legitimate
 * shape: a principal then inherits policy through both paths. So this module
 * says "tree" for what it *renders* and is careful everywhere else — a node can
 * appear more than once, and the second appearance is the same group rather than
 * a copy.
 *
 * It also has to survive a **cycle**. A group containing itself through a chain
 * is an authoring outcome the kernel reports rather than an impossible state, so
 * a naive walk here would hang the console on data the kernel will happily hand
 * back.
 */

export interface GroupNode {
  group: GroupSpec;
  depth: number;
  children: GroupNode[];
  /**
   * True when this group has already been rendered elsewhere in the tree —
   * a diamond, not a duplicate. Its children are not expanded again.
   */
  repeated: boolean;
  /**
   * Set when following this edge would re-enter a group already on the path.
   * The edge is drawn and then stopped, because the cycle is the thing the
   * operator needs to see.
   */
  cycle: boolean;
}

export interface GroupTree {
  roots: GroupNode[];
  /** Subgroup ids referenced by some group but never defined. */
  dangling: { parent: string; missing: string }[];
  /** Groups involved in a cycle, so the pane can name them. */
  cyclic: string[];
  /**
   * Groups that exist but are unreachable from any root because every path into
   * them is inside a cycle. Without this they would silently not render.
   */
  orphaned: GroupSpec[];
}

/**
 * Distinct principals reachable from a group, and how much nesting it took.
 *
 * The count is **deduplicated across the whole subtree**: a principal who is a
 * member of two nested groups is one person, and a rolled-up count that says
 * otherwise overstates the blast radius of every policy linked here.
 */
export interface Rollup {
  /** Distinct principals, including this group's own members. */
  principals: number;
  /** Distinct descendant groups. */
  nestedGroups: number;
  /** Members declared directly on this group. */
  directMembers: number;
}

function byId(groups: readonly GroupSpec[]): Map<string, GroupSpec> {
  return new Map(groups.map((g) => [g.id, g]));
}

/**
 * Build the renderable tree.
 *
 * Roots are groups nothing nests. A cycle has no root by definition, so its
 * members surface through `orphaned` rather than vanishing.
 */
export function buildGroupTree(groups: readonly GroupSpec[]): GroupTree {
  const index = byId(groups);
  const referenced = new Set<string>();
  const dangling: { parent: string; missing: string }[] = [];

  for (const g of groups) {
    for (const sub of g.subgroups) {
      if (index.has(sub)) referenced.add(sub);
      else dangling.push({ parent: g.id, missing: sub });
    }
  }

  const roots = groups.filter((g) => !referenced.has(g.id));
  const seen = new Set<string>();
  const cyclic = new Set<string>();

  const walk = (group: GroupSpec, depth: number, path: Set<string>): GroupNode => {
    // A repeat that is NOT on the current path is a diamond; a repeat that IS
    // on the path is a cycle. They read very differently and must not be
    // collapsed into one "already seen" case.
    const onPath = path.has(group.id);
    if (onPath) {
      cyclic.add(group.id);
      return { group, depth, children: [], repeated: true, cycle: true };
    }

    const repeated = seen.has(group.id);
    seen.add(group.id);
    if (repeated) {
      return { group, depth, children: [], repeated: true, cycle: false };
    }

    const nextPath = new Set(path).add(group.id);
    const children = group.subgroups
      .map((id) => index.get(id))
      .filter((g): g is GroupSpec => Boolean(g))
      .map((child) => walk(child, depth + 1, nextPath));

    return { group, depth, children, repeated: false, cycle: false };
  };

  const built = roots.map((g) => walk(g, 0, new Set()));

  // Anything never visited is inside a cycle with no way in from a root.
  const orphaned = groups.filter((g) => !seen.has(g.id));
  for (const g of orphaned) cyclic.add(g.id);

  return {
    roots: built,
    dangling,
    cyclic: Array.from(cyclic).sort(),
    orphaned,
  };
}

/**
 * Roll principal counts up the DAG.
 *
 * Traversal is cycle-safe: a group already on the path contributes nothing more
 * rather than recursing forever.
 */
export function rollUp(groups: readonly GroupSpec[], id: string): Rollup {
  const index = byId(groups);
  const principals = new Set<string>();
  const nested = new Set<string>();

  const visit = (groupId: string, path: Set<string>) => {
    if (path.has(groupId)) return;
    const group = index.get(groupId);
    if (!group) return;
    const nextPath = new Set(path).add(groupId);
    for (const m of group.members) principals.add(m);
    for (const sub of group.subgroups) {
      if (!index.has(sub)) continue;
      nested.add(sub);
      visit(sub, nextPath);
    }
  };

  visit(id, new Set());
  const self = index.get(id);

  return {
    principals: principals.size,
    nestedGroups: nested.size,
    directMembers: self?.members.length ?? 0,
  };
}

/**
 * "23 principals through 2 nested groups" — the sentence this screen exists to
 * answer.
 *
 * Says "directly" when there is no nesting, because "through 0 nested groups"
 * is a sentence nobody writes.
 */
export function describeRollup(r: Rollup): string {
  const people = `${r.principals} principal${r.principals === 1 ? '' : 's'}`;
  if (r.nestedGroups === 0) return `${people} directly`;
  return `${people} through ${r.nestedGroups} nested group${r.nestedGroups === 1 ? '' : 's'}`;
}
