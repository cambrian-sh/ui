import { describe, expect, it, vi } from 'vitest';
import type { Account, AccountList, Integration, KernelSystem, OrgAccount, PersonalServer, StudioIngress } from '@/ipc/types';
import { createAccountsMock } from '@/ipc/accounts-mock';
import {
  accountInboxEntries,
  accountState,
  buildSystems,
  ingressAccountChoices,
  isAccountBacked,
  myAccountActions,
  myAccountRows,
  orgAccountActions,
  orgAccountState,
  orgInstallConsumers,
  phaseFromFlow,
  revokeImpact,
  runConnectFlow,
  serverSlots,
  systemIdForServer,
  type ConnectPhase,
} from './accounts';

const acct = (o: Partial<Account>): Account => ({
  server_id: 'gmail', principal_id: 'alice', provider: 'google', account: 'alice@x', scopes: [], status: 'connected', status_detail: '',
  connected_at_unix_ms: 1, last_used_unix_ms: 0, last_refreshed_unix_ms: 0, expires_at_unix_ms: 0, account_id: '', account_subject: '', ...o,
});
const server = (o: Partial<PersonalServer>): PersonalServer => ({
  server_id: 'gmail', display_name: 'Gmail', provider: 'google', credential_scope: 'per_user', scopes: [], provider_configured: true, ...o,
});
const org = (o: Partial<OrgAccount>): OrgAccount => ({
  id: 'static_token:org:x', provider: 'static_token', external_account: 'x', display_name: '', status: 'connected', status_detail: '',
  created_at_unix_ms: 0, updated_at_unix_ms: 0, rotated_at_unix_ms: 0, last_used_unix_ms: 0, secret_last_four: '1234', grants: [], origin: 'operator', ...o,
});
const g = (purpose: string, consumer_id: string, slot = 'token') => ({ purpose, consumer_id, slot, scopes: [], granted_at_unix_ms: 0 });
const integration = (id: string, o: Partial<Integration> = {}): Integration =>
  ({ id, catalog_id: id, name: id, category: '', source: 'store', overrides_file: false, editable: true, enabled: true, transport: 'stdio',
    command: '', args: [], url: '', settings: {}, secrets: [], health: null, installed_version: '', update_available: false, missing_required: [],
    tool_policies: [], has_default_policy: false, default_policy: null, policy_summary: '', classification_tags: [], trust_tier: '', passthrough_env: [], ...o }) as Integration;
const ingress = (id: string, state = 'ARMED', health = 'ok'): StudioIngress => ({ ingress_id: id, display_name: id, state, health, pinned_release: '' });

