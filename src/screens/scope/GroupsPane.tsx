import { useState } from 'react';
import { ipc } from '@/ipc';
import type { GroupSpec } from '@/ipc/types';
import { Button, EmptyState, Input, ScrollArea } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { cn } from '@/design-system/lib/utils';

const BLANK: GroupSpec = {
  id: '',
  name: '',
  members: [],
  subgroups: [],
  block_inheritance: false,
};

interface GroupsPaneProps {
  groups: GroupSpec[];
  principals: string[];
  onChanged: () => void | Promise<void>;
}

function parseList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Groups — the containers policy attaches to.
 *
 * Membership is transitive: a member of a subgroup is a member of every ancestor,
 * so a policy linked high up reaches everyone beneath it. That is the property
 * that makes the model administrable, and the reason this screen shows nesting
 * rather than a flat member list.
 */
export function GroupsPane({ groups, principals, onChanged }: GroupsPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupSpec>(BLANK);
  const [membersText, setMembersText] = useState('');
  const [subgroupsText, setSubgroupsText] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);

  const select = (g: GroupSpec) => {
    setSelectedId(g.id);
    setDraft(g);
    setMembersText(g.members.join(', '));
    setSubgroupsText(g.subgroups.join(', '));
    setSaveError('');
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(BLANK);
    setMembersText('');
    setSubgroupsText('');
    setSaveError('');
  };

  const save = async () => {
    setBusy(true);
    setSaveError('');
    try {
      const outcome = await ipc.saveGroup({
        ...draft,
        members: parseList(membersText),
        subgroups: parseList(subgroupsText),
      });
      if (!outcome.ok) {
        // A nesting cycle is an authoring outcome with a readable path — it
        // belongs beside the field, not in a failure toast.
        setSaveError(outcome.error);
        return;
      }
      await onChanged();
      setSelectedId(draft.id);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await ipc.deleteGroup(id);
      await onChanged();
      if (selectedId === id) startNew();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border-subtle)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--fg-primary)]">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </span>
          <Button variant="secondary" size="sm" onClick={startNew}>
            New
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {groups.length === 0 ? (
            <p className="p-4 text-xs text-[var(--fg-muted)]">
              No groups yet. A group is a named set of principals that policy can be linked to —
              administering twelve of these beats administering five hundred people.
            </p>
          ) : (
            <ul role="list" aria-label="Groups" className="divide-y divide-[var(--border-subtle)]">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => select(g)}
                    aria-pressed={selectedId === g.id}
                    className={cn(
                      'w-full px-3 py-2 text-left transition-colors hover:bg-[var(--list-row-bg-hover)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
                      selectedId === g.id && 'bg-[var(--list-row-bg-selected)]',
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm text-[var(--fg-primary)]">
                        {g.name || g.id}
                      </span>
                      {g.block_inheritance && (
                        <span
                          className="shrink-0 text-xs text-[var(--color-status-warn)]"
                          title="Stops policy accumulating from above"
                        >
                          blocks
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--fg-muted)]">
                      {g.members.length} member{g.members.length === 1 ? '' : 's'}
                      {g.subgroups.length > 0 && <> · {g.subgroups.length} nested</>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="grp-id" className="text-xs font-medium text-[var(--fg-primary)]">
                Id
              </label>
              <Input
                id="grp-id"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="support-team"
                disabled={selectedId !== null}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label htmlFor="grp-name" className="text-xs font-medium text-[var(--fg-primary)]">
                Name
              </label>
              <Input
                id="grp-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Support"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="grp-members" className="text-xs font-medium text-[var(--fg-primary)]">
              Members
            </label>
            <p className="mb-1 text-xs text-[var(--fg-muted)]">
              Principal ids, comma-separated. Known agents:{' '}
              {principals.length > 0 ? principals.slice(0, 6).join(', ') : 'none registered'}
              {principals.length > 6 && '…'}
            </p>
            <Input
              id="grp-members"
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label htmlFor="grp-subgroups" className="text-xs font-medium text-[var(--fg-primary)]">
              Nested groups
            </label>
            <p className="mb-1 text-xs text-[var(--fg-muted)]">
              Group ids, comma-separated. Membership is transitive, so anyone in a nested group
              inherits this group’s policy too.
            </p>
            <Input
              id="grp-subgroups"
              value={subgroupsText}
              onChange={(e) => setSubgroupsText(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-[var(--fg-secondary)]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.block_inheritance}
              onChange={(e) => setDraft({ ...draft, block_inheritance: e.target.checked })}
            />
            <span>
              <span className="font-medium text-[var(--fg-primary)]">Block inheritance</span>
              <span className="block text-[var(--fg-muted)]">
                Stops policy accumulating from containers above this one — except denies, which
                are never removable, and except links marked Enforced.
              </span>
            </span>
          </label>

          {saveError && (
            <ErrorState
              reason={saveError}
              whatToDo="A group cannot contain itself, directly or through a chain. Break the loop shown above and save again."
            />
          )}

          <div className="flex gap-2 border-t border-[var(--border-subtle)] pt-4">
            <Button onClick={() => void save()} disabled={!draft.id.trim() || busy}>
              {selectedId ? 'Save group' : 'Create group'}
            </Button>
            {selectedId && (
              <Button variant="secondary" onClick={() => void remove(selectedId)} disabled={busy}>
                Delete
              </Button>
            )}
          </div>

          {!selectedId && groups.length === 0 && (
            <EmptyState
              title="Start with the shape of the org"
              body="Create the broad container first, then nest the narrow ones inside it. Policy linked to the outer group reaches everyone below."
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
