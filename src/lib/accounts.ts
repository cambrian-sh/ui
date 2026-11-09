import type {
  Account,
  AccountConsumer,
  AccountConnectFlow,
  AccountConnectStart,
  AccountGrant,
  AccountList,
  Integration,
  IntegrationCatalogEntry,
  KernelSystem,
  OrgAccount,
  PersonalServer,
  ProviderClient,
  StudioIngress,
} from '@/ipc/types';

/**
 * Accounts and external systems, derived (ADR-0141 D1/D3/D9).
 *
 * The system pages render from these functions and nothing else, so "what
 * state is this account in", "what can I do with it" and "what belongs to this
 * system" each have one definition — and each is unit-tested without React.
 */

/** The accounts plane's capability (pb.rs ACCOUNTS_CAPABILITY). Phase 2 added RPCs, not a capability. */
export const ACCOUNTS_CAPABILITY = 'accounts';
/**
 * The system catalog + org OAuth install (pb.rs ACCOUNTS_SYSTEMS_CAPABILITY):
 * ListSystems, ListAccountConsumers, StartOrgAccountInstall. Without it (an
 * older kernel) the console derives systems itself.
 */
export const ACCOUNTS_SYSTEMS_CAPABILITY = 'accounts-systems';

// ── Personal account state ──────────────────────────────────────────────────

export type AccountState =
  | 'not_connected'
  | 'provider_unconfigured'
  | 'pending_confirmation'
  | 'connected'
  | 'reconnect_needed'
  | 'revoked'
  | 'error';

export const ACCOUNT_STATE_LABEL: Record<AccountState, string> = {
  not_connected: 'Not connected',
  provider_unconfigured: 'Sign-in not set up',
  pending_confirmation: 'Confirm this account',
  connected: 'Connected',
  reconnect_needed: 'Reconnect needed',
  revoked: 'Revoked',
  error: 'Error',
};

export const ACCOUNT_STATE_TONE: Record<AccountState, string> = {
  not_connected: 'var(--status-idle)',
  provider_unconfigured: 'var(--status-idle)',
  pending_confirmation: 'var(--status-warn)',
  connected: 'var(--status-live)',
  reconnect_needed: 'var(--status-err)',
  revoked: 'var(--status-err)',
  error: 'var(--status-err)',
};

/**
 * A personal account's state. Without an account the answer depends on
 * whether the provider's OAuth client is configured: a Connect that cannot
 * work is not offered as if it could. An unrecognised kernel status is an
 * error, never silently "connected".
 */
export function accountState(account: Account | undefined, server?: Pick<PersonalServer, 'provider_configured'>): AccountState {
  if (!account) return server && !server.provider_configured ? 'provider_unconfigured' : 'not_connected';
  switch (account.status) {
    case 'connected':
      return 'connected';
    case 'pending_confirmation':
      return 'pending_confirmation';
    case 'reconnect_needed':
      return 'reconnect_needed';
    default:
      return 'error';
  }
}

/** An org account's state: connected | revoked, anything else an error. */
export function orgAccountState(a: OrgAccount): AccountState {
  switch (a.status) {
    case 'connected':
      return 'connected';
    case 'revoked':
      return 'revoked';
    case 'reconnect_needed':
      return 'reconnect_needed';
    default:
      return 'error';
  }
}

/** Grants of an org account whose consumer needs more permission than the account was granted. */
export function grantsNeedingConsent(a: OrgAccount): AccountGrant[] {
  return a.grants.filter((g) => g.scope_check === 'needs_consent');
}

/** Needs a human (Inbox, attention counts). */
export function needsAttention(state: AccountState): boolean {
  return state === 'pending_confirmation' || state === 'reconnect_needed' || state === 'revoked' || state === 'error';
}

export type MyAccountAction = 'connect' | 'reconnect' | 'confirm' | 'disconnect';

/**
 * What a person may do with THEIR OWN account (any role; the kernel acts on
 * the caller only). A pending sign-in is confirmed or rejected (= disconnect).
 */