describe('account state', () => {
  it('maps connect / pending_confirmation / reconnect / unknown', () => {
    expect(accountState(undefined, server({}))).toBe('not_connected');
    expect(accountState(undefined, server({ provider_configured: false }))).toBe('provider_unconfigured');
    expect(accountState(acct({}))).toBe('connected');
    expect(accountState(acct({ status: 'pending_confirmation' }))).toBe('pending_confirmation');
    expect(accountState(acct({ status: 'reconnect_needed' }))).toBe('reconnect_needed');
    // An unrecognised status is never shown as healthy.
    expect(accountState(acct({ status: 'weird' }))).toBe('error');
    expect(orgAccountState(org({ status: 'revoked' }))).toBe('revoked');
    expect(orgAccountState(org({ status: '?' }))).toBe('error');
  });

  it('offers my-account actions per state', () => {
    expect(myAccountActions('not_connected')).toEqual(['connect']);
    expect(myAccountActions('provider_unconfigured')).toEqual([]);
    expect(myAccountActions('pending_confirmation')).toEqual(['confirm', 'disconnect']);
    expect(myAccountActions('reconnect_needed')).toEqual(['reconnect', 'disconnect']);
    expect(myAccountActions('connected')).toEqual(['disconnect']);
  });

  it('gives org-account controls to operators only; a revoked account is re-activated by a new key', () => {
    expect(orgAccountActions(undefined, { isOperator: false })).toEqual([]);
    expect(orgAccountActions(undefined, { isOperator: true })).toEqual(['create']);
    expect(orgAccountActions(org({}), { isOperator: true })).toEqual(['rotate', 'rename', 'revoke']);
    expect(orgAccountActions(org({ status: 'revoked' }), { isOperator: true })).toEqual(['reactivate', 'rename']);
  });

  it('builds one row per personal server, with my account when connected', () => {
    const list: AccountList = {
      accounts: [acct({ status: 'reconnect_needed' })],
      personal_servers: [server({}), server({ server_id: 'outlook', provider: 'microsoft', provider_configured: false })],
      redirect_uri: '',
    };
    expect(myAccountRows(list).map((r) => [r.server.server_id, r.state])).toEqual([
      ['gmail', 'reconnect_needed'],
      ['outlook', 'provider_unconfigured'],
    ]);
  });

  it('turns pending and dead accounts into inbox entries, and nothing else', () => {
    const list: AccountList = {
      accounts: [acct({ status: 'pending_confirmation' }), acct({ server_id: 'slack', status: 'reconnect_needed' }), acct({ server_id: 'cal' })],
      personal_servers: [server({}), server({ server_id: 'slack', display_name: 'Slack' })],
      redirect_uri: '',
    };
    const e = accountInboxEntries(list);
    expect(e.map((x) => x.kind)).toEqual(['account_confirm', 'account_reconnect']);
    expect(e[1].title).toBe('Connect your Slack account to continue');
    expect(accountInboxEntries(null)).toEqual([]);
  });

  it('names the grant slots a server can take', () => {
    expect(serverSlots(integration('a', { secrets: [{ name: 'K', label: '', set: true, source: '', updated_at_unix_ms: 0, required: true, kind: 'env' }] }))).toEqual(['env:K']);
    expect(serverSlots(integration('b', { transport: 'http' }))).toEqual(['token']);
    expect(serverSlots(integration('c'))).toEqual([]);
  });
});

describe('OAuth start flow', () => {
  const noSleep = () => Promise.resolve();

  it('opens, waits, completes', async () => {
    const phases: ConnectPhase[] = [];
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ status: 'started', detail: '', server_id: 'gmail', account: '', expires_at_unix_ms: 0 })
      .mockResolvedValueOnce({ status: 'completed', detail: '', server_id: 'gmail', account: 'alice@x', expires_at_unix_ms: 0 });
    const end = await runConnectFlow('gmail', {
      start: async () => ({ flow_id: 'f1', expires_at_unix_ms: 0, provider: 'google', scopes: ['a'], opened: true, open_error: '' }),
      poll,
      sleep: noSleep,
      onPhase: (p) => phases.push(p),
    });
    expect(end).toEqual({ phase: 'completed', server_id: 'gmail', account: 'alice@x' });
    expect(phases.map((p) => p.phase)).toEqual(['starting', 'waiting', 'completed']);
    expect(poll).toHaveBeenCalledWith('f1');
  });

  it('stops at once when the browser did not open (no polling)', async () => {
    const poll = vi.fn();
    const end = await runConnectFlow('gmail', {
      start: async () => ({ flow_id: 'f', expires_at_unix_ms: 0, provider: 'g', scopes: [], opened: false, open_error: 'refused scheme' }),
      poll,
      sleep: noSleep,
      onPhase: () => {},
    });
    expect(end).toEqual({ phase: 'browser_failed', server_id: 'gmail', detail: 'refused scheme' });
    expect(poll).not.toHaveBeenCalled();
  });

  it('reports a start refusal, a provider failure, expiry and cancel', async () => {
    const base = { sleep: noSleep, onPhase: () => {} };
    expect(await runConnectFlow('x', { ...base, start: () => Promise.reject(new Error('FAILED_PRECONDITION')), poll: vi.fn() })).toMatchObject({ phase: 'failed', detail: 'FAILED_PRECONDITION' });
    const opened = async () => ({ flow_id: 'f', expires_at_unix_ms: 100, provider: 'g', scopes: [], opened: true, open_error: '' });
    expect(
      await runConnectFlow('x', { ...base, start: opened, poll: async () => ({ status: 'failed', detail: 'access_denied', server_id: 'x', account: '', expires_at_unix_ms: 100 }) }),
    ).toMatchObject({ phase: 'failed', detail: 'access_denied' });
    expect(
      await runConnectFlow('x', { ...base, start: opened, now: () => 200, poll: async () => ({ status: 'pending', detail: '', server_id: 'x', account: '', expires_at_unix_ms: 100 }) }),
    ).toMatchObject({ phase: 'expired' });
    const ctl = new AbortController();
    ctl.abort();
    expect(await runConnectFlow('x', { ...base, start: opened, poll: vi.fn(), signal: ctl.signal })).toMatchObject({ phase: 'cancelled' });
  });

  it('tolerates transient poll errors, then gives up', async () => {
    const poll = vi.fn().mockRejectedValue(new Error('unavailable'));
    const end = await runConnectFlow('x', {
      start: async () => ({ flow_id: 'f', expires_at_unix_ms: 0, provider: 'g', scopes: [], opened: true, open_error: '' }),
      poll,
      sleep: noSleep,
      onPhase: () => {},
    });
    expect(end).toMatchObject({ phase: 'failed', detail: 'unavailable' });
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it('phaseFromFlow keeps waiting while pending', () => {
    expect(phaseFromFlow('x', { status: 'started', detail: '', server_id: 'x', account: '', expires_at_unix_ms: 0 }, 5)).toBeNull();
  });

  it('runs end-to-end against the mock plane: sign-in lands pending, confirm needs the shown identity', async () => {
    const m = createAccountsMock();
    const end = await runConnectFlow('google-calendar', { start: m.startAccountConnect, poll: m.getAccountConnectFlow, sleep: noSleep, onPhase: () => {} });
    expect(end.phase).toBe('completed');
    const status = async () => (await m.listMyAccounts()).accounts.find((a) => a.server_id === 'google-calendar')?.status;
    expect(await status()).toBe('pending_confirmation');
    await expect(m.confirmMyAccount('google-calendar', 'mallory@evil.example')).rejects.toThrow(/differs/);
    await m.confirmMyAccount('google-calendar', 'alice@acme.example');
    expect(await status()).toBe('connected');
  });
});

