import { Link } from '@tanstack/react-router';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { cn } from '@/design-system/lib/utils';

export interface SurfaceLockProps {
  /** `chat:telegram` — the `LinkSpec.target_id` form, without the `surface:` prefix. */
  surfaceTarget: string;
  /** Rendered only when the policy plane is present. */
  hasPolicyPlane: boolean;
}

/**
 * The door and its lock, together.
 *
 * An ingress is a door into the system. Which policies bound it lives on a
 * different screen entirely, so today an operator turning a bridge on has to
 * remember to go and check the lock — and that is the manageability bug, not a
 * navigation preference.
 *
 * The report-only case is the one worth the extra line: a policy in report-only
 * is *recording* denials and enforcing none of them, so the door is open while
 * the screen shows a lock. The journalled would-deny count is what says whether
 * enforcing it is safe.
 */
export function SurfaceLock({ surfaceTarget, hasPolicyPlane }: SurfaceLockProps) {
  const links = useKernelQuery(['links'], () => ipc.listLinks(), { enabled: hasPolicyPlane });
  const policies = useKernelQuery(['policies'], () => ipc.listPolicies(), {
    enabled: hasPolicyPlane,
  });
  const denials = useKernelQuery(
    ['decisions', 'denials'],
    () => ipc.exportDecisions({ denials_only: true, limit: 500 }),
    { enabled: hasPolicyPlane },
  );

  if (!hasPolicyPlane) return null;

  const byId = new Map((policies.data ?? []).map((p) => [p.id, p]));
  const linked = (links.data ?? [])
    .filter((l) => l.container_kind === 'surface' && l.target_id === surfaceTarget)
    .map((l) => byId.get(l.policy_id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const wouldDeny = (policyId: string) =>
    (denials.data ?? []).filter(
      (d) => d.report_only && d.would_have_denied && d.policy_version.includes(policyId),
    ).length;

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
      <div className="type-label text-[var(--fg-muted)]">
        What bounds this surface
      </div>

      {links.isLoading || policies.isLoading ? (
        <p className="text-[11.5px] text-[var(--fg-muted)]">Loading…</p>
      ) : linked.length === 0 ? (
        <p
          className="rounded-md p-2 text-[11.5px] leading-[1.55] tint-wash"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">No policy is linked here.</span>{' '}
          <span className="text-[var(--fg-secondary)]">
            Anyone who finds this bridge gets whatever the organisation and their groups
            already allow — this door has no lock of its own.
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {linked.map((p) => {
            const reportOnly = p.mode === 'report_only';
            const count = reportOnly ? wouldDeny(p.id) : 0;
            return (
              <li key={p.id} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="text-[var(--fg-primary)]">{p.name || p.id}</span>
                  <span
                    className={cn('font-mono text-[10px]')}
                    style={{
                      color: reportOnly ? 'var(--status-warn)' : 'var(--status-live)',
                    }}
                  >
                    {p.mode}
                  </span>
                </span>
                {reportOnly && (
                  <span className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
                    Recording only — it has not blocked anything.
                    {count > 0 ? (
                      <>
                        {' '}
                        It would have denied <strong>{count}</strong> journalled request
                        {count === 1 ? '' : 's'}, which is the number that says whether
                        enforcing is safe.
                      </>
                    ) : (
                      <>
                        {' '}
                        Nothing in the journal would have been denied by it — that is
                        unknown-yet rather than proof it is harmless.
                      </>
                    )}{' '}
                    <Link
                      to="/scope"
                      search={{ focus: undefined, tab: 'rollout' }}
                      className="underline underline-offset-2 hover:text-[var(--fg-primary)]"
                    >
                      Enforce it
                    </Link>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
