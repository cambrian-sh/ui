import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GroupTree } from './GroupTree';
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

const ORG = [
  group({ id: 'org', members: ['alice'], subgroups: ['support', 'eng'] }),
  group({ id: 'support', members: ['bob', 'carol'] }),
  group({ id: 'eng', members: ['dave'], subgroups: ['platform'] }),
  group({ id: 'platform', members: ['erin'] }),
];

describe('GroupTree', () => {
  it('renders the hierarchy as a tree, with depth exposed to assistive tech', () => {
    render(<GroupTree groups={ORG} selectedId={null} onSelect={() => {}} />);

    const tree = screen.getByRole('tree', { name: 'Group hierarchy' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items).toHaveLength(4);

    // Nesting is the thing being administered, so it has to survive into the
    // accessibility tree rather than being purely an indent.
    expect(screen.getByText('org').closest('[role="treeitem"]')).toHaveAttribute(
      'aria-level',
      '1',
    );
    expect(screen.getByText('platform').closest('[role="treeitem"]')).toHaveAttribute(
      'aria-level',
      '3',
    );
  });

  it('rolls principal counts up the tree rather than showing direct members only', () => {
    render(<GroupTree groups={ORG} selectedId={null} onSelect={() => {}} />);

    // The question this screen exists to answer.
    expect(screen.getByText(/5 principals through 3 nested groups/)).toBeInTheDocument();
    // A leaf has no nesting, so it says "directly".
    expect(screen.getByText(/2 principals directly/)).toBeInTheDocument();
  });

  it('draws block-inheritance as a break in the line, not a badge', () => {
    const blocked = [
      group({ id: 'org', subgroups: ['support'] }),
      group({ id: 'support', members: ['bob'], block_inheritance: true }),
    ];
    render(<GroupTree groups={blocked} selectedId={null} onSelect={() => {}} />);

    // The severance is the policy consequence, so it is stated where it happens.
    expect(screen.getByText('inheritance stops here')).toBeInTheDocument();
  });

  it('says nothing about inheritance when nothing blocks it', () => {
    render(<GroupTree groups={ORG} selectedId={null} onSelect={() => {}} />);
    expect(screen.queryByText('inheritance stops here')).not.toBeInTheDocument();
  });

  it('marks a group nested under two parents as the same group, not a copy', () => {
    const diamond = [
      group({ id: 'org', subgroups: ['left', 'right'] }),
      group({ id: 'left', subgroups: ['shared'] }),
      group({ id: 'right', subgroups: ['shared'] }),
      group({ id: 'shared', members: ['alice'] }),
    ];
    render(<GroupTree groups={diamond} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText('also above')).toBeInTheDocument();
    // Counted once, in one place — repeating the subtree would double every
    // number the operator reads off the screen.
    expect(screen.getAllByText('shared')).toHaveLength(2);
  });

  it('surfaces a nesting cycle instead of rendering nothing', () => {
    // Two groups pointing at each other have no root at all, so a naive tree
    // would render an empty pane over data that definitely exists.
    const cyclic = [
      group({ id: 'a', subgroups: ['b'] }),
      group({ id: 'b', subgroups: ['a'] }),
    ];
    render(<GroupTree groups={cyclic} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText('UNREACHABLE')).toBeInTheDocument();
    expect(screen.getByText(/cannot resolve/)).toBeInTheDocument();
  });

  it('names a subgroup that was referenced but never defined', () => {
    render(
      <GroupTree
        groups={[group({ id: 'org', subgroups: ['ghost'] })]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('MISSING SUBGROUP')).toBeInTheDocument();
    expect(screen.getByText(/nobody inherits through it/)).toBeInTheDocument();
  });

  it('selects a group when its row is clicked', () => {
    const onSelect = vi.fn();
    render(<GroupTree groups={ORG} selectedId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('support'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'support' }));
  });

  it('renders the empty state rather than an empty tree', () => {
    render(<GroupTree groups={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/No groups yet/)).toBeInTheDocument();
  });
});