describe('buildSystems', () => {
  it('groups personal servers by provider, org accounts by their MCP grants, ingresses by their account', () => {
    const systems = buildSystems({
      integrations: [integration('gmail'), integration('calendar'), integration('slack'), integration('filesystem')],
      providers: [{ provider: 'google', display_name: 'Google Workspace' } as never],
      mine: {
        accounts: [acct({ server_id: 'slack', provider: 'slack', status: 'reconnect_needed' })],
        personal_servers: [server({}), server({ server_id: 'calendar' }), server({ server_id: 'slack', provider: 'slack', credential_scope: 'either' })],
        redirect_uri: '',
      },
      all: { accounts: [acct({ principal_id: 'bob' })], personal_servers: [], redirect_uri: '' },
      org: [
        org({ id: 'slack:org:T1', provider: 'slack', display_name: 'Bot', grants: [g('mcp', 'slack'), g('ingress', 'slack-eng', 'bot_token')] }),
        org({ id: 'static_token:org:pat', display_name: 'PAT', grants: [g('ingress', 'github-prs', 'api_key')] }),
      ],
      ingresses: [ingress('slack-eng'), ingress('github-prs', 'PAUSED', 'error')],
    });
    expect(systems.map((s) => [s.id, s.name])).toEqual([
      ['filesystem', 'filesystem'],
      ['google', 'Google Workspace'],
      ['account:static_token:org:pat', 'PAT'],
      ['slack', 'Slack'],
    ]);
    const google = systems.find((s) => s.id === 'google')!;
    expect(google.servers.map((i) => i.id)).toEqual(['gmail', 'calendar']);
    expect(google.mine.map((r) => r.state)).toEqual(['not_connected', 'not_connected']);
    expect(google.personal_accounts.map((a) => a.principal_id)).toEqual(['bob']);
    const slack = systems.find((s) => s.id === 'slack')!;
    expect(slack.org_accounts.map((a) => a.id)).toEqual(['slack:org:T1']);
    expect(slack.data_in.map((d) => [d.ingress_id, d.slot, d.active, d.can_toggle])).toEqual([['slack-eng', 'bot_token', true, true]]);
    expect(slack.attention).toBe(1); // my reconnect
    const pat = systems.find((s) => s.id.startsWith('account:'))!;
    expect(pat.data_in[0]).toMatchObject({ ingress_id: 'github-prs', health: 'error', active: false });
    expect(pat.attention).toBe(1);
    expect(systems.find((s) => s.id === 'filesystem')!.org_accounts).toEqual([]);
    expect(systemIdForServer(systems, 'calendar')).toBe('google');
  });

  it('folds multi-instance servers under their catalog id and names them from the catalog', () => {
    const systems = buildSystems({
      integrations: [integration('pg-a', { catalog_id: 'postgres' }), integration('pg-b', { catalog_id: 'postgres' })],
      catalog: [{ id: 'postgres', name: 'PostgreSQL' } as never],
    });
    expect(systems.map((s) => [s.id, s.name, s.servers.length])).toEqual([['postgres', 'PostgreSQL', 2]]);
  });

  it('keeps personal servers visible without the integrations listing', () => {
    const systems = buildSystems({ integrations: [], mine: { accounts: [], personal_servers: [server({})], redirect_uri: '' } });
    expect(systems.map((s) => s.id)).toEqual(['google']);
    expect(systems[0].mine).toHaveLength(1);
  });

  it('marks per_user servers and org-bound servers as account-backed', () => {
    const [s] = buildSystems({
      integrations: [integration('gmail'), integration('slack')],
      mine: { accounts: [], personal_servers: [server({}), server({ server_id: 'slack', credential_scope: 'either' })], redirect_uri: '' },
    });
    expect(isAccountBacked(s.servers[0], s)).toBe(true);
    expect(isAccountBacked(s.servers[1], s)).toBe(false); // either, no org grant: the shared secret still applies
  });

  it('lists ingress account choices: the bound one first, revoked ones only when bound', () => {
    const accounts = [
      org({ id: 'a', display_name: 'A' }),
      org({ id: 'b', display_name: 'B', grants: [g('ingress', 'i1', 'api_key')] }),
      org({ id: 'c', display_name: 'C', status: 'revoked' }),
    ];
    expect(ingressAccountChoices(accounts, 'i1', 'api_key').map((c) => [c.account.id, c.bound])).toEqual([
      ['b', true],
      ['a', false],
    ]);
  });
});