export function myAccountActions(state: AccountState): MyAccountAction[] {
  switch (state) {
    case 'not_connected':
      return ['connect'];
    case 'provider_unconfigured':
      return [];
    case 'pending_confirmation':
      return ['confirm', 'disconnect'];
    case 'connected':
      return ['disconnect'];
    case 'reconnect_needed':
    case 'revoked':
    case 'error':
      return ['reconnect', 'disconnect'];
  }
}

export type OrgAccountAction = 'create' | 'rotate' | 'reactivate' | 'reinstall' | 'rename' | 'revoke';

/**
 * What an OPERATOR may do with an org account (undefined = create one). A
 * pasted key is rotated; an OAuth-installed account is never overwritten with
 * a pasted key (the kernel refuses it) and is RE-INSTALLED instead, which is
 * also how it gains scopes (incremental consent) or recovers a dead grant.
 */
export function orgAccountActions(account: OrgAccount | undefined, opts: { isOperator: boolean }): OrgAccountAction[] {
  if (!opts.isOperator) return [];
  if (!account) return ['create'];
  const state = orgAccountState(account);
  if (account.auth_kind) return state === 'connected' ? ['reinstall', 'rename', 'revoke'] : ['reinstall', 'rename'];
  return state === 'revoked' ? ['reactivate', 'rename'] : ['rotate', 'rename', 'revoke'];
}

export interface MyAccountRow {
  server: PersonalServer;
  account?: Account;
  state: AccountState;
  actions: MyAccountAction[];
}

/** One row per personal (per_user / either) server: my account for it, or a Connect. */
export function myAccountRows(list: AccountList | null | undefined): MyAccountRow[] {
  if (!list) return [];
  return list.personal_servers.map((server) => {
    const account = list.accounts.find((a) => a.server_id === server.server_id);
    const state = accountState(account, server);
    // Connected but short of the server's scopes: calls fail closed ("needs
    // more permission") until the person reconnects and approves them.
    const short = state === 'connected' && (account?.missing_scopes?.length ?? 0) > 0;
    return { server, account, state, actions: short ? ['reconnect', 'disconnect'] : myAccountActions(state) };
  });
}

export function accountLabel(a: Pick<Account, 'account' | 'provider'>): string {
  return a.account || `${a.provider} account`;
}

export function orgAccountLabel(a: OrgAccount): string {
  return a.display_name || a.external_account || a.id;
}

/**
 * The credential slots a server can take from an org account: `env:<NAME>`
 * for a stdio secret env var, `token` for an http/sse bearer (the grant slot
 * vocabulary of the proto's AccountGrant).
 */
export function serverSlots(i: Integration): string[] {
  const slots = i.secrets.map((s) => (s.kind === 'env' ? `env:${s.name}` : 'token'));
  if (slots.length === 0 && i.transport !== 'stdio') slots.push('token');
  return [...new Set(slots)];
}

// ── The OAuth start flow ────────────────────────────────────────────────────

export type ConnectPhase =
  | { phase: 'idle' }
  | { phase: 'starting'; server_id: string }
  | { phase: 'waiting'; server_id: string; flow_id: string; provider: string; scopes: string[]; expires_at_unix_ms: number }
  | { phase: 'browser_failed'; server_id: string; detail: string }
  | { phase: 'completed'; server_id: string; account: string }
  | { phase: 'failed'; server_id: string; detail: string }
  | { phase: 'expired'; server_id: string }
  | { phase: 'cancelled'; server_id: string };

/** Map one GetAccountConnectFlow answer to the next phase (null = keep waiting). */
export function phaseFromFlow(server_id: string, f: AccountConnectFlow, now: number): ConnectPhase | null {
  switch (f.status) {
    case 'completed':
      return { phase: 'completed', server_id, account: f.account };
    case 'failed':
      return { phase: 'failed', server_id, detail: f.detail || 'The sign-in did not complete.' };
    case 'expired':
      return { phase: 'expired', server_id };
    default:
      // pending / started: the person is still in the browser — unless the
      // flow's own deadline has passed.
      return f.expires_at_unix_ms > 0 && now > f.expires_at_unix_ms ? { phase: 'expired', server_id } : null;
  }
}

export interface ConnectDriverDeps {
  start: (serverId: string) => Promise<AccountConnectStart>;
  poll: (flowId: string) => Promise<AccountConnectFlow>;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  signal?: AbortSignal;
  onPhase: (p: ConnectPhase) => void;
}

