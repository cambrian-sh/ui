import { describe, expect, it } from 'vitest';
import { buildGroupTree, describeRollup, rollUp } from './groupHierarchy';
import type { GroupSpec } from '@/ipc/types';

function group(over: Partial<GroupSpec> & { id: string }): GroupSpec {
  return {
    name: over.id,
    members: [],
    subgroups: [],
    block_inheritance: false,
    ...over,
  };
}

describe('buildGroupTree', () => {
  it('roots the groups nothing nests', () => {
    const tree = buildGroupTree([
      group({ id: 'org', subgroups: ['support'] }),
      group({ id: 'support' }),
    ]);

    expect(tree.roots.map((n) => n.group.id)).toEqual(['org']);
    expect(tree.roots[0].children.map((n) => n.group.id)).toEqual(['support']);
  });

  it('carries depth so the tree can be indented', () => {
    const tree = buildGroupTree([
      group({ id: 'a', subgroups: ['b'] }),
      group({ id: 'b', subgroups: ['c'] }),
      group({ id: 'c' }),
    ]);

    expect(tree.roots[0].depth).toBe(0);
    expect(tree.roots[0].children[0].depth).toBe(1);
    expect(tree.roots[0].children[0].children[0].depth).toBe(2);
  });

  it('survives a cycle instead of hanging, and names the groups in it', () => {
    // A group containing itself through a chain is an authoring outcome the
    // kernel reports, not an impossible state — so the console is handed this
    // data and a naive walk would never return.
    const tree = buildGroupTree([
      group({ id: 'a', subgroups: ['b'] }),
      group({ id: 'b', subgroups: ['a'] }),
    ]);

    expect(tree.cyclic).toContain('a');
    expect(tree.cyclic).toContain('b');
  });

  it('never loses a group that is only reachable inside a cycle', () => {
    // Two groups pointing at each other have no root, so neither would appear
    // in the tree at all. Silently rendering nothing is the worst outcome here.
    const tree = buildGroupTree([
      group({ id: 'a', subgroups: ['b'] }),
      group({ id: 'b', subgroups: ['a'] }),
    ]);

    expect(tree.roots).toHaveLength(0);
    expect(tree.orphaned.map((g) => g.id).sort()).toEqual(['a', 'b']);
  });

  it('distinguishes a diamond from a cycle', () => {
    // Both are "seen this before". One is legal and common; the other is a
    // fault. Collapsing them would either cry wolf or hide a loop.
    const tree = buildGroupTree([
      group({ id: 'org', subgroups: ['left', 'right'] }),
      group({ id: 'left', subgroups: ['shared'] }),
      group({ id: 'right', subgroups: ['shared'] }),
      group({ id: 'shared' }),
    ]);

    const left = tree.roots[0].children.find((n) => n.group.id === 'left')!;
    const right = tree.roots[0].children.find((n) => n.group.id === 'right')!;

    expect(left.children[0].repeated).toBe(false);
    expect(right.children[0].repeated).toBe(true);
    expect(right.children[0].cycle).toBe(false);
    expect(tree.cyclic).toHaveLength(0);
  });

  it('reports a subgroup id that was referenced but never defined', () => {
    const tree = buildGroupTree([group({ id: 'org', subgroups: ['ghost'] })]);
    expect(tree.dangling).toEqual([{ parent: 'org', missing: 'ghost' }]);
    // The dangling reference must not become a phantom child.
    expect(tree.roots[0].children).toHaveLength(0);
  });

  it('does not treat a dangling reference as nesting the parent', () => {
    // `ghost` is referenced but absent, so `org` is still a root.
    const tree = buildGroupTree([group({ id: 'org', subgroups: ['ghost'] })]);
    expect(tree.roots.map((n) => n.group.id)).toEqual(['org']);
  });
});

describe('rollUp', () => {
  const org = [
    group({ id: 'org', members: ['alice'], subgroups: ['support', 'eng'] }),
    group({ id: 'support', members: ['bob', 'carol'] }),
    group({ id: 'eng', members: ['dave'], subgroups: ['platform'] }),
    group({ id: 'platform', members: ['erin'] }),
  ];

  it('counts every principal beneath a group', () => {
    expect(rollUp(org, 'org').principals).toBe(5);
    expect(rollUp(org, 'org').nestedGroups).toBe(3);
  });

  it('counts a principal once even when they are in two nested groups', () => {
    // A rolled-up count that double-counts overstates the blast radius of every
    // policy linked here, which is the number an operator uses to decide
    // whether enforcing is safe.
    const shared = [
      group({ id: 'org', subgroups: ['a', 'b'] }),
      group({ id: 'a', members: ['alice'] }),
      group({ id: 'b', members: ['alice'] }),
    ];
    expect(rollUp(shared, 'org').principals).toBe(1);
  });

  it('keeps direct membership separate from the rolled-up total', () => {
    const r = rollUp(org, 'org');
    expect(r.directMembers).toBe(1);
    expect(r.principals).toBe(5);
  });

  it('terminates on a cycle', () => {
    const cyclic = [
      group({ id: 'a', members: ['alice'], subgroups: ['b'] }),
      group({ id: 'b', members: ['bob'], subgroups: ['a'] }),
    ];
    expect(rollUp(cyclic, 'a').principals).toBe(2);
  });

  it('ignores a subgroup id that does not resolve', () => {
    const r = rollUp([group({ id: 'org', members: ['alice'], subgroups: ['ghost'] })], 'org');
    expect(r.principals).toBe(1);
    expect(r.nestedGroups).toBe(0);
  });

  it('is empty for a group that does not exist', () => {
    expect(rollUp([], 'nope')).toEqual({
      principals: 0,
      nestedGroups: 0,
      directMembers: 0,
    });
  });
});

describe('describeRollup', () => {
  it('answers the question this screen exists for', () => {
    expect(describeRollup({ principals: 23, nestedGroups: 2, directMembers: 4 })).toBe(
      '23 principals through 2 nested groups',
    );
  });

  it('says "directly" rather than "through 0 nested groups"', () => {
    expect(describeRollup({ principals: 3, nestedGroups: 0, directMembers: 3 })).toBe(
      '3 principals directly',
    );
  });

  it('gets the singulars right', () => {
    expect(describeRollup({ principals: 1, nestedGroups: 1, directMembers: 0 })).toBe(
      '1 principal through 1 nested group',
    );
  });
});
