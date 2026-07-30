import { useMemo } from 'react';
import { cn } from '@/design-system/lib/utils';
import type { GroupSpec } from '@/ipc/types';
import { buildGroupTree, describeRollup, rollUp, type GroupNode } from './groupHierarchy';

export interface GroupTreeProps {
  groups: GroupSpec[];
  selectedId: string | null;
  onSelect: (group: GroupSpec) => void;
}

/**
 * The group hierarchy, drawn.
 *
 * Two things this gets right that a flat list cannot:
 *
 * 1. **Block-inheritance is a break in the line.** A group that stops inheriting
 *    is a discontinuity you can see while scanning, not a checkbox you have to
 *    open a detail pane to find. The connector into it is severed and labelled,
 *    because that severance *is* the policy consequence.
 * 2. **Principal counts roll up.** "23 principals through 2 nested groups" is
 *    the question an operator brings to this screen, and it cannot be answered
 *    from a row that only knows its own members.
 */
export function GroupTree({ groups, selectedId, onSelect }: GroupTreeProps) {
  const tree = useMemo(() => buildGroupTree(groups), [groups]);

  if (groups.length === 0) {
    return (
      <p className="p-4 text-xs text-[var(--fg-muted)]">
        No groups yet. A group is a named set of principals that policy can be linked to —
        administering twelve of these beats administering five hundred people.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul role="tree" aria-label="Group hierarchy" className="flex flex-col py-1">
        {tree.roots.map((node) => (
          <TreeRow
            key={node.group.id}
            node={node}
            groups={groups}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {/* Faults, named. Each of these is data the kernel will hand back, and
          each one is invisible in a flat list. */}
      {tree.orphaned.length > 0 && (
        <Fault tone="var(--status-err)" kicker="UNREACHABLE">
          {tree.orphaned.map((g) => g.name || g.id).join(', ')}{' '}
          {tree.orphaned.length === 1 ? 'is' : 'are'} only reachable through a cycle, so{' '}
          {tree.orphaned.length === 1 ? 'it has' : 'they have'} no place in the hierarchy above.
          A group that contains itself through a chain cannot resolve.
        </Fault>
      )}

      {tree.cyclic.length > 0 && tree.orphaned.length === 0 && (
        <Fault tone="var(--status-err)" kicker="NESTING CYCLE">
          {tree.cyclic.join(', ')} form a loop. Membership is transitive, so a loop has no
          outermost container and policy cannot be resolved through it.
        </Fault>
      )}

      {tree.dangling.length > 0 && (
        <Fault tone="var(--status-warn)" kicker="MISSING SUBGROUP">
          {tree.dangling.map((d) => (
            <span key={`${d.parent}-${d.missing}`} className="block">
              <code>{d.parent}</code> nests <code>{d.missing}</code>, which does not exist —
              nobody inherits through it.
            </span>
          ))}
        </Fault>
      )}
    </div>
  );
}

function TreeRow({
  node,
  groups,
  selectedId,
  onSelect,
}: {
  node: GroupNode;
  groups: GroupSpec[];
  selectedId: string | null;
  onSelect: (group: GroupSpec) => void;
}) {
  const { group, depth, repeated, cycle } = node;
  const rollup = useMemo(() => rollUp(groups, group.id), [groups, group.id]);
  const blocks = group.block_inheritance;
  const selected = selectedId === group.id;

  return (
    <>
      <li role="treeitem" aria-selected={selected} aria-level={depth + 1}>
        {/* The break. Rendered ABOVE the row it applies to, spanning the
            connector, so the discontinuity sits exactly where inheritance
            stops rather than as a badge beside the name. */}
        {blocks && depth > 0 && (
          <div
            className="flex items-center gap-2 py-0.5"
            style={{ paddingLeft: gutter(depth) }}
            aria-hidden="true"
          >
            <span className="h-px flex-1 border-t border-dashed border-[var(--status-warn)]" />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
              inheritance stops here
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onSelect(group)}
          aria-pressed={selected}
          className={cn(
            'flex w-full items-start gap-2 py-1.5 pr-3 text-left transition-colors',
            'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
            selected && 'bg-[var(--list-row-bg-selected)]',
          )}
          style={{ paddingLeft: gutter(depth) }}
        >
          {/* The connector into this row. Solid when policy flows through it,
              absent at the root, and never drawn solid under a break. */}
          {depth > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'mt-[7px] h-px w-3 shrink-0',
                blocks ? 'bg-transparent' : 'bg-[var(--border-strong)]',
              )}
            />
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  'truncate text-[13px]',
                  repeated && !cycle
                    ? 'text-[var(--fg-muted)]'
                    : 'text-[var(--fg-primary)]',
                )}
              >
                {group.name || group.id}
              </span>

              {cycle && (
                <span className="shrink-0 font-mono text-[10px] text-[var(--status-err)]">
                  cycle
                </span>
              )}

              {/* A diamond is legal: the same group inherited through two
                  paths. Marked so it does not read as a duplicate row. */}
              {repeated && !cycle && (
                <span
                  className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]"
                  title="Also nested elsewhere — the same group, not a copy"
                >
                  also above
                </span>
              )}
            </span>

            {!repeated && (
              <span className="mt-0.5 block text-[11.5px] text-[var(--fg-muted)]">
                {describeRollup(rollup)}
                {rollup.nestedGroups > 0 && rollup.directMembers > 0 && (
                  <> · {rollup.directMembers} directly here</>
                )}
              </span>
            )}
          </span>
        </button>
      </li>

      {/* A repeated node is not expanded again — its children are already drawn
          under its first appearance, and drawing them twice would double every
          count the operator reads off the screen. */}
      {!repeated &&
        node.children.map((child) => (
          <TreeRow
            key={`${group.id}-${child.group.id}`}
            node={child}
            groups={groups}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

/** Indent per level, leaving room for the connector stub. */
function gutter(depth: number): number {
  return 12 + depth * 16;
}

function Fault({
  tone,
  kicker,
  children,
}: {
  tone: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="m-2 flex flex-col gap-1 rounded-md p-2.5 tint-wash tint-ring"
      style={{ '--tint': tone } as React.CSSProperties}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: tone }}
      >
        {kicker}
      </span>
      <span className="text-[11.5px] leading-[1.55] text-[var(--fg-primary)]">{children}</span>
    </div>
  );
}