/**
 * Start a personal sign-in and follow it to its end. The Rust core opened the
 * start URL in the system browser and says whether that worked (the URL never
 * reaches the webview). A transient read error keeps waiting — the person is
 * still in the browser — up to five in a row; the flow's expiry bounds the loop.
 * Polling a sign-in in progress is the only way to learn it ended: the kernel
 * pushes no event for it.
 */
export async function runConnectFlow(serverId: string, deps: ConnectDriverDeps): Promise<ConnectPhase> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? 1500;
  const emit = (p: ConnectPhase) => {
    deps.onPhase(p);
    return p;
  };

  emit({ phase: 'starting', server_id: serverId });
  let start: AccountConnectStart;
  try {
    start = await deps.start(serverId);
  } catch (e) {
    return emit({ phase: 'failed', server_id: serverId, detail: e instanceof Error ? e.message : String(e) });
  }
  if (!start.opened) {
    return emit({ phase: 'browser_failed', server_id: serverId, detail: start.open_error || 'The system browser did not open.' });
  }
  emit({
    phase: 'waiting',
    server_id: serverId,
    flow_id: start.flow_id,
    provider: start.provider,
    scopes: start.scopes,
    expires_at_unix_ms: start.expires_at_unix_ms,
  });

  let misses = 0;
  for (;;) {
    if (deps.signal?.aborted) return emit({ phase: 'cancelled', server_id: serverId });
    await sleep(interval);
    if (deps.signal?.aborted) return emit({ phase: 'cancelled', server_id: serverId });
    try {
      const f = await deps.poll(start.flow_id);
      misses = 0;
      const next = phaseFromFlow(serverId, f, now());
      if (next) return emit(next);
    } catch (e) {
      misses += 1;
      if (misses >= 5) return emit({ phase: 'failed', server_id: serverId, detail: e instanceof Error ? e.message : String(e) });
    }
    if (start.expires_at_unix_ms > 0 && now() > start.expires_at_unix_ms) return emit({ phase: 'expired', server_id: serverId });
  }
}

// ── Systems: accounts + data in + agent actions ─────────────────────────────

export interface DataInRow {
  ingress_id: string;
  display_name: string;
  state: string;
  health: string;
  account_id: string;
  account_label: string;
  account_state: AccountState;
  slot: string;
  /** Scopes this ingress needs that the account was not granted ("needs more permission"). */
  missing_scopes: string[];
  /** Pause/resume applies (an armed or paused ingress). */
  can_toggle: boolean;
  active: boolean;
}

export interface SystemView {
  id: string;
  name: string;
  /** The OAuth provider, when the system is keyed by one. */
  provider: string;
  servers: Integration[];
  personal_servers: PersonalServer[];
  org_accounts: OrgAccount[];
  /** Every principal's personal accounts (operator view; empty otherwise). */
  personal_accounts: Account[];
  mine: MyAccountRow[];
  data_in: DataInRow[];
  attention: number;
  /** True when the kernel's system catalog declared this system (ListSystems); false when derived. */
  from_catalog: boolean;
  icon: string;
  docs_url: string;
  /** oauth_install | admin_consent | service_account_key | static | "" (catalog systems only). */
  org_mode: string;
  /** An operator can install the provider for the organisation here (OAuth). */
  org_install_available: boolean;
  org_install_reason: string;
  /** Consumers bound to this system's accounts, with their scope verdicts (catalog systems only). */
  consumers: AccountConsumer[];
  /** ok | attention | not_connected | idle: the kernel's, or "" when derived. */
  health: string;
}

export interface SystemsInput {
  integrations: readonly Integration[];
  catalog?: readonly IntegrationCatalogEntry[];
  mine?: AccountList | null;
  /** ListAccounts (operator). */
  all?: AccountList | null;
  /** ListOrgAccounts (operator). */
  org?: readonly OrgAccount[];
  /** ListProviderClients (operator): display names for provider-keyed systems. */
  providers?: readonly ProviderClient[];
  ingresses?: readonly StudioIngress[];
  /**
   * ListSystems (capability accounts-systems): the kernel's catalog. When
   * present it decides membership; the derivation below only places what no
   * catalog system claims. null/undefined: an older kernel, derive everything.
   */
  systems?: readonly KernelSystem[] | null;
}