// ── The kernel's system catalog (ListSystems) + org install + scopes ─────────

const ksys = (o: Partial<KernelSystem>): KernelSystem => ({
  id: 'slack', name: 'Slack', provider: 'slack', icon: 'slack', docs_url: '', org_mode: 'oauth_install', personal_mode: 'oauth_user',
  account_providers: ['slack'], mcp_catalog_ids: ['slack'], ingress_templates: [], server_ids: [], org_account_ids: [], consumers: [],
  summary: { org_accounts: 0, org_connected: 0, org_attention: 0, personal_connected: 0, personal_attention: 0, consumers: 0, consumers_needing_consent: 0 },
  health: 'ok', org_install_available: false, org_install_unavailable_reason: '', ...o,
});

describe('buildSystems from the kernel catalog', () => {
  it('takes the catalog membership as given and derives only what it does not claim', () => {
    const systems = buildSystems({
      integrations: [integration('slack-bot', { catalog_id: 'custom' }), integration('gmail'), integration('postgres')],
      mine: { accounts: [], personal_servers: [server({})], redirect_uri: '' },
      org: [
        org({ id: 'static_token:org:bot', display_name: 'Bot', grants: [{ ...g('ingress', 'dms', 'token'), scopes: ['files:read'], missing_scopes: ['files:read'], scope_check: 'needs_consent' }] }),
        org({ id: 'static_token:org:loose', display_name: 'Loose' }),
      ],
      systems: [
        // The catalog claims a server whose catalog id the console could not have guessed.
        ksys({ server_ids: ['slack-bot'], org_account_ids: ['static_token:org:bot'], org_install_available: true,
          consumers: [{ kind: 'mcp', consumer_id: 'slack-bot', display_name: 'Slack bot', slot: 'token', account_id: 'static_token:org:bot', principal_id: '', required_scopes: ['chat:write'], missing_scopes: ['chat:write'], state: 'needs_consent', detail: '' }] }),
        ksys({ id: 'notion', name: 'Notion', provider: 'notion', health: 'idle' }), // idle, not installable: hidden
        ksys({ id: 'microsoft-365', name: 'Microsoft 365', provider: 'microsoft', health: 'idle', org_install_available: true }), // installable: shown
      ],
    });
    expect(systems.map((s) => [s.id, s.from_catalog])).toEqual([
      ['google', false],
      ['account:static_token:org:loose', false],
      ['microsoft-365', true],
      ['postgres', false],
      ['slack', true],
    ]);
    const slack = systems.find((s) => s.id === 'slack')!;
    expect(slack.servers.map((i) => i.id)).toEqual(['slack-bot']);
    expect(slack.org_accounts.map((a) => a.id)).toEqual(['static_token:org:bot']);
    expect(slack.org_install_available).toBe(true);
    expect(slack.data_in[0].missing_scopes).toEqual(['files:read']);
    expect(slack.attention).toBe(2); // the ingress and the MCP consumer short of permission
    expect(orgInstallConsumers(slack)).toEqual([{ purpose: 'mcp', consumer_id: 'slack-bot', slot: 'token', scopes: [] }]);
  });

  it('derives everything on an older kernel (no catalog)', () => {
    const a = buildSystems({ integrations: [integration('gmail')], systems: null });
    const b = buildSystems({ integrations: [integration('gmail')] });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a[0].from_catalog).toBe(false);
  });
});

