import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, EmptyState, ErrorState, ScrollArea, Skeleton } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { IntegrationMutation } from '@/ipc/types';
import { isAccountBacked, type DataInRow, type SystemView } from '@/lib/accounts';
import { errorMessage } from '@/lib/errorMessage';
import { effectiveHealth } from '@/lib/integrations';
import { useCommandGate } from '@/lib/useCommandGate';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { AccountsSection } from './AccountsSection';
import { InstalledCard, OutcomeNote } from './IntegrationsConsole';
import { refreshAccounts, useSystems, type SystemsFlags } from './useSystems';

/**
 * One external system (ADR-0141 D9): Accounts · Data in · Agent actions.
 * Each section gates on its own capability and says what the deployment IS
 * when that capability is absent — never an upsell.
 */
export function SystemPage({ systemId }: { systemId: string }) {
  const { systems, flags, loading, errors } = useSystems();
  const system = systems.find((s) => s.id === systemId);

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-[980px] flex-col gap-6 px-[26px] pb-10 pt-4">
        <nav aria-label="Breadcrumb" className="text-[11.5px] text-[var(--fg-muted)]">
          <Link to="/integrations" className="hover:text-[var(--fg-primary)]">
            Integrations
          </Link>{' '}
          › {system?.name ?? systemId}
        </nav>
        {errors.map((e) => (
          <ErrorState key={e} reason={e} />
        ))}
        {!system ? (
          loading ? (
            <Skeleton className="h-24" />
          ) : (
            <EmptyState title={`No system called ${systemId}`} body="It may have been removed. Go back to Integrations to see what is connected." />
          )
        ) : (
          <>
            <header>
              <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">{system.name}</h1>
              {system.provider && <p className="mt-1 font-mono text-[11.5px] text-[var(--fg-muted)]">provider {system.provider}</p>}
              {system.docs_url && (
                <a href={system.docs_url} target="_blank" rel="noreferrer" className="text-[11.5px] text-[var(--fg-muted)] underline underline-offset-4">
                  Provider setup docs
                </a>
              )}
            </header>
            <Section title="Accounts" id="accounts">
              <AccountsSection system={system} flags={flags} />
            </Section>
            <Section title="Data in" id="data-in">
              <DataIn system={system} flags={flags} />
            </Section>
            <Section title="Agent actions" id="agent-actions">
              <AgentActions system={system} flags={flags} />
            </Section>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`sys-${id}`} className="flex flex-col gap-3">
      <h2 id={`sys-${id}`} className="text-[15px] font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Data in ─────────────────────────────────────────────────────────────────

function DataIn({ system, flags }: { system: SystemView; flags: SystemsFlags }) {
  if (!flags.studio) {
    return <p className="text-[12.5px] text-[var(--fg-secondary)]">This kernel has no Ingress Studio (capability <code>ingress-studio</code>); nothing flows in from {system.name} through a pipeline here.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {!flags.orgAdmin ? (
        <p className="text-[12px] text-[var(--fg-muted)]">
          {flags.accounts
            ? 'Which ingress uses which organization account is visible to operators.'
            : 'Without accounts, ingresses hold their own credentials, so they are not grouped by system.'}{' '}
          Every pipeline is in Ingress Studio.
        </p>
      ) : system.data_in.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">No ingress pipeline uses a {system.name} organization account.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {system.data_in.map((d) => (
            <li key={d.ingress_id}>
              <DataInCard row={d} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] text-[var(--fg-muted)]">
        Author or change pipelines in{' '}
        <Link to="/ingress-studio" search={{ ingress: undefined, tab: undefined }} className="underline underline-offset-4 hover:text-[var(--fg-primary)]">
          Ingress Studio
        </Link>
        ; its webhook and upload secrets stay there.
      </p>
    </div>
  );
}

const HEALTH_TONE: Record<string, string> = { ok: 'var(--status-live)', degraded: 'var(--status-warn)', error: 'var(--status-err)' };

function DataInCard({ row: d }: { row: DataInRow }) {
  const gate = useCommandGate('pause or resume ingresses');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = d.active ? 'pause' : 'resume';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium">{d.display_name}</span>
          <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{d.state}</span>
          {d.health && (
            <span className="font-mono text-[10.5px]" style={{ color: HEALTH_TONE[d.health] ?? 'var(--fg-muted)' }}>
              {d.health}
            </span>
          )}
        </span>
        <span className="text-[11.5px] text-[var(--fg-secondary)]">
          as {d.account_label} ({d.slot}){d.account_state === 'revoked' && <span className="text-[var(--status-err)]"> — account revoked; it fails closed</span>}
          {d.missing_scopes.length > 0 && (
            <span className="text-[var(--status-warn)]"> — needs more permission ({d.missing_scopes.join(', ')}); it fails closed until the account is granted it</span>
          )}
        </span>
      </div>
      {d.can_toggle && (
        <label className="flex items-center gap-1.5 text-[12px]">
          <input
            type="checkbox"
            role="switch"
            aria-checked={d.active}
            checked={d.active}
            disabled={Boolean(gate)}
            onChange={() => setConfirm(true)}
            aria-label={`${d.display_name} running`}
          />
          {d.active ? 'Running' : 'Paused'}
        </label>
      )}
      <Link to="/ingress-studio" search={{ ingress: d.ingress_id, tab: undefined }} className="text-[11.5px] text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg-primary)]">
        Edit in Ingress Studio
      </Link>
      {error && <ErrorState reason={error} />}
      <ConfirmMutationDialog
        open={confirm}
        onOpenChange={(o) => !o && setConfirm(false)}
        title={`${verb === 'pause' ? 'Pause' : 'Resume'} ${d.display_name}`}
        description={verb === 'pause' ? 'Nothing new is ingested until it is resumed. The account binding is kept.' : 'It starts ingesting again with its pinned release.'}
        confirmLabel={verb === 'pause' ? 'Pause' : 'Resume'}
        onConfirm={async (reason) => {
          setConfirm(false);
          try {
            const ack = await ipc.studioLifecycle(verb, d.ingress_id, reason);
            if (!ack.ok) setError(ack.error || `${verb} refused`);
            refreshAccounts();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

// ── Agent actions ───────────────────────────────────────────────────────────

function AgentActions({ system, flags }: { system: SystemView; flags: SystemsFlags }) {
  const fed = useStore(projectionStore, (s) => s.state?.integration_health ?? {});
  const [last, setLast] = useState<IntegrationMutation | null>(null);
  if (!flags.integrations) {
    return <p className="text-[12.5px] text-[var(--fg-secondary)]">This kernel does not serve the integration catalog (capability <code>integrations</code>); its MCP servers are listed read-only in Runtime › MCP.</p>;
  }
  if (system.servers.length === 0) {
    return <p className="text-[12px] text-[var(--fg-muted)]">No MCP server for {system.name} is installed. Add one from the catalog on Integrations.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {last?.outcome && <OutcomeNote m={last} />}
      <ul className="grid gap-2 md:grid-cols-2">
        {system.servers.map((i) => (
          <li key={i.id} className="flex flex-col gap-1">
            <InstalledCard integration={i} health={effectiveHealth(i.health, fed[i.id])} onResult={setLast} accountBacked={flags.accounts && isAccountBacked(i, system)} />
            {i.tool_policies.length > 0 && (
              <details className="px-1 text-[11.5px]">
                <summary className="cursor-pointer text-[var(--fg-secondary)]">Tool policies ({i.tool_policies.length})</summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {i.tool_policies.map((t) => (
                    <li key={t.name} className="font-mono text-[11px]">
                      {t.name} — {t.dangerous ? 'needs approval' : 'allowed'} · {t.effects.join('+') || 'no effects'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      <Button asChild size="sm" variant="ghost" className="self-start">
        <Link to="/integrations">Add another server</Link>
      </Button>
    </div>
  );
}
