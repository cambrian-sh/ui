/* Mock twin of ipc/accounts-client.ts (dev mock mode, VITE_USE_MOCK_IPC=1,
 * tests and screenshots). Holds no secret: a key passed in is reduced to its
 * last four on the spot, which is all the real kernel ever returns.
 */

import type * as a from './types-accounts';
import type { StudioAck, StudioIngress, StudioStatus } from './types';

const H = 3_600_000;

export function createAccountsMock() {
  const now = Date.now();
  let flowSeq = 0;
  const flows = new Map<string, { server_id: string; reads: number; expires: number; org?: { provider: string; account_id: string; consumers: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot' | 'scopes'>[] } }>();
  const REDIRECT = 'https://kernel.acme.example/oauth/callback';

  const personalServers: a.PersonalServer[] = [
    { server_id: 'gmail', display_name: 'Gmail', provider: 'google', credential_scope: 'per_user', scopes: ['gmail.readonly', 'gmail.compose'], provider_configured: true },
    { server_id: 'google-calendar', display_name: 'Google Calendar', provider: 'google', credential_scope: 'per_user', scopes: ['calendar.events'], provider_configured: true },
    { server_id: 'slack', display_name: 'Slack', provider: 'slack', credential_scope: 'either', scopes: ['chat:write', 'channels:history'], provider_configured: true },
    { server_id: 'outlook', display_name: 'Outlook', provider: 'microsoft', credential_scope: 'per_user', scopes: ['Mail.Read'], provider_configured: false },
  ];

  const acct = (o: Partial<a.Account>): a.Account => ({
    server_id: '', principal_id: 'alice', provider: '', account: '', scopes: [], status: 'connected', status_detail: '',
    connected_at_unix_ms: now - 72 * H, last_used_unix_ms: now - H, last_refreshed_unix_ms: now - 0.5 * H, expires_at_unix_ms: now + H,
    account_id: '', account_subject: '', ...o,
  });
  const grant = (purpose: string, consumer_id: string, slot: string, scopes: string[] = []): a.AccountGrant => ({
    purpose, consumer_id, slot, scopes, granted_at_unix_ms: now - 100 * H,
  });

  let accounts: a.Account[] = [
    acct({ server_id: 'gmail', provider: 'google', account: 'alice@acme.example', scopes: ['gmail.readonly', 'gmail.compose'], status: 'pending_confirmation', connected_at_unix_ms: now - 0.2 * H }),
    acct({ server_id: 'slack', provider: 'slack', account: 'alice (acme.slack.com)', scopes: ['chat:write'], status: 'reconnect_needed', status_detail: 'invalid_grant: the refresh token was revoked at Slack' }),
    acct({ server_id: 'gmail', principal_id: 'bob', provider: 'google', account: 'bob@acme.example', scopes: ['gmail.readonly'] }),
  ].map((x) => ({ ...x, account_id: `${x.provider}:${x.principal_id}:${x.server_id}` }));

  const org0 = (o: Partial<a.OrgAccount>): a.OrgAccount => ({
    id: '', provider: 'static_token', external_account: '', display_name: '', status: 'connected', status_detail: '',
    created_at_unix_ms: now - 400 * H, updated_at_unix_ms: now - 200 * H, rotated_at_unix_ms: now - 200 * H, last_used_unix_ms: now - 2 * H,
    secret_last_four: '', grants: [], origin: 'operator', ...o,
  });
  let org: a.OrgAccount[] = [
    org0({ id: 'slack:org:T0ACME', provider: 'slack', external_account: 'T0ACME', display_name: 'Acme workspace bot', secret_last_four: 'x9Qa',
      grants: [grant('mcp', 'slack', 'token', ['chat:write']), grant('ingress', 'slack-eng', 'bot_token', ['channels:history'])], origin: 'migrated:mcp:slack:token' }),
    org0({ id: 'static_token:org:acme-bot', external_account: 'acme-bot', display_name: 'acme-bot PAT', secret_last_four: '9f1c',
      grants: [grant('mcp', 'github', 'env:GITHUB_PERSONAL_ACCESS_TOKEN'), grant('ingress', 'github-prs', 'api_key')] }),
    org0({ id: 'api_key:org:brave', provider: 'api_key', external_account: 'brave', display_name: 'Brave Search key', status: 'revoked', status_detail: 'revoked by admin: leaked in a screenshot', secret_last_four: '',
      grants: [grant('mcp', 'brave-search', 'env:BRAVE_API_KEY')] }),
  ];

  let providers: a.ProviderClient[] = [
    { provider: 'google', display_name: 'Google Workspace', client_id_configured: true, client_id_last_four: '.com', client_secret_configured: true, updated_at_unix_ms: now - 300 * H, public_client: false, configured: true },
    { provider: 'slack', display_name: 'Slack', client_id_configured: true, client_id_last_four: '4821', client_secret_configured: true, updated_at_unix_ms: now - 200 * H, public_client: false, configured: true },
    { provider: 'microsoft', display_name: 'Microsoft 365', client_id_configured: false, client_id_last_four: '', client_secret_configured: false, updated_at_unix_ms: 0, public_client: false, configured: false },
    { provider: 'github', display_name: 'GitHub', client_id_configured: true, client_id_last_four: 'a9f2', client_secret_configured: false, updated_at_unix_ms: now - 30 * H, public_client: true, configured: true },
  ];

  let ingresses: StudioIngress[] = [
    { ingress_id: 'slack-eng', display_name: 'Slack #eng history', state: 'ARMED', health: 'ok', pinned_release: 'r3' },
    { ingress_id: 'github-prs', display_name: 'GitHub PR events', state: 'PAUSED', health: 'error', pinned_release: 'r7' },
  ];

  const cmd = () => `cmd-${Math.random().toString(36).slice(2)}`;
  const mutation = (removed: boolean): a.AccountMutation => ({ command_id: cmd(), deduped: false, removed });
  const orgMutation = (account: a.OrgAccount | undefined): a.OrgAccountMutation => {
    if (!account) throw new Error('NOT_FOUND: no such org account');
    return { command_id: cmd(), deduped: false, account };
  };
  const updateOrg = (id: string, f: (x: a.OrgAccount) => a.OrgAccount) => {
    org = org.map((x) => (x.id === id ? f(x) : x));
    return orgMutation(org.find((x) => x.id === id));
  };
  const last4 = (s: string) => s.slice(-4);

  return {
    async startAccountConnect(serverId: string): Promise<a.AccountConnectStart> {
      const ps = personalServers.find((p) => p.server_id === serverId);
      if (!ps) throw new Error(`NOT_FOUND: ${serverId} is not a personal server`);
      if (!ps.provider_configured) throw new Error(`FAILED_PRECONDITION: the ${ps.provider} OAuth client is not configured`);
      const flow_id = `flow-${++flowSeq}`;
      flows.set(flow_id, { server_id: serverId, reads: 0, expires: Date.now() + 10 * 60_000 });
      return { flow_id, expires_at_unix_ms: Date.now() + 10 * 60_000, provider: ps.provider, scopes: ps.scopes, opened: true, open_error: '' };
    },
    async getAccountConnectFlow(flowId: string): Promise<a.AccountConnectFlow> {
      const f = flows.get(flowId);
      if (!f) throw new Error('NOT_FOUND');
      f.reads += 1;
      if (f.reads < 2) return { status: 'started', detail: '', server_id: f.server_id, account: '', expires_at_unix_ms: f.expires, mode: f.org ? 'org' : '' };
      if (f.org) {
        const o = f.org;
        const id = o.account_id || `${o.provider}:org:t0new`;
        const x = org0({ id, provider: o.provider, external_account: id.split(':')[2] ?? 't0new', display_name: 'Installed workspace', secret_last_four: '',
          auth_kind: 'oauth_install', scopes: ['channels:history', 'chat:write'], scopes_known: true,
          grants: o.consumers.map((g) => ({ ...g, granted_at_unix_ms: Date.now() })) });
        org = [...org.filter((y) => y.id !== id), x];
        return { status: 'completed', detail: '', server_id: '', account: x.external_account, expires_at_unix_ms: f.expires, mode: 'org', account_id: id };
      }
      const ps = personalServers.find((p) => p.server_id === f.server_id);
      accounts = accounts.filter((x) => !(x.principal_id === 'alice' && x.server_id === f.server_id));
      accounts.push(acct({ server_id: f.server_id, provider: ps?.provider ?? '', account: 'alice@acme.example', scopes: ps?.scopes ?? [], status: 'pending_confirmation', connected_at_unix_ms: Date.now(), account_id: `${ps?.provider}:alice:${f.server_id}` }));
      return { status: 'completed', detail: '', server_id: f.server_id, account: 'alice@acme.example', expires_at_unix_ms: f.expires };
    },
    async listMyAttention(): Promise<a.AttentionItem[]> {
      return [{
        id: 'ingress:alice-mail', purpose: 'ingress', consumer_id: 'alice-mail', consumer_name: "Alice's mail", slot: 'token',
        owner: 'alice', account: 'owner:slack', provider: 'slack', reason: 'account_reconnect_needed',
        title: "Reconnect your Slack account to keep ingesting Alice's mail", detail: 'account must be reconnected', since_unix_ms: now - 2 * H,
      }];
    },
    async listMyAccounts(): Promise<a.AccountList> {
      return { accounts: accounts.filter((x) => x.principal_id === 'alice'), personal_servers: personalServers, redirect_uri: REDIRECT };
    },
    async disconnectMyAccount(serverId: string): Promise<a.AccountMutation> {
      const before = accounts.length;
      accounts = accounts.filter((x) => !(x.principal_id === 'alice' && x.server_id === serverId));
      return mutation(accounts.length < before);
    },
    async confirmMyAccount(serverId: string, account: string): Promise<a.AccountMutation> {
      const x = accounts.find((y) => y.principal_id === 'alice' && y.server_id === serverId);
      if (!x || x.status !== 'pending_confirmation') throw new Error('FAILED_PRECONDITION: nothing to confirm');
      if (x.account !== account) throw new Error('FAILED_PRECONDITION: the account differs from the one shown');
      accounts = accounts.map((y) => (y === x ? { ...y, status: 'connected' } : y));
      return mutation(false);
    },
    async listAccounts(filter: { server_id?: string; principal_id?: string } = {}): Promise<a.AccountList> {
      return {
        accounts: accounts.filter((x) => (!filter.server_id || x.server_id === filter.server_id) && (!filter.principal_id || x.principal_id === filter.principal_id)),
        personal_servers: personalServers,
        redirect_uri: REDIRECT,
      };
    },
    async revokeAccount(serverId: string, principalId: string): Promise<a.AccountMutation> {
      const before = accounts.length;
      accounts = accounts.filter((x) => !(x.server_id === serverId && x.principal_id === principalId));
      return mutation(accounts.length < before);
    },
    async listOrgAccounts(): Promise<a.OrgAccount[]> {
      return org;
    },
    async createOrgAccount(p: a.CreateOrgAccountParams): Promise<a.OrgAccountMutation> {
      const id = `${p.provider}:org:${p.external_account}`;
      const x = org0({ id, provider: p.provider, external_account: p.external_account, display_name: p.display_name, secret_last_four: last4(p.secret),
        created_at_unix_ms: Date.now(), last_used_unix_ms: 0, grants: (p.grants ?? []).map((g) => ({ ...g, granted_at_unix_ms: Date.now() })) });
      org = [...org.filter((y) => y.id !== id), x];
      return orgMutation(x);
    },
    async updateOrgAccount(accountId: string, displayName: string): Promise<a.OrgAccountMutation> {
      return updateOrg(accountId, (x) => ({ ...x, display_name: displayName, updated_at_unix_ms: Date.now() }));
    },
    async rotateOrgAccount(accountId: string, secret: string): Promise<a.OrgAccountMutation> {
      return updateOrg(accountId, (x) => ({ ...x, status: 'connected', status_detail: '', secret_last_four: last4(secret), rotated_at_unix_ms: Date.now() }));
    },
    async revokeOrgAccount(accountId: string): Promise<a.OrgAccountMutation> {
      return updateOrg(accountId, (x) => ({ ...x, status: 'revoked', secret_last_four: '' }));
    },
    async bindOrgAccount(accountId: string, g: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot'> & { scopes?: string[] }): Promise<a.OrgAccountMutation> {
      // One account per (purpose, consumer, slot): binding moves the grant.
      const same = (y: a.AccountGrant) => y.purpose === g.purpose && y.consumer_id === g.consumer_id && y.slot === g.slot;
      org = org.map((x) => ({ ...x, grants: x.grants.filter((y) => !same(y)) }));
      return updateOrg(accountId, (x) => ({ ...x, grants: [...x.grants, { scopes: [], ...g, granted_at_unix_ms: Date.now() }] }));
    },
    async unbindOrgAccount(accountId: string, g: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot'>): Promise<a.OrgAccountMutation> {
      return updateOrg(accountId, (x) => ({ ...x, grants: x.grants.filter((y) => !(y.purpose === g.purpose && y.consumer_id === g.consumer_id && y.slot === g.slot)) }));
    },
    // ── Org OAuth install + system catalog (capability accounts-systems) ──
    async startOrgAccountInstall(p: { provider: string; account_id?: string; consumers?: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot' | 'scopes'>[]; reason: string }): Promise<a.AccountConnectStart> {
      const pc = providers.find((x) => x.provider === p.provider);
      if (!pc?.configured) throw new Error(`FAILED_PRECONDITION: the ${p.provider} OAuth client is not set up`);
      const flow_id = `flow-${++flowSeq}`;
      flows.set(flow_id, { server_id: '', reads: 0, expires: Date.now() + 10 * 60_000, org: { provider: p.provider, account_id: p.account_id ?? '', consumers: p.consumers ?? [] } });
      return { flow_id, expires_at_unix_ms: Date.now() + 10 * 60_000, provider: p.provider, scopes: ['channels:history', 'chat:write'], opened: true, open_error: '' };
    },
    async listSystems(): Promise<a.SystemList> {
      const consumersOf = (x: a.OrgAccount): a.AccountConsumer[] =>
        x.grants.map((g) => ({
          kind: g.purpose, consumer_id: g.consumer_id, display_name: g.consumer_id, slot: g.slot, account_id: x.id, principal_id: '',
          required_scopes: g.scopes, missing_scopes: g.missing_scopes ?? [], state: x.status === 'revoked' ? 'account_revoked' : g.scope_check || 'ok', detail: '',
        }));
      const sys = (id: string, name: string, provider: string, org_mode: string, server_ids: string[], accts: a.OrgAccount[]): a.KernelSystem => {
        const consumers = accts.flatMap(consumersOf);
        return {
          id, name, provider, icon: id, docs_url: '', org_mode, personal_mode: provider ? 'oauth_user' : '', account_providers: provider ? [provider] : [],
          mcp_catalog_ids: server_ids, ingress_templates: [], server_ids, org_account_ids: accts.map((x) => x.id), consumers,
          summary: { org_accounts: accts.length, org_connected: accts.filter((x) => x.status === 'connected').length, org_attention: accts.filter((x) => x.status !== 'connected').length,
            personal_connected: 0, personal_attention: 0, consumers: consumers.length, consumers_needing_consent: consumers.filter((c) => c.state === 'needs_consent').length },
          health: 'ok', org_install_available: org_mode === 'oauth_install' || org_mode === 'admin_consent', org_install_unavailable_reason: '',
        };
      };
      const byProvider = (pv: string) => org.filter((x) => x.provider === pv);
      return {
        operator_view: true,
        systems: [
          sys('slack', 'Slack', 'slack', 'oauth_install', ['slack'], byProvider('slack')),
          sys('google-workspace', 'Google Workspace', 'google', 'service_account_key', ['gmail', 'google-calendar'], byProvider('google')),
          sys('microsoft-365', 'Microsoft 365', 'microsoft', 'admin_consent', ['outlook'], byProvider('microsoft')),
        ],
      };
    },
    async listAccountConsumers(accountId: string): Promise<a.AccountConsumers> {
      const x = org.find((y) => y.id === accountId);
      if (!x) throw new Error('NOT_FOUND: no such account');
      return {
        account_id: accountId,
        consumers: x.grants.map((g) => ({
          kind: g.purpose, consumer_id: g.consumer_id, display_name: g.consumer_id, slot: g.slot, account_id: accountId, principal_id: '',
          required_scopes: g.scopes, missing_scopes: [], state: x.status === 'revoked' ? 'account_revoked' : 'ok', detail: '',
        })),
      };
    },
    async listProviderClients(): Promise<a.ProviderClients> {
      return { providers, redirect_uri: REDIRECT };
    },
    async setProviderClient(p: { provider: string; client_id: string; client_secret: string; reason: string }): Promise<a.ProviderClientMutation> {
      const cur = providers.find((x) => x.provider === p.provider);
      if (!cur) throw new Error(`NOT_FOUND: provider ${p.provider}`);
      const next: a.ProviderClient = {
        ...cur,
        client_id_configured: cur.client_id_configured || p.client_id !== '',
        client_id_last_four: p.client_id ? last4(p.client_id) : cur.client_id_last_four,
        client_secret_configured: cur.client_secret_configured || p.client_secret !== '',
        updated_at_unix_ms: Date.now(),
      };
      next.configured = next.client_id_configured && (next.public_client || next.client_secret_configured);
      providers = providers.map((x) => (x.provider === p.provider ? next : x));
      personalServers.forEach((s) => {
        if (s.provider === p.provider) s.provider_configured = next.configured;
      });
      return { command_id: cmd(), deduped: false, provider: next };
    },
    async clearProviderClient(provider: string): Promise<a.ProviderClientMutation> {
      providers = providers.map((x) =>
        x.provider === provider ? { ...x, client_id_configured: false, client_id_last_four: '', client_secret_configured: false, configured: false, updated_at_unix_ms: Date.now() } : x,
      );
      personalServers.forEach((s) => {
        if (s.provider === provider) s.provider_configured = false;
      });
      return { command_id: cmd(), deduped: false, provider: providers.find((x) => x.provider === provider) ?? null };
    },
    // Minimal Ingress Studio surface: the system page's Data in, and the picker.
    async studioListIngresses(): Promise<StudioIngress[]> {
      return ingresses;
    },
    async studioLifecycle(verb: string, ingressId: string): Promise<StudioAck> {
      ingresses = ingresses.map((g) => (g.ingress_id === ingressId ? { ...g, state: verb === 'pause' ? 'PAUSED' : verb === 'resume' ? 'ARMED' : g.state } : g));
      return { ok: true, error: '', detail: `${verb} applied` };
    },
    async studioGetIngress(ingressId: string): Promise<StudioStatus> {
      const g = ingresses.find((x) => x.ingress_id === ingressId) ?? ingresses[0];
      return {
        summary: g, latest_transport_revision: 2, latest_mapping_revision: 3, release_id: g.pinned_release, armed_transport_revision: 2, armed_mapping_revision: 3,
        capture_samples: 12, failure_count: 0,
        credentials: [{ name: 'signing_secret', configured: true, last_four: '9f1c', direction: 'inbound' }, { name: 'api_key', configured: false, last_four: '', direction: 'outbound' }],
        egress_policy_json: '{}',
        armed_history_transport_revision: 0,
        latest_history_transport_revision: 0,
      };
    },
  };
}
