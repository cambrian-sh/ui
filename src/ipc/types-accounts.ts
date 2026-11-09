/* Accounts plane (ADR-0141, premium AccountsAdmin, capability `accounts`).
 *
 * Two halves:
 *  - PHASE 1 — personal accounts; mirrors ui/proto/accounts/accounts.proto
 *    (Rust: src-tauri/src/accounts.rs).
 *  - PHASE 2 — phishing confirmation, org accounts + grants, provider OAuth
 *    clients. Also mirrors the proto. Every field is metadata: there is no
 *    token or secret field on any READ shape here, by construction (secrets
 *    appear only as write-only request parameters).
 */

// ── Phase 1 (proto) ───────────────────────────────────────────────────────

/** Personal account health: connected | reconnect_needed | pending_confirmation (phase 2). */
export type AccountStatus =
  | 'connected'
  | 'reconnect_needed'
  | 'pending_confirmation'
  | (string & {});

export interface Account {
  server_id: string;
  principal_id: string;
  provider: string;
  /** The account at the provider (email, login, workspace id). */
  account: string;
  scopes: string[];
  status: AccountStatus;
  status_detail: string;
  connected_at_unix_ms: number;
  last_used_unix_ms: number;
  last_refreshed_unix_ms: number;
  expires_at_unix_ms: number;
  /** Deterministic <provider>:<principal>:<server> (phase 2; "" from a phase-1 kernel). */
  account_id: string;
  /** The provider's stable subject id, when reported. */
  account_subject: string;
  /** Scopes the server declares that this account was not granted ("needs more permission"). Absent from an older kernel. */
  missing_scopes?: string[];
}

export interface PersonalServer {
  server_id: string;
  display_name: string;
  provider: string;
  /** per_user | either */
  credential_scope: string;
  scopes: string[];
  /** False until an operator stores the provider's OAuth client. */
  provider_configured: boolean;
  /** What MY connected account for this server lacks (ListMyAccounts). */
  missing_scopes?: string[];
}

export interface AccountList {
  accounts: Account[];
  personal_servers: PersonalServer[];
  /** What an operator registers with each provider. */
  redirect_uri: string;
}

/** A started sign-in. The start URL is opened by the Rust core and never reaches the webview. */
export interface AccountConnectStart {
  flow_id: string;
  expires_at_unix_ms: number;
  provider: string;
  scopes: string[];
  opened: boolean;
  open_error: string;
}

export type ConnectFlowStatus = 'pending' | 'started' | 'completed' | 'failed' | 'expired' | (string & {});

export interface AccountConnectFlow {
  status: ConnectFlowStatus;
  detail: string;
  server_id: string;
  account: string;
  expires_at_unix_ms: number;
  /** "" (personal sign-in) | "org" (organisation install). */
  mode?: string;
  /** An org install's account (widened, or produced once completed). */
  account_id?: string;
}

export interface AccountMutation {
  command_id: string;
  deduped: boolean;
  removed: boolean;
}

// ── Phase 2 (proto) ──────────────────────────────────────────────────────

/** Binds one consumer to an org account for one purpose. */
export interface AccountGrant {
  /** mcp (a server's shared credential) | ingress (an ingress's outbound credential) */
  purpose: 'mcp' | 'ingress' | (string & {});
  /** MCP server id or ingress id. */
  consumer_id: string;
  /** token | env:<NAME> | an ingress credential binding name. */
  slot: string;
  /** Scopes this consumer DECLARES it needs. */
  scopes: string[];
  granted_at_unix_ms: number;
  /** Read-only: what the account's granted scopes do not cover. */
  missing_scopes?: string[];
  /** Read-only: ok | needs_consent | unverified | account_revoked | reconnect_needed */
  scope_check?: string;
}

/** An organisation-owned account (a pasted key or bot token). `secret_last_four` is all any read says. */
export interface OrgAccount {
  /** Deterministic: <provider>:org:<external_account>. */
  id: string;
  /** static_token | api_key | an OAuth provider id. */
  provider: string;
  external_account: string;
  display_name: string;
  /** connected | revoked */
  status: 'connected' | 'revoked' | (string & {});
  status_detail: string;
  created_at_unix_ms: number;
  updated_at_unix_ms: number;
  rotated_at_unix_ms: number;
  last_used_unix_ms: number;
  secret_last_four: string;
  grants: AccountGrant[];
  /** operator | migrated:<legacy secret name> */
  origin: string;
  /** Scopes the account was GRANTED (an install: reported; a pasted key: recorded). */
  scopes?: string[];
  /** "" (pasted) | oauth_install | client_credentials */
  auth_kind?: string;
  expires_at_unix_ms?: number;
  /** False for a pasted key with no recorded scopes: its consumers are unverified. */
  scopes_known?: boolean;
}

