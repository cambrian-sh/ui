import { useState } from 'react';
import { ErrorState } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { explainApprovers } from '@/lib/hierarchy';
import { describeRule } from '@/lib/approvalRules';
import { Notice, Section, SelectField } from './shared';

/**
 * "Who approves what" for a selected person: their reporting chain and how
 * each of their approval rules routes. Read-only; the kernel's hierarchy
 * policy decides at answer time — this explains its data.
 */
export function ApproversPane() {
  const people = useKernelQuery(['org', 'people'], () => ipc.listOrgPeople('', '', true));
  const [who, setWho] = useState('');
  const chain = useKernelQuery(['org', 'chain', who], () => ipc.getOrgChain(who), { enabled: Boolean(who) });
  const settings = useKernelQuery(['org', 'approval-settings'], () => ipc.getApprovalSettings());
  const routes = chain.data ? explainApprovers(chain.data, settings.data ?? null) : [];

  return (
    <div className="flex max-w-[860px] flex-col gap-4 px-[26px] py-4">
      <SelectField
        id="approvers-person"
        label="Person"
        value={who}
        onChange={setWho}
        options={[
          { value: '', label: '— choose a person —' },
          ...(people.data ?? []).map((p) => ({ value: p.principal_id, label: `${p.display_name || p.principal_id}${p.title ? ` · ${p.title}` : ''}` })),
        ]}
      />
      {(chain.error || people.error) && <ErrorState reason={(chain.error ?? people.error)!.message} whatToDo="Pick the person again." />}
      {chain.data && (
        <>
          <Section title="Reporting chain">
            <p className="text-[12px] text-[var(--fg-muted)]">
              {chain.data.unit_path.map((u) => u.name).join(' › ') || 'Not in a unit'}
            </p>
            {chain.data.managers.length === 0 ? (
              <Notice tone="warn">
                No manager. Anything that must go to their supervisor ends as &ldquo;needs hierarchy&rdquo; unless a fallback is
                configured.
              </Notice>
            ) : (
              <ol className="flex flex-col gap-1 text-[12.5px]" aria-label="Managers, nearest first">
                {chain.data.managers.map((m, i) => (
                  <li key={m.principal_id}>
                    <span className="mr-2 font-mono text-[10.5px] text-[var(--fg-muted)]">{i === 0 ? 'manager' : `+${i}`}</span>
                    {m.display_name || m.principal_id}
                    {m.title && <span className="text-[var(--fg-muted)]"> · {m.title}</span>}
                  </li>
                ))}
              </ol>
            )}
            {chain.data.unit_head && <p className="text-[11.5px] text-[var(--fg-muted)]">Unit head: {chain.data.unit_head.display_name}</p>}
          </Section>
          <Section title="Approval routing">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[var(--fg-muted)]">
                <tr>
                  <th scope="col" className="pb-1 font-normal">What</th>
                  <th scope="col" className="pb-1 font-normal">Rule</th>
                  <th scope="col" className="pb-1 font-normal">Who is asked now</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.what} className="align-top shadow-[inset_0_1px_0_var(--border-subtle)]">
                    <td className="py-1.5 pr-2">{r.what}</td>
                    <td className="py-1.5 pr-2" title={r.rule}>{describeRule(r.rule)}</td>
                    <td className="py-1.5">
                      {r.approvers.length ? r.approvers.join(', ') : <span className="text-[var(--status-warn)]">nobody</span>}
                      {r.note && <div className="text-[10.5px] text-[var(--fg-muted)]">{r.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10.5px] text-[var(--fg-muted)]">
              Role-by-action-class rules (e.g. a public record release going to the records officer) are decided by the
              kernel&rsquo;s approval policy and show on each request in the Inbox.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
