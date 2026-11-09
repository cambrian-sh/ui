import { useReducer, useState } from 'react';
import { Button, ErrorState, ReasonField, useReasonGate } from '@/design-system/components';
import { ipc } from '@/ipc';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { useCommandGate } from '@/lib/useCommandGate';
import { emptyRule, formatLimit, previewLines, ruleDigest, ruleFlowReducer, saveBlockedReason, type RuleFlow } from '@/lib/hierarchy';
import { errorMessage } from '@/lib/errorMessage';
import type { ApprovalLimit, MappingReport, MappingRule } from '@/ipc/types-hierarchy';
import { Notice, Section, TextField, formatTime, fromList, toList } from './shared';

const refreshOrg = () => void queryClient.invalidateQueries({ queryKey: ['org'] });

/**
 * Mapping rules (ADR-0142 D5): match directory attributes, assign roles,
 * groups, policy links and approval limits. Saving APPLIES the rule set, so
 * the editor requires a preview of exactly the rule being saved.
 */
export function MappingRulesPane() {
  const rules = useKernelQuery(['org', 'rules'], () => ipc.listMappingRules());
  const [editing, setEditing] = useState<MappingRule | null>(null);
  return (
    <div className="grid gap-4 px-[26px] py-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(emptyRule())}>
            New rule
          </Button>
          <ReapplyAll />
        </div>
        {rules.error && <ErrorState reason={rules.error.message} whatToDo="The rules could not be read." />}
        <ul className="flex flex-col gap-1.5" aria-label="Mapping rules">
          {(rules.data ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setEditing(structuredClone(r))}
                aria-current={editing?.id === r.id ? 'true' : undefined}
                className="flex w-full flex-col items-start gap-0.5 rounded-md p-2 text-left shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <span className="text-[13px] font-medium">
                  {r.name} {!r.enabled && <span className="text-[11px] text-[var(--fg-muted)]">(disabled)</span>}
                  {r.privileged && <span className="ml-1 text-[11px] text-[var(--status-warn)]">privileged</span>}
                </span>
                <span className="text-[11.5px] text-[var(--fg-muted)]">{summariseRule(r)}</span>
                <span className="text-[10.5px] text-[var(--fg-muted)]">
                  v{r.version} · priority {r.priority} · {r.updated_by || '—'} · {formatTime(r.updated_at_unix_ms)}
                </span>
              </button>
            </li>
          ))}
          {rules.data?.length === 0 && <li className="text-[12px] text-[var(--fg-muted)]">No rules yet. People keep only the roles and groups given to them by hand.</li>}
        </ul>
      </div>
      {editing && <RuleEditor key={editing.id || 'new'} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function summariseRule(r: MappingRule): string {
  const m = r.match;
  const conds = [
    m?.match_all && 'everyone',
    m?.groups.length && `group ${m.groups.join('/')}`,
    m?.departments.length && `department ${m.departments.join('/')}`,
    m?.titles.length && `title ${m.titles.join('/')}`,
    m?.units.length && `unit ${m.units.join('/')}`,
    ...Object.entries(m?.attributes ?? {}).map(([k, v]) => `${k}=${v}`),
  ].filter(Boolean);
  const a = r.assign;
  const gives = [
    a?.roles.length && `roles ${a.roles.join(', ')}`,
    a?.groups.length && `groups ${a.groups.join(', ')}`,
    a?.policy_links.length && `policies ${a.policy_links.join(', ')}`,
    a?.approval_limits.length && `${a.approval_limits.length} approval limit(s)`,
  ].filter(Boolean);
  return `When ${conds.join(' and ') || 'nothing (matches nobody)'} → ${gives.join('; ') || 'nothing'}`;
}

function ReportView({ report, title }: { report: MappingReport; title: string }) {
  const lines = previewLines(report);
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <h3 className="text-[12.5px] font-medium">
        {title}: {lines.length === 0 ? 'nobody' : `${lines.length} ${lines.length === 1 ? 'person' : 'people'}`} (of {report.people_evaluated} evaluated)
      </h3>
      {lines.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md p-2 font-mono text-[11.5px] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {report.conflicts.map((c) => (
        <Notice key={c}>Conflict: {c}</Notice>
      ))}
      {report.errors.map((e) => (
        <Notice key={e} tone="warn">
          Could not be applied: {e}
        </Notice>
      ))}
    </div>
  );
}

function RuleEditor({ initial, onClose }: { initial: MappingRule; onClose: () => void }) {
  const gate = useCommandGate('change mapping rules');
  const reason = useReasonGate();
  const [rule, setRule] = useState<MappingRule>(initial);
  const [flow, dispatch] = useReducer(ruleFlowReducer, { step: 'editing' } as RuleFlow);
  const save = useMutation(ipc.saveMappingRule);
  const del = useMutation(ipc.deleteMappingRule);
  const [deletePreview, setDeletePreview] = useState<MappingReport | null>(null);
  const m = rule.match ?? emptyRule().match!;
  const a = rule.assign ?? emptyRule().assign!;

  // Every edit invalidates the preview: the person must see what they save.
  const edit = (next: MappingRule) => {
    setRule(next);
    if (flow.step !== 'editing') dispatch({ type: 'edit' });
  };
  const setMatch = (patch: Partial<typeof m>) => edit({ ...rule, match: { ...m, ...patch } });
  const setAssign = (patch: Partial<typeof a>) => edit({ ...rule, assign: { ...a, ...patch } });
  const setLimit = (i: number, patch: Partial<ApprovalLimit>) =>
    setAssign({ approval_limits: a.approval_limits.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const onPreview = async () => {
    dispatch({ type: 'preview' });
    const digest = ruleDigest(rule);
    try {
      const report = await ipc.previewMappingRules(rule, '');
      dispatch({ type: 'previewed', report, digest });
    } catch (err) {
      dispatch({ type: 'failed', error: errorMessage(err) });
    }
  };
  const onSave = async () => {
    dispatch({ type: 'save' });
    const r = await save.mutate(rule, reason.reason);
    if (r) {
      dispatch({ type: 'saved', report: r.report });
      reason.reset();
      refreshOrg();
      if (r.rule) setRule(r.rule);
    } else {
      dispatch({ type: 'edit' });
    }
  };
  const onPreviewDelete = async () => {
    try {
      setDeletePreview(await ipc.previewMappingRules(null, rule.id));
    } catch (err) {
      dispatch({ type: 'failed', error: errorMessage(err) });
    }
  };
  const onDelete = async () => {
    const r = await del.mutate(rule.id, reason.reason);
    if (r) {
      refreshOrg();
      onClose();
    }
  };

  const blocked = saveBlockedReason(flow, rule);
  const disabled = Boolean(gate);
  const limitsUi = (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] text-[var(--fg-secondary)]">Approval limits</span>
      {a.approval_limits.map((l, i) => (
        <fieldset key={i} className="grid grid-cols-2 gap-2 rounded-md p-2 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <legend className="sr-only">Limit {i + 1}</legend>
          <TextField id={`lim-class-${i}`} label="Action class" value={l.class} onChange={(v) => setLimit(i, { class: v })} disabled={disabled} placeholder="payment, tool, *" />
          <TextField id={`lim-measure-${i}`} label="Measure" value={l.measure} onChange={(v) => setLimit(i, { measure: v })} disabled={disabled} placeholder="amount" />
          <TextField id={`lim-max-${i}`} label="Escalate above" value={String(l.max)} onChange={(v) => setLimit(i, { max: Number(v) || 0 })} disabled={disabled} />
          <TextField
            id={`lim-to-${i}`}
            label="Escalate to (any of)"
            value={fromList(l.escalate_to)}
            onChange={(v) => setLimit(i, { escalate_to: toList(v) })}
            disabled={disabled}
            placeholder="relationship:supervisor"
          />
          <p className="col-span-2 text-[10.5px] text-[var(--fg-muted)]">{formatLimit(l)}</p>
          <Button size="sm" variant="ghost" className="col-span-2 justify-self-start" disabled={disabled} onClick={() => setAssign({ approval_limits: a.approval_limits.filter((_, j) => j !== i) })}>
            Remove limit
          </Button>
        </fieldset>
      ))}
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={disabled}
        onClick={() => setAssign({ approval_limits: [...a.approval_limits, { class: 'payment', measure: 'amount', max: 0, escalate_to: ['relationship:supervisor'], rule_id: '' }] })}
      >
        Add approval limit
      </Button>
    </div>
  );

  return (
    <Section title={rule.id ? `Rule · ${initial.name}` : 'New rule'} actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      <TextField id="rule-name" label="Name" value={rule.name} onChange={(name) => edit({ ...rule, name })} disabled={disabled} />
      <div className="grid grid-cols-2 gap-2">
        <TextField id="rule-priority" label="Priority (higher wins a limit conflict)" value={String(rule.priority)} onChange={(v) => edit({ ...rule, priority: Number(v) || 0 })} disabled={disabled} />
        <div className="flex flex-col justify-end gap-1 text-[12px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rule.enabled} disabled={disabled} onChange={(e) => edit({ ...rule, enabled: e.target.checked })} />
            Enabled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rule.privileged} disabled={disabled} onChange={(e) => edit({ ...rule, privileged: e.target.checked })} />
            Privileged (may assign operator/admin)
          </label>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] font-medium">Match (every filled condition must hold)</legend>
        <TextField id="m-groups" label="Directory groups" value={fromList(m.groups)} onChange={(v) => setMatch({ groups: toList(v) })} disabled={disabled} hint="Comma-separated; any one matches." />
        <TextField id="m-depts" label="Departments" value={fromList(m.departments)} onChange={(v) => setMatch({ departments: toList(v) })} disabled={disabled} />
        <TextField id="m-titles" label="Titles" value={fromList(m.titles)} onChange={(v) => setMatch({ titles: toList(v) })} disabled={disabled} />
        <TextField id="m-units" label="Units (ids; includes sub-units)" value={fromList(m.units)} onChange={(v) => setMatch({ units: toList(v) })} disabled={disabled} />
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={m.match_all} disabled={disabled} onChange={(e) => setMatch({ match_all: e.target.checked })} />
          Match everyone when no condition is set
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] font-medium">Assign (added, never removed from manual grants)</legend>
        <TextField id="a-roles" label="Roles" value={fromList(a.roles)} onChange={(v) => setAssign({ roles: toList(v) })} disabled={disabled} />
        <TextField id="a-groups" label="Policy groups" value={fromList(a.groups)} onChange={(v) => setAssign({ groups: toList(v) })} disabled={disabled} />
        <TextField id="a-links" label="Policy links" value={fromList(a.policy_links)} onChange={(v) => setAssign({ policy_links: toList(v) })} disabled={disabled} />
        {limitsUi}
      </fieldset>

      <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-2">
        <Button size="sm" variant="secondary" className="self-start" disabled={flow.step === 'previewing'} onClick={() => void onPreview()}>
          {flow.step === 'previewing' ? 'Previewing…' : 'Preview changes'}
        </Button>
        {(flow.step === 'previewed' || flow.step === 'saving') && <ReportView report={flow.report} title="This rule would change" />}
        {flow.step === 'saved' && flow.report && <ReportView report={flow.report} title="Saved and applied — changed" />}
        {flow.step === 'error' && <ErrorState reason={flow.error} whatToDo="Nothing was saved. Fix the rule and preview again." />}
        {!disabled && <ReasonField gate={reason} id="rule-reason" />}
        {save.error && <ErrorState reason={save.error} whatToDo="Nothing was saved." />}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={disabled || Boolean(blocked) || !reason.satisfied || save.isLoading} onClick={() => void onSave()}>
            Save and apply
          </Button>
          <span className="text-[11px] text-[var(--fg-muted)]">{gate ?? blocked ?? (!reason.satisfied ? 'Give a reason.' : '')}</span>
        </div>
        {rule.id && (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="ghost" className="self-start" disabled={disabled} onClick={() => void onPreviewDelete()}>
              Preview deleting this rule
            </Button>
            {deletePreview && (
              <>
                <ReportView report={deletePreview} title="Deleting would change" />
                <Button size="sm" variant="danger" className="self-start" disabled={disabled || !reason.satisfied || del.isLoading} onClick={() => void onDelete()}>
                  Delete rule
                </Button>
              </>
            )}
            {del.error && <ErrorState reason={del.error} whatToDo="The rule was not deleted." />}
          </div>
        )}
      </div>
    </Section>
  );
}

function ReapplyAll() {
  const gate = useCommandGate('re-apply mapping rules');
  const reason = useReasonGate();
  const [open, setOpen] = useState(false);
  const apply = useMutation(ipc.applyMappingRules);
  const [report, setReport] = useState<MappingReport | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" disabled={Boolean(gate)} title={gate} onClick={() => setOpen(true)}>
        Re-apply all rules…
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md p-2 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <p className="text-[11.5px] text-[var(--fg-muted)]">Re-evaluates every person against the stored rules (after a directory change, say).</p>
      <ReasonField gate={reason} id="reapply-reason" />
      <div className="flex gap-2">
        <Button size="sm" disabled={!reason.satisfied || apply.isLoading} onClick={() => void apply.mutate(reason.reason).then((r) => { if (r) { setReport(r); reason.reset(); refreshOrg(); } })}>
          Re-apply
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {apply.error && <ErrorState reason={apply.error} whatToDo="Nothing was applied." />}
      {report && <ReportView report={report} title="Changed" />}
    </div>
  );
}
