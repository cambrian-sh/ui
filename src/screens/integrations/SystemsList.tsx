import { Link } from '@tanstack/react-router';
import { ErrorState, Skeleton } from '@/design-system/components';
import type { SystemView } from '@/lib/accounts';
import { useSystems } from './useSystems';

/**
 * The external systems this deployment touches (ADR-0141 D9). Each opens its
 * own page: Accounts · Data in · Agent actions. A system with no account
 * (filesystem) is listed like any other; a system that needs attention says how
 * many things are waiting.
 */
export function SystemsList() {
  const { systems, loading, errors } = useSystems();
  return (
    <section aria-label="External systems" className="flex flex-col gap-2">
      <h2 className="text-[14px] font-medium">Systems</h2>
      {errors.map((e) => (
        <ErrorState key={e} reason={e} />
      ))}
      {loading && systems.length === 0 ? (
        <Skeleton className="h-16" />
      ) : systems.length === 0 ? (
        <p className="text-[12.5px] text-[var(--fg-muted)]">Nothing connected yet. Pick a server from the catalog below.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {systems.map((s) => (
            <li key={s.id}>
              <SystemCard system={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SystemCard({ system: s }: { system: SystemView }) {
  const accounts = s.org_accounts.length + s.mine.filter((r) => r.account).length;
  const takesAccounts = s.personal_servers.length > 0 || s.org_accounts.length > 0;
  const parts = [
    takesAccounts ? `${accounts} account${accounts === 1 ? '' : 's'}` : 'no account',
    `${s.data_in.length} data in`,
    `${s.servers.length} agent server${s.servers.length === 1 ? '' : 's'}`,
  ];
  return (
    <Link
      to="/integrations/$systemId"
      params={{ systemId: s.id }}
      className="flex h-full flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:bg-[var(--bg-hover,var(--bg-surface))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent,currentColor)]"
    >
      <span className="flex items-center gap-2">
        <span className="text-[13.5px] font-medium">{s.name}</span>
        {s.provider && <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{s.provider}</span>}
        {s.attention > 0 && (
          <span
            className="ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[10px] tint-fill"
            style={{ '--tint': 'var(--status-warn)', color: 'var(--status-warn)' } as React.CSSProperties}
          >
            {s.attention} need{s.attention === 1 ? 's' : ''} attention
          </span>
        )}
      </span>
      <span className="text-[12px] text-[var(--fg-secondary)]">{parts.join(' · ')}</span>
    </Link>
  );
}