/** Generic credential kinds name no external system. */
const GENERIC_PROVIDERS = new Set(['static_token', 'api_key', '']);

function title(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Group everything the console knows into one entry per external system.
 *
 * The kernel's premium system catalog (ListSystems, ADR-0141 D5) decides
 * membership when the kernel serves it: its systems, their servers and org
 * accounts are taken as given. What it does not claim (and everything on an
 * older kernel without the RPC) is DERIVED, by a deliberately simple rule:
 *  - an installed server belongs to its OAuth provider's system when it is a
 *    personal (per_user / either) server — so Gmail and Calendar are both
 *    "google" — else to its catalog id (multi-instance servers fold together);
 *  - an org account belongs to the systems of the MCP servers it is granted
 *    to; an account with no MCP grant is its own system (named after its
 *    provider, or itself for a pasted key bound only to ingresses);
 *  - Data in is every ingress grant on the system's org accounts.
 * Nothing installed or held ever falls off the page.
 */
export function buildSystems(input: SystemsInput): SystemView[] {
  const personal = new Map<string, PersonalServer>();
  for (const l of [input.mine, input.all]) for (const p of l?.personal_servers ?? []) if (!personal.has(p.server_id)) personal.set(p.server_id, p);
  const providerName = (p: string) => input.providers?.find((x) => x.provider === p)?.display_name || title(p);
  const ingressById = new Map((input.ingresses ?? []).map((g) => [g.ingress_id, g]));

  interface Shell { id: string; name: string; provider: string; servers: Integration[]; org: OrgAccount[] }
  const shells = new Map<string, Shell>();
  const shell = (id: string, name: string, provider = ''): Shell => {
    let s = shells.get(id);
    if (!s) shells.set(id, (s = { id, name, provider, servers: [], org: [] }));
    return s;
  };
  const systemOfServer = new Map<string, string>();
  const catalogue = new Map<string, KernelSystem>();
  const claimedOrg = new Set<string>();

  for (const ks of input.systems ?? []) {
    const holds = ks.server_ids.length + ks.org_account_ids.length + ks.consumers.length;
    // An idle catalogue entry is shown only when an operator could install it.
    if (holds === 0 && !ks.org_install_available) continue;
    const sh = shell(ks.id, ks.name, ks.provider);
    catalogue.set(ks.id, ks);
    for (const id of ks.server_ids) systemOfServer.set(id, ks.id);
    for (const id of ks.org_account_ids) {
      const a = input.org?.find((x) => x.id === id);
      if (a && !sh.org.includes(a)) sh.org.push(a);
      claimedOrg.add(id);
    }
  }
  for (const i of input.integrations) {
    const sys = systemOfServer.get(i.id);
    if (sys) shells.get(sys)?.servers.push(i);
  }

  for (const i of input.integrations) {
    if (systemOfServer.has(i.id)) continue;
    const ps = personal.get(i.id);
    let sh: Shell;
    if (ps && !GENERIC_PROVIDERS.has(ps.provider)) sh = shell(ps.provider, providerName(ps.provider), ps.provider);
    else {
      const key = i.catalog_id || i.id;
      sh = shell(key, input.catalog?.find((e) => e.id === key)?.name || i.name || key);
    }
    sh.servers.push(i);
    systemOfServer.set(i.id, sh.id);
  }
  // Personal servers the integration listing did not carry (no `integrations` capability).
  for (const ps of personal.values()) {
    if (systemOfServer.has(ps.server_id)) continue;
    const sh = GENERIC_PROVIDERS.has(ps.provider) ? shell(ps.server_id, ps.display_name || ps.server_id) : shell(ps.provider, providerName(ps.provider), ps.provider);
    systemOfServer.set(ps.server_id, sh.id);
  }

  for (const a of input.org ?? []) {
    if (claimedOrg.has(a.id)) continue;
    const homes = new Set(a.grants.filter((g) => g.purpose === 'mcp').map((g) => systemOfServer.get(g.consumer_id) ?? g.consumer_id));
    if (homes.size === 0) {
      if (!GENERIC_PROVIDERS.has(a.provider)) homes.add(shell(a.provider, providerName(a.provider), a.provider).id);
      else homes.add(shell(`account:${a.id}`, orgAccountLabel(a)).id);
    }
    for (const h of homes) shell(h, h).org.push(a);
  }

  return [...shells.values()]
    .map((sh) => {
      const serverIds = new Set([...systemOfServer].filter(([, sys]) => sys === sh.id).map(([srv]) => srv));
      const pservers = [...personal.values()].filter((p) => serverIds.has(p.server_id));
      const mine = myAccountRows(
        input.mine ? { ...input.mine, personal_servers: input.mine.personal_servers.filter((p) => serverIds.has(p.server_id)) } : null,
      );
      const people = (input.all?.accounts ?? []).filter((a) => serverIds.has(a.server_id));

      const dataIn = new Map<string, DataInRow>();
      for (const a of sh.org) {
        for (const g of a.grants) {
          if (g.purpose !== 'ingress' || dataIn.has(g.consumer_id)) continue;
          const ing = ingressById.get(g.consumer_id);
          dataIn.set(g.consumer_id, {
            ingress_id: g.consumer_id,
            display_name: ing?.display_name || g.consumer_id,
            state: ing?.state ?? 'UNKNOWN',
            health: ing?.health ?? '',
            account_id: a.id,
            account_label: orgAccountLabel(a),
            account_state: orgAccountState(a),
            slot: g.slot,
            missing_scopes: g.missing_scopes ?? [],
            can_toggle: ing?.state === 'ARMED' || ing?.state === 'PAUSED',
            active: ing?.state === 'ARMED',
          });
        }
      }

      const ks = catalogue.get(sh.id);
      const consumers = ks?.consumers ?? [];
      const attention =
        mine.filter((r) => needsAttention(r.state)).length +
        sh.org.filter((a) => needsAttention(orgAccountState(a))).length +
        [...dataIn.values()].filter((d) => d.health === 'error' || d.missing_scopes.length > 0).length +
        // MCP consumers short of permission (an ingress one is counted above).
        consumers.filter((c) => c.state === 'needs_consent' && c.kind === 'mcp' && !c.principal_id).length +
        mine.filter((r) => r.state === 'connected' && (r.account?.missing_scopes?.length ?? 0) > 0).length;

      return {
        id: sh.id,
        name: sh.name,
        provider: sh.provider,
        servers: sh.servers,
        personal_servers: pservers,
        org_accounts: sh.org,
        personal_accounts: people,
        mine,
        data_in: [...dataIn.values()].sort((x, y) => x.display_name.localeCompare(y.display_name)),
        attention,
        from_catalog: Boolean(ks),
        icon: ks?.icon ?? '',
        docs_url: ks?.docs_url ?? '',
        org_mode: ks?.org_mode ?? '',
        org_install_available: ks?.org_install_available ?? false,
        org_install_reason: ks?.org_install_unavailable_reason ?? '',
        consumers,
        health: ks?.health ?? '',
      } satisfies SystemView;
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * The consumers an org install should bind and ask scopes for: the system's
 * MCP servers that take an org credential (shared or either), each on its
 * first credential slot. Least privilege lives in the KERNEL (it requests the
 * union of what these declare); the console only names them.
 */
export function orgInstallConsumers(system: SystemView): Pick<AccountGrant, 'purpose' | 'consumer_id' | 'slot' | 'scopes'>[] {
  const personalOnly = new Set(system.personal_servers.filter((p) => p.credential_scope === 'per_user').map((p) => p.server_id));
  return system.servers
    .filter((i) => !personalOnly.has(i.id))
    .map((i) => ({ purpose: 'mcp', consumer_id: i.id, slot: serverSlots(i)[0] ?? 'token', scopes: [] }));
}

/** What would stop if an account were revoked (consumers not already failing for that reason). */
export function revokeImpact(consumers: readonly AccountConsumer[]): { live: AccountConsumer[]; text: string } {
  const live = consumers.filter((c) => c.state !== 'account_revoked');
  const names = live.map((c) => `${c.kind === 'mcp' ? 'agent tools' : 'ingress'} ${c.display_name || c.consumer_id}`);
  return { live, text: live.length === 0 ? 'Nothing uses this account.' : `Stops: ${names.join(', ')}.` };
}

/** The system id an MCP server belongs to (for links from the Inbox). */
export function systemIdForServer(systems: readonly SystemView[], serverId: string): string | undefined {
  return systems.find((s) => s.servers.some((i) => i.id === serverId) || s.personal_servers.some((p) => p.server_id === serverId))?.id;
}

/** Whether a server's credential comes from accounts — its per-server secret fields are retired (D11 phase 4). */
export function isAccountBacked(i: Integration, system: SystemView): boolean {
  const ps = system.personal_servers.find((p) => p.server_id === i.id);
  if (ps?.credential_scope === 'per_user') return true;
  return system.org_accounts.some((a) => a.grants.some((g) => g.purpose === 'mcp' && g.consumer_id === i.id));
}

/** The org accounts an ingress credential can bind to (Ingress Studio's picker), current binding first. */
export function ingressAccountChoices(org: readonly OrgAccount[], ingressId: string, slot: string): { account: OrgAccount; bound: boolean }[] {
  const isBound = (a: OrgAccount) => a.grants.some((g: AccountGrant) => g.purpose === 'ingress' && g.consumer_id === ingressId && g.slot === slot);
  return org
    .filter((a) => orgAccountState(a) === 'connected' || isBound(a))
    .map((account) => ({ account, bound: isBound(account) }))
    .sort((x, y) => Number(y.bound) - Number(x.bound) || orgAccountLabel(x.account).localeCompare(orgAccountLabel(y.account)));
}

// ── Inbox ───────────────────────────────────────────────────────────────────

export interface AccountInboxEntry {
  key: string;
  kind: 'account_confirm' | 'account_reconnect';
  title: string;
  server_id: string;
  since_ms: number;
  account: Account;
  /** The row the Inbox renders with the same card as the system page. */
  row: MyAccountRow;
}

/**
 * My accounts that need me: confirm a pending sign-in (phishing defence,
 * ADR-0141 owner position 4) or reconnect a dead grant so my agents can
 * continue (D3: never a fallback to another credential).
 */
export function accountInboxEntries(mine: AccountList | null | undefined): AccountInboxEntry[] {
  if (!mine) return [];
  const name = (serverId: string) => mine.personal_servers.find((p) => p.server_id === serverId)?.display_name || serverId;
  const out: AccountInboxEntry[] = [];
  for (const a of mine.accounts) {
    const s = accountState(a);
    const server: PersonalServer = mine.personal_servers.find((p) => p.server_id === a.server_id) ?? {
      server_id: a.server_id, display_name: a.server_id, provider: a.provider, credential_scope: 'per_user', scopes: a.scopes, provider_configured: true,
    };
    const row: MyAccountRow = { server, account: a, state: s, actions: myAccountActions(s) };
    if (s === 'pending_confirmation') {
      out.push({ key: `account:confirm:${a.server_id}`, kind: 'account_confirm', title: `Confirm ${accountLabel(a)} for ${name(a.server_id)}`, server_id: a.server_id, since_ms: a.connected_at_unix_ms, account: a, row });
    } else if (s === 'reconnect_needed' || s === 'error') {
      out.push({ key: `account:reconnect:${a.server_id}`, kind: 'account_reconnect', title: `Connect your ${name(a.server_id)} account to continue`, server_id: a.server_id, since_ms: a.last_refreshed_unix_ms || a.connected_at_unix_ms, account: a, row });
    } else if (s === 'connected' && (a.missing_scopes?.length ?? 0) > 0) {
      // Grant scope enforcement: the account works, but not for this server.
      out.push({
        key: `account:consent:${a.server_id}`, kind: 'account_reconnect', title: `Give ${name(a.server_id)} more permission to continue`,
        server_id: a.server_id, since_ms: a.connected_at_unix_ms, account: a, row: { ...row, actions: ['reconnect', 'disconnect'] },
      });
    }
  }
  return out;
}
