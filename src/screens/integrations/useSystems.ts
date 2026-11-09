import { useMemo } from 'react';
import { ipc } from '@/ipc';
import { ACCOUNTS_CAPABILITY, ACCOUNTS_SYSTEMS_CAPABILITY, buildSystems, type SystemView } from '@/lib/accounts';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';

export const ACCOUNTS_KEY = ['accounts'] as const;

/** Re-read everything account-shaped (after a mutation of ours, or a finished sign-in). */
export function refreshAccounts(): void {
  void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
  void queryClient.invalidateQueries({ queryKey: ['integrations'] });
  void queryClient.invalidateQueries({ queryKey: ['inbox'] });
}

export interface SystemsFlags {
  /** Capability `accounts`: personal accounts for everyone. */
  accounts: boolean;
  /** `accounts` + Operator role: org accounts, people's accounts, provider clients (Operator-only RPCs). */
  orgAdmin: boolean;
  /** Capability `accounts-systems`: the kernel serves the system catalog and org OAuth install. */
  systems: boolean;
  studio: boolean;
  integrations: boolean;
  operator: boolean;
}

export function useSystemsFlags(): SystemsFlags {
  const caps = useStore(projectionStore, (s) => s.state?.capabilities ?? []);
  const role = useStore(projectionStore, (s) => s.state?.role ?? null);
  const accounts = caps.includes(ACCOUNTS_CAPABILITY);
  return {
    accounts,
    orgAdmin: accounts && role === 'operator',
    systems: accounts && caps.includes(ACCOUNTS_SYSTEMS_CAPABILITY),
    studio: caps.includes('ingress-studio'),
    integrations: caps.includes('integrations'),
    operator: role === 'operator',
  };
}

/**
 * Every read a system page needs, each gated on the capability (and, for the
 * Operator-only RPCs, the role) that serves it — never probed — aggregated by
 * `buildSystems`. Reads are request/response, not feed state: re-read on mount
 * and after this console's own mutations. Integration HEALTH stays on the feed
 * (`integration_health`), merged by the cards themselves.
 */
export function useSystems(): {
  systems: SystemView[];
  flags: SystemsFlags;
  loading: boolean;
  errors: string[];
} {
  const live = useStore(projectionStore, (s) => s.state?.connection.status === 'live');
  const flags = useSystemsFlags();

  const installed = useKernelQuery(['integrations', 'installed'], () => ipc.listIntegrations(), { enabled: live && flags.integrations });
  const catalog = useKernelQuery(['integrations', 'catalog'], () => ipc.listIntegrationCatalog(), { enabled: live && flags.integrations });
  const mine = useKernelQuery([...ACCOUNTS_KEY, 'mine'], () => ipc.listMyAccounts(), { enabled: live && flags.accounts });
  const all = useKernelQuery([...ACCOUNTS_KEY, 'all'], () => ipc.listAccounts(), { enabled: live && flags.orgAdmin });
  const org = useKernelQuery([...ACCOUNTS_KEY, 'org'], () => ipc.listOrgAccounts(), { enabled: live && flags.orgAdmin });
  const providers = useKernelQuery([...ACCOUNTS_KEY, 'providers'], () => ipc.listProviderClients(), { enabled: live && flags.orgAdmin });
  const ingresses = useKernelQuery([...ACCOUNTS_KEY, 'ingresses'], () => ipc.studioListIngresses(), { enabled: live && flags.studio });
  // The kernel's system catalog. Gated on its capability, never probed: an
  // older kernel without it gets the console's own derivation (buildSystems).
  const catalog2 = useKernelQuery([...ACCOUNTS_KEY, 'systems'], () => ipc.listSystems(), { enabled: live && flags.systems });

  const view = useMemo(
    () =>
      buildSystems({
        integrations: installed.data?.integrations ?? [],
        catalog: catalog.data?.entries ?? [],
        mine: mine.data ?? null,
        all: all.data ?? null,
        org: org.data ?? [],
        providers: providers.data?.providers ?? [],
        ingresses: ingresses.data ?? [],
        systems: flags.systems ? (catalog2.data?.systems ?? null) : null,
      }),
    [installed.data, catalog.data, mine.data, all.data, org.data, providers.data, ingresses.data, catalog2.data, flags.systems],
  );

  const queries = [installed, catalog, mine, all, org, providers, ingresses, catalog2];
  return {
    systems: view,
    flags,
    loading: queries.some((q) => q.isLoading),
    errors: [...new Set(queries.map((q) => q.error?.message).filter((m): m is string => Boolean(m)))],
  };
}