describe('org installs and grant scopes', () => {
  it('an installed account is re-installed, never rotated with a pasted key', () => {
    expect(orgAccountActions(org({ auth_kind: 'oauth_install' }), { isOperator: true })).toEqual(['reinstall', 'rename', 'revoke']);
    expect(orgAccountActions(org({ auth_kind: 'oauth_install', status: 'reconnect_needed' }), { isOperator: true })).toEqual(['reinstall', 'rename']);
    expect(orgAccountState(org({ status: 'reconnect_needed' }))).toBe('reconnect_needed');
    expect(orgAccountActions(org({}), { isOperator: true })).toEqual(['rotate', 'rename', 'revoke']);
  });

  it('a connected account short of the server scopes asks to reconnect, in the row and the Inbox', () => {
    const list: AccountList = { accounts: [acct({ missing_scopes: ['gmail.send'] })], personal_servers: [server({})], redirect_uri: '' };
    expect(myAccountRows(list)[0].actions).toEqual(['reconnect', 'disconnect']);
    const inbox = accountInboxEntries(list);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: 'account_reconnect', key: 'account:consent:gmail' });
    expect(inbox[0].title).toMatch(/more permission/);
  });

  it('revoke impact names what stops', () => {
    expect(revokeImpact([]).text).toBe('Nothing uses this account.');
    const r = revokeImpact([
      { kind: 'mcp', consumer_id: 's', display_name: 'Slack', slot: 'token', account_id: 'a', principal_id: '', required_scopes: [], missing_scopes: [], state: 'ok', detail: '' },
      { kind: 'ingress', consumer_id: 'i', display_name: '', slot: 'token', account_id: 'a', principal_id: '', required_scopes: [], missing_scopes: [], state: 'account_revoked', detail: '' },
    ]);
    expect(r.live).toHaveLength(1);
    expect(r.text).toBe('Stops: agent tools Slack.');
  });

  it('the mock plane installs an org account through the same flow driver', async () => {
    const m = createAccountsMock();
    const end = await runConnectFlow('slack', {
      start: () => m.startOrgAccountInstall({ provider: 'slack', consumers: [{ purpose: 'mcp', consumer_id: 'slack', slot: 'token', scopes: [] }], reason: 'r' }),
      poll: m.getAccountConnectFlow, sleep: () => Promise.resolve(), onPhase: () => {},
    });
    expect(end.phase).toBe('completed');
    const installed = (await m.listOrgAccounts()).find((a) => a.auth_kind === 'oauth_install');
    expect(installed?.grants.map((x) => x.consumer_id)).toEqual(['slack']);
    expect((await m.listSystems()).systems.map((s) => s.id)).toContain('slack');
  });
});
