/* The accounts plane's IPC (ADR-0141; capability `accounts`). Spread into
 * `ipc` in client.ts; the mock twin is ipc/accounts-mock.ts.
 *
 * Every method invokes a Tauri command in src-tauri/src/accounts.rs (+ lib.rs).
 * Secrets (an org key, an OAuth client secret) are parameters only: they go
 * webview -> Rust core -> kernel once, and no response carries one.
 * `command_id` is generated in the Rust core.
 */

import { invoke } from '@tauri-apps/api/core';
import type * as a from './types-accounts';

export const accountsClient = {
  // ── Personal accounts (self-service: any role, the caller only) ─────────
  /** Starts a personal sign-in; the Rust core opens it in the system browser. */
  startAccountConnect: (serverId: string): Promise<a.AccountConnectStart> =>
    invoke<a.AccountConnectStart>('op_start_account_connect', { server_id: serverId }),
  getAccountConnectFlow: (flowId: string): Promise<a.AccountConnectFlow> =>
    invoke<a.AccountConnectFlow>('op_get_account_connect_flow', { flow_id: flowId }),
  listMyAccounts: (): Promise<a.AccountList> => invoke<a.AccountList>('op_list_my_accounts'),
  /** Consumers (ingresses) paused because their account is unusable, addressed to me (ADR-0141 D3). */
  listMyAttention: (): Promise<a.AttentionItem[]> => invoke<a.AttentionItem[]>('op_list_my_attention'),
  disconnectMyAccount: (serverId: string, reason = ''): Promise<a.AccountMutation> =>
    invoke<a.AccountMutation>('op_disconnect_my_account', { server_id: serverId, reason }),
  /** Phishing defence: `account` is the identity the person was shown; the kernel refuses a mismatch. */
  confirmMyAccount: (serverId: string, account: string): Promise<a.AccountMutation> =>
    invoke<a.AccountMutation>('op_confirm_my_account', { server_id: serverId, account }),

  // ── Operator (kernel-enforced role) ─────────────────────────────────────
  listAccounts: (filter: { server_id?: string; principal_id?: string } = {}): Promise<a.AccountList> =>
    invoke<a.AccountList>('op_list_accounts', { server_id: filter.server_id ?? '', principal_id: filter.principal_id ?? '' }),
  revokeAccount: (serverId: string, principalId: string, reason: string): Promise<a.AccountMutation> =>
    invoke<a.AccountMutation>('op_revoke_account', { server_id: serverId, principal_id: principalId, reason }),

  listOrgAccounts: (filter: { provider?: string; consumer_id?: string } = {}): Promise<a.OrgAccount[]> =>
    invoke<a.OrgAccount[]>('op_list_org_accounts', { provider: filter.provider ?? '', consumer_id: filter.consumer_id ?? '' }),
  createOrgAccount: (p: a.CreateOrgAccountParams): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_create_org_account', {
      provider: p.provider,
      external_account: p.external_account,
      display_name: p.display_name,
      secret: p.secret,
      grants: (p.grants ?? []).map((g) => ({ ...g, granted_at_unix_ms: 0 })),
      scopes: p.scopes ?? [],
      reason: p.reason,
    }),
  updateOrgAccount: (accountId: string, displayName: string, reason: string): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_update_org_account', { account_id: accountId, display_name: displayName, reason }),
  /** New secret; also re-activates a revoked account. */
  rotateOrgAccount: (accountId: string, secret: string, reason: string): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_rotate_org_account', { account_id: accountId, secret, reason }),
  revokeOrgAccount: (accountId: string, reason: string): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_revoke_org_account', { account_id: accountId, reason }),
  bindOrgAccount: (
    accountId: string,
    grant: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot'> & { scopes?: string[] },
    reason: string,
  ): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_bind_org_account', {
      account_id: accountId,
      grant: { scopes: [], ...grant, granted_at_unix_ms: 0 },
      reason,
    }),
  unbindOrgAccount: (
    accountId: string,
    grant: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot'>,
    reason: string,
  ): Promise<a.OrgAccountMutation> =>
    invoke<a.OrgAccountMutation>('op_unbind_org_account', { account_id: accountId, ...grant, reason }),

  listProviderClients: (): Promise<a.ProviderClients> => invoke<a.ProviderClients>('op_list_provider_clients'),
  /** `client_secret` "" keeps the stored secret. */
  setProviderClient: (p: { provider: string; client_id: string; client_secret: string; reason: string }): Promise<a.ProviderClientMutation> =>
    invoke<a.ProviderClientMutation>('op_set_provider_client', { ...p }),
  clearProviderClient: (provider: string, reason: string): Promise<a.ProviderClientMutation> =>
    invoke<a.ProviderClientMutation>('op_clear_provider_client', { provider, reason }),

  // ── Org OAuth install + system catalog (capability `accounts-systems`) ──
  /**
   * Organisation install (Operator). The Rust core opens the kernel's start
   * URL in the system browser; follow it with getAccountConnectFlow. With
   * `account_id` it widens that account (incremental consent).
   */
  startOrgAccountInstall: (p: {
    provider: string;
    account_id?: string;
    consumers?: Pick<a.AccountGrant, 'purpose' | 'consumer_id' | 'slot' | 'scopes'>[];
    reason: string;
  }): Promise<a.AccountConnectStart> =>
    invoke<a.AccountConnectStart>('op_start_org_account_install', {
      provider: p.provider,
      account_id: p.account_id ?? '',
      consumers: (p.consumers ?? []).map((g) => ({ ...g, granted_at_unix_ms: 0 })),
      reason: p.reason,
    }),
  /** The kernel's system catalog (any role; a non-operator sees their own accounts only). */
  listSystems: (): Promise<a.SystemList> => invoke<a.SystemList>('op_list_systems'),
  /** What is bound to an account: what breaks if it is revoked (Operator). */
  listAccountConsumers: (accountId: string): Promise<a.AccountConsumers> =>
    invoke<a.AccountConsumers>('op_list_account_consumers', { account_id: accountId }),
} as const;