export interface OrgAccountMutation {
  command_id: string;
  deduped: boolean;
  account: OrgAccount | null;
}

export interface CreateOrgAccountParams {
  provider: string;
  external_account: string;
  display_name: string;
  /** Write-only; sent once, never kept in webview state after the call. */
  secret: string;
  grants?: Pick<AccountGrant, 'purpose' | 'consumer_id' | 'slot' | 'scopes'>[];
  /** Scopes the pasted key is known to carry (optional; then enforced). */
  scopes?: string[];
  reason: string;
}

/** One OAuth provider's client registration — status only; the secret is write-only. */
export interface ProviderClient {
  provider: string;
  display_name: string;
  client_id_configured: boolean;
  client_id_last_four: string;
  client_secret_configured: boolean;
  /** Latest write of either half; 0 = unknown. */
  updated_at_unix_ms: number;
  /** The provider takes no client secret (PKCE only). */
  public_client: boolean;
  /** Usable for sign-in. */
  configured: boolean;
}

export interface ProviderClients {
  providers: ProviderClient[];
  /** What an operator registers with each provider. */
  redirect_uri: string;
}

export interface ProviderClientMutation {
  command_id: string;
  deduped: boolean;
  provider: ProviderClient | null;
}

// -- Org OAuth install + system catalog (proto; capability `accounts-systems`) --

export type ConsumerState =
  | 'ok'
  | 'needs_consent'
  | 'unverified'
  | 'account_revoked'
  | 'reconnect_needed'
  | 'pending_confirmation'
  | 'not_connected'
  | (string & {});

/** One consumer bound to an account: what breaks if it is revoked. */
export interface AccountConsumer {
  /** mcp | ingress */
  kind: string;
  consumer_id: string;
  display_name: string;
  slot: string;
  account_id: string;
  /** A personal account's owner; "" for org. */
  principal_id: string;
  required_scopes: string[];
  missing_scopes: string[];
  state: ConsumerState;
  detail: string;
}

export interface AccountConsumers {
  account_id: string;
  consumers: AccountConsumer[];
}

export interface SystemAccountSummary {
  org_accounts: number;
  org_connected: number;
  org_attention: number;
  personal_connected: number;
  personal_attention: number;
  consumers: number;
  consumers_needing_consent: number;
}

/** One external system from the kernel's premium catalog (ADR-0141 D5). */
export interface KernelSystem {
  id: string;
  name: string;
  provider: string;
  /** An icon KEY, not a URL. */
  icon: string;
  docs_url: string;
  /** oauth_install | admin_consent | service_account_key | static | "" */
  org_mode: string;
  /** oauth_user | "" */
  personal_mode: string;
  account_providers: string[];
  mcp_catalog_ids: string[];
  ingress_templates: string[];
  server_ids: string[];
  /** Operator view only. */
  org_account_ids: string[];
  consumers: AccountConsumer[];
  summary: SystemAccountSummary;
  /** ok | attention | not_connected | idle */
  health: string;
  org_install_available: boolean;
  org_install_unavailable_reason: string;
}

export interface SystemList {
  systems: KernelSystem[];
  operator_view: boolean;
}

/**
 * A consumer (today: an ingress) stopped because its account is unusable
 * (ADR-0141 D3; AccountsAdmin.ListMyAttention). Addressed to the caller:
 * their own personal ingest, plus the organisation's for an Operator.
 * Resolves itself when the account works again. Never carries a credential.
 */
export interface AttentionItem {
  id: string;
  purpose: string;
  consumer_id: string;
  consumer_name: string;
  slot: string;
  /** Who must act; '' = the organisation (Operators). */
  owner: string;
  account: string;
  provider: string;
  /** account_revoked | account_reconnect_needed | account_pending_confirmation | account_missing | account_not_permitted | account_insufficient_scope */
  reason: string;
  title: string;
  detail: string;
  since_unix_ms: number;
}
