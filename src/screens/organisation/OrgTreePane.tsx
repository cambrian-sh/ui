import { useEffect, useMemo, useReducer, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, ErrorState, ReasonField, useReasonGate } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { useCommandGate } from '@/lib/useCommandGate';
import {
  buildTree,
  descendants,
  editBlockedReason,
  formatLimit,
  initialTreeView,
  managerCandidates,
  treeReducer,
  type TreeNode,
} from '@/lib/hierarchy';
import type { OrgPerson, OrgUnit } from '@/ipc/types-hierarchy';
import { Notice, Section, SelectField, SourceBadge, TextField } from './shared';

const refreshOrg = () => void queryClient.invalidateQueries({ queryKey: ['org'] });

/** The org tree (units → sub-units, heads, members) with a detail editor. */
export function OrgTreePane() {
  const units = useKernelQuery(['org', 'units'], () => ipc.listOrgUnits());
  const people = useKernelQuery(['org', 'people'], () => ipc.listOrgPeople('', '', true));
  const [view, dispatch] = useReducer(treeReducer, initialTreeView);
  const tree = useMemo(() => buildTree(units.data ?? [], people.data ?? []), [units.data, people.data]);

  // Open the top level on first load.
  useEffect(() => {
    if (units.data && view.expanded.size === 0) {
      dispatch({ type: 'expandAll', unitIds: tree.roots.map((r) => r.unit.id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.data]);

  const error = units.error?.message ?? people.error?.message;
  const selectedUnit = view.selected?.kind === 'unit' ? units.data?.find((u) => u.id === view.selected!.id) : undefined;
  const selectedPerson = view.selected?.kind === 'person' ? people.data?.find((p) => p.principal_id === view.selected!.id) : undefined;

  const renderNode = (n: TreeNode): React.ReactNode => {
    const open = view.expanded.has(n.unit.id);
    const selected = view.selected?.kind === 'unit' && view.selected.id === n.unit.id;
    return (
      <li key={n.unit.id} role="treeitem" aria-expanded={open} aria-selected={selected} aria-level={n.depth + 1}>
        <div className={cn('flex items-center gap-1 rounded px-1 py-0.5', selected && 'bg-[var(--list-row-bg-hover)]')}>
          <button
            type="button"
            onClick={() => dispatch({ type: 'toggle', unitId: n.unit.id })}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${n.unit.name}`}
            className="rounded p-0.5 text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'select', selection: { kind: 'unit', id: n.unit.id } })}
            className="flex flex-1 items-center gap-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <span className="font-medium">{n.unit.name}</span>
            <SourceBadge source={n.unit.source} editable={n.unit.editable} />
            <span className="text-[11px] text-[var(--fg-muted)]">
              {n.head ? `head ${n.head.display_name}` : 'no head'} · {n.members.length} member{n.members.length === 1 ? '' : 's'}
            </span>
          </button>
        </div>
        {open && (
          <ul role="group" className="ml-4 border-l border-[var(--border-subtle)] pl-2">
            {n.members.map((p) => (
              <PersonRow key={p.principal_id} p={p} selected={view.selected?.id === p.principal_id} onSelect={() => dispatch({ type: 'select', selection: { kind: 'person', id: p.principal_id } })} />
            ))}
            {n.children.map(renderNode)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-4 px-[26px] py-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'expandAll', unitIds: (units.data ?? []).map((u) => u.id) })}>
            Expand all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'collapseAll' })}>
            Collapse all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'select', selection: { kind: 'unit', id: '' } })}>
            New unit
          </Button>
        </div>
        {error && <ErrorState reason={error} whatToDo="The organisation could not be read. Check the connection." />}
        {units.isLoading || people.isLoading ? (
          <p className="text-[12px] text-[var(--fg-muted)]">Loading the organisation…</p>
        ) : (
          <ul role="tree" aria-label="Organisation units" className="flex flex-col gap-0.5">
            {tree.roots.map(renderNode)}
            {tree.unassigned.length > 0 && (
              <li role="treeitem" aria-expanded aria-level={1}>
                <div className="px-1 py-0.5 text-[12px] text-[var(--fg-muted)]">Not in a unit</div>
                <ul role="group" className="ml-4 border-l border-[var(--border-subtle)] pl-2">
                  {tree.unassigned.map((p) => (
                    <PersonRow key={p.principal_id} p={p} selected={view.selected?.id === p.principal_id} onSelect={() => dispatch({ type: 'select', selection: { kind: 'person', id: p.principal_id } })} />
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </div>
      <aside aria-label="Details" className="flex flex-col gap-3">
        {view.selected?.kind === 'unit' && (
          <UnitEditor key={view.selected.id || 'new'} unit={selectedUnit} units={units.data ?? []} people={people.data ?? []} onDone={() => dispatch({ type: 'select', selection: null })} />
        )}
        {selectedPerson && <PersonEditor key={selectedPerson.principal_id} person={selectedPerson} units={units.data ?? []} people={people.data ?? []} />}
        {!view.selected && <p className="text-[12px] text-[var(--fg-muted)]">Select a unit or a person to see and edit it.</p>}
      </aside>
    </div>
  );
}

function PersonRow({ p, selected, onSelect }: { p: OrgPerson; selected: boolean; onSelect: () => void }) {
  return (
    <li role="treeitem" aria-selected={selected}>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
          selected && 'bg-[var(--list-row-bg-hover)]',
          p.status !== 'active' && 'opacity-60',
        )}
      >
        <span>{p.display_name || p.principal_id}</span>
        {p.title && <span className="text-[11px] text-[var(--fg-muted)]">{p.title}</span>}
        <SourceBadge source={p.source} editable={p.editable} />
        {p.status !== 'active' && <span className="text-[10.5px] text-[var(--status-warn)]">{p.status}</span>}
      </button>
    </li>
  );
}

function UnitEditor({ unit, units, people, onDone }: { unit?: OrgUnit; units: OrgUnit[]; people: OrgPerson[]; onDone: () => void }) {
  const gate = useCommandGate('change the organisation');
  const reason = useReasonGate();
  const blank: OrgUnit = { id: '', name: '', parent_id: '', head_id: '', source: 'editor', connection_id: '', external_id: '', member_count: 0, editable: true };
  const [draft, setDraft] = useState<OrgUnit>(unit ?? blank);
  const save = useMutation(ipc.saveOrgUnit);
  const del = useMutation(ipc.deleteOrgUnit);
  const blocked = unit ? editBlockedReason(unit) : undefined;
  const below = unit ? descendants(units, unit.id) : new Set<string>();
  const parents = [{ value: '', label: '— top level —' }, ...units.filter((u) => u.id !== unit?.id && !below.has(u.id)).map((u) => ({ value: u.id, label: u.name }))];
  const disabled = Boolean(gate || blocked);
  const onSave = async () => {
    const r = await save.mutate(draft, reason.reason);
    if (r) {
      reason.reset();
      refreshOrg();
      if (!unit) onDone();
    }
  };
  const onDelete = async () => {
    if (!unit) return;
    const r = await del.mutate(unit.id, reason.reason);
    if (r) {
      reason.reset();
      refreshOrg();
      onDone();
    }
  };
  return (
    <Section title={unit ? `Unit · ${unit.name}` : 'New unit'}>
      {blocked && <Notice>{blocked}</Notice>}
      <TextField id="unit-name" label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} disabled={disabled} />
      <SelectField id="unit-parent" label="Parent unit (move)" value={draft.parent_id} onChange={(parent_id) => setDraft({ ...draft, parent_id })} options={parents} disabled={disabled} />
      <SelectField
        id="unit-head"
        label="Head"
        value={draft.head_id}
        onChange={(head_id) => setDraft({ ...draft, head_id })}
        options={[{ value: '', label: '— none —' }, ...people.filter((p) => p.status === 'active').map((p) => ({ value: p.principal_id, label: p.display_name || p.principal_id }))]}
        disabled={disabled}
      />
      {!disabled && <ReasonField gate={reason} id="unit-reason" />}
      {(save.error || del.error) && <ErrorState reason={(save.error ?? del.error)!} whatToDo="Nothing was changed." />}
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled || !reason.satisfied || !draft.name.trim() || save.isLoading} title={gate ?? blocked} onClick={() => void onSave()}>
          {unit ? 'Save unit' : 'Create unit'}
        </Button>
        {unit && (
          <Button size="sm" variant="secondary" disabled={disabled || !reason.satisfied || del.isLoading} onClick={() => void onDelete()}>
            Delete unit
          </Button>
        )}
      </div>
    </Section>
  );
}

function PersonEditor({ person, units, people }: { person: OrgPerson; units: OrgUnit[]; people: OrgPerson[] }) {
  const gate = useCommandGate('change the organisation');
  const reason = useReasonGate();
  const [draft, setDraft] = useState<OrgPerson>(person);
  const save = useMutation(ipc.saveOrgPerson);
  const active = useMutation(ipc.setOrgPersonActive);
  const blocked = editBlockedReason(person);
  const disabled = Boolean(gate || blocked);
  const managers = managerCandidates(people, person.principal_id);
  const after = async (r: unknown) => {
    if (r) {
      reason.reset();
      refreshOrg();
    }
  };
  return (
    <Section title={person.display_name || person.principal_id}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-[var(--fg-muted)]">Person</dt>
        <dd className="font-mono">user:{person.principal_id}</dd>
        <dt className="text-[var(--fg-muted)]">Status</dt>
        <dd>{person.status}</dd>
        <dt className="text-[var(--fg-muted)]">Source</dt>
        <dd>{person.source}{person.connection_id ? ` · ${person.connection_id}` : ''}</dd>
        <dt className="text-[var(--fg-muted)]">Roles</dt>
        <dd>{person.roles.join(', ') || '—'}{person.rule_roles.length > 0 && <span className="text-[var(--fg-muted)]"> (from rules: {person.rule_roles.join(', ')})</span>}</dd>
        <dt className="text-[var(--fg-muted)]">Groups</dt>
        <dd>{person.rule_groups.join(', ') || '—'}</dd>
        <dt className="text-[var(--fg-muted)]">Directory groups</dt>
        <dd>{person.directory_groups.join(', ') || '—'}</dd>
        <dt className="text-[var(--fg-muted)]">Approval limits</dt>
        <dd>{person.approval_limits.length ? person.approval_limits.map((l) => <div key={`${l.class}/${l.measure}`}>{formatLimit(l)}</div>) : '—'}</dd>
      </dl>
      {blocked && <Notice>{blocked}</Notice>}
      <TextField id="person-title" label="Title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} disabled={disabled} />
      <SelectField
        id="person-unit"
        label="Unit"
        value={draft.unit_id}
        onChange={(unit_id) => setDraft({ ...draft, unit_id })}
        options={[{ value: '', label: '— none —' }, ...units.map((u) => ({ value: u.id, label: u.name }))]}
        disabled={disabled}
      />
      <SelectField
        id="person-manager"
        label="Manager"
        value={draft.manager_id}
        onChange={(manager_id) => setDraft({ ...draft, manager_id })}
        options={[{ value: '', label: '— none —' }, ...managers.map((m) => ({ value: m.principal_id, label: m.display_name || m.principal_id }))]}
        disabled={disabled}
      />
      {!disabled && <ReasonField gate={reason} id="person-reason" />}
      {(save.error || active.error) && <ErrorState reason={(save.error ?? active.error)!} whatToDo="Nothing was changed." />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled || !reason.satisfied || save.isLoading} title={gate ?? blocked} onClick={() => void save.mutate(draft, reason.reason).then(after)}>
          Save person
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !reason.satisfied || active.isLoading}
          onClick={() => void active.mutate(person.principal_id, person.status !== 'active', reason.reason).then(after)}
        >
          {person.status === 'active' ? 'Suspend' : 'Reactivate'}
        </Button>
      </div>
      {person.status === 'active' && !disabled && (
        <p className="text-[10.5px] text-[var(--fg-muted)]">Suspending revokes access and withdraws their pending approvals; it deletes nothing.</p>
      )}
    </Section>
  );
}
