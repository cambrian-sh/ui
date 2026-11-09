//! The premium accounts plane (ADR-0141 D8, capability `accounts`):
//! `cambrian.premium.accounts.AccountsAdmin`, mounted on the kernel server and
//! spoken over the same channel and bearer token as OperatorConsole (ADR-0088).
//!
//! An ACCOUNT is an outbound credential to an external system with an owner
//! (a person, or the org from phase 2). This module carries METADATA ONLY:
//! the proto has no token field, and nothing here adds one.
//!
//! Load-bearing:
//! * **The sign-in URL never reaches the webview.** `StartAccountConnect`
//!   returns a single-use kernel `start_url` that binds the sign-in to the
//!   browser that opens it. The Rust core opens it in the SYSTEM browser
//!   (tauri-plugin-opener, never a webview: a webview would let this app read
//!   the provider's sign-in page) and hands the webview only the flow id,
//!   provider, scopes and expiry. The URL is not logged.
//! * Only `http`/`https` URLs are opened; anything else is refused, so a
//!   compromised or confused kernel cannot make the console launch a local
//!   handler (`file:`, a custom scheme).
//! * Self-service RPCs act on the CALLER (the token's principal); no request
//!   field names a principal. `ListAccounts` / `RevokeAccount` are Operator-only,
//!   enforced by the kernel's interceptor — the console only hides controls.
//! * Mutations carry a core-generated `command_id` (kernel dedupe) and a reason.

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, new_command_id, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::accounts::accounts_admin_client::AccountsAdminClient;

type AccountsClient = AccountsAdminClient<InterceptedService<Channel, AuthInterceptor>>;

/// One principal's account for one server. No secret material exists on it.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Account {
    pub server_id: String,
    pub principal_id: String,
    pub provider: String,
    /// The provider account (email, login or id).
    pub account: String,
    pub scopes: Vec<String>,
    /// "connected" | "reconnect_needed" (+ later phases' states, passed through).
    pub status: String,
    pub status_detail: String,
    pub connected_at_unix_ms: i64,
    pub last_used_unix_ms: i64,
    pub last_refreshed_unix_ms: i64,
    pub expires_at_unix_ms: i64,
    /// Deterministic `<provider>:<principal>:<server>` (phase 2).
    pub account_id: String,
    /// The provider's stable subject id, when it reported one.
    pub account_subject: String,
    /// Scopes the server declares that this account was not granted
    /// ("needs more permission"; grant scope enforcement).
    #[serde(default)]
    pub missing_scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct PersonalServer {
    pub server_id: String,
    pub display_name: String,
    pub provider: String,
    /// "per_user" | "either"
    pub credential_scope: String,
    pub scopes: Vec<String>,
    pub provider_configured: bool,
    /// What the caller's connected account for this server lacks.
    #[serde(default)]
    pub missing_scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountList {
    pub accounts: Vec<Account>,
    pub personal_servers: Vec<PersonalServer>,
    /// What an operator registers with each provider.
    pub redirect_uri: String,
}

/// What the webview learns about a started sign-in. Deliberately WITHOUT the
/// start URL (module docs).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountConnectStart {
    pub flow_id: String,
    pub expires_at_unix_ms: i64,
    pub provider: String,
    pub scopes: Vec<String>,
    /// Whether the system browser was launched.
    pub opened: bool,
    /// Why it was not (no URL from the kernel, refused scheme, launcher error).
    pub open_error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountConnectFlow {
    /// "pending" | "started" | "completed" | "failed" | "expired"
    pub status: String,
    pub detail: String,
    pub server_id: String,
    pub account: String,
    pub expires_at_unix_ms: i64,
    /// "" (personal sign-in) | "org" (organisation install).
    #[serde(default)]
    pub mode: String,
    /// An org install's account (widened, or produced once completed).
    #[serde(default)]
    pub account_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountMutation {
    pub command_id: String,
    pub deduped: bool,
    pub removed: bool,
}

/// Binds one consumer to an org account for one purpose.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AccountGrant {
    /// "mcp" | "ingress"
    pub purpose: String,
    pub consumer_id: String,
    /// "token" | "env:<NAME>" | an ingress credential binding name.
    pub slot: String,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub granted_at_unix_ms: i64,
    /// Read-only verdict: what the account's granted scopes do not cover.
    #[serde(default)]
    pub missing_scopes: Vec<String>,
    /// "ok" | "needs_consent" | "unverified" | "account_revoked" | "reconnect_needed"
    #[serde(default)]
    pub scope_check: String,
}

/// An organisation-owned account. Metadata only: `secret_last_four` is all any
/// read says about the secret.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct OrgAccount {
    pub id: String,
    pub provider: String,
    pub external_account: String,
    pub display_name: String,
    /// "connected" | "revoked"
    pub status: String,
    pub status_detail: String,
    pub created_at_unix_ms: i64,
    pub updated_at_unix_ms: i64,
    pub rotated_at_unix_ms: i64,
    pub last_used_unix_ms: i64,
    pub secret_last_four: String,
    pub grants: Vec<AccountGrant>,
    /// "operator" | "migrated:<legacy secret name>"
    pub origin: String,
    /// Scopes the account was GRANTED.
    #[serde(default)]
    pub scopes: Vec<String>,
    /// "" (pasted) | "oauth_install" | "client_credentials"
    #[serde(default)]
    pub auth_kind: String,
    #[serde(default)]
    pub expires_at_unix_ms: i64,
    /// False for a pasted key with no recorded scopes (consumers unverified).
    #[serde(default)]
    pub scopes_known: bool,
}

/// One consumer bound to an account (ListAccountConsumers / ListSystems).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AccountConsumer {
    /// "mcp" | "ingress"
    pub kind: String,
    pub consumer_id: String,
    pub display_name: String,
    pub slot: String,
    pub account_id: String,
    pub principal_id: String,
    pub required_scopes: Vec<String>,
    pub missing_scopes: Vec<String>,
    /// "ok" | "needs_consent" | "unverified" | "account_revoked" |
    /// "reconnect_needed" | "pending_confirmation" | "not_connected"
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SystemAccountSummary {
    pub org_accounts: i32,
    pub org_connected: i32,
    pub org_attention: i32,
    pub personal_connected: i32,
    pub personal_attention: i32,
    pub consumers: i32,
    pub consumers_needing_consent: i32,
}

/// One external system from the kernel's premium catalog (ADR-0141 D5).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct System {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub icon: String,
    pub docs_url: String,
    pub org_mode: String,
    pub personal_mode: String,
    pub account_providers: Vec<String>,
    pub mcp_catalog_ids: Vec<String>,
    pub ingress_templates: Vec<String>,
    pub server_ids: Vec<String>,
    pub org_account_ids: Vec<String>,
    pub consumers: Vec<AccountConsumer>,
    pub summary: SystemAccountSummary,
    pub health: String,
    pub org_install_available: bool,
    pub org_install_unavailable_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemList {
    pub systems: Vec<System>,
    pub operator_view: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountConsumers {
    pub account_id: String,
    pub consumers: Vec<AccountConsumer>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrgAccountMutation {
    pub command_id: String,
    pub deduped: bool,
    pub account: Option<OrgAccount>,
}

/// One OAuth provider's client registration. Status only, never the secret.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ProviderClient {
    pub provider: String,
    pub display_name: String,
    pub client_id_configured: bool,
    pub client_id_last_four: String,
    pub client_secret_configured: bool,
    pub updated_at_unix_ms: i64,
    pub public_client: bool,
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderClients {
    pub providers: Vec<ProviderClient>,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderClientMutation {
    pub command_id: String,
    pub deduped: bool,
    pub provider: Option<ProviderClient>,
}

/// Whether `url` may be handed to the OS launcher: an absolute http(s) URL.
pub(crate) fn openable_url(url: &str) -> Result<(), String> {
    let lower = url.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return Err("the kernel returned no sign-in URL".into());
    }
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("the kernel's sign-in URL is not http(s); refusing to open it".into());
    }
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("the kernel's sign-in URL is malformed; refusing to open it".into());
    }
    Ok(())
}

fn account(a: pb::accounts::Account) -> Account {
    Account {
        server_id: a.server_id,
        principal_id: a.principal_id,
        provider: a.provider,
        account: a.account,
        scopes: a.scopes,
        status: a.status,
        status_detail: a.status_detail,
        connected_at_unix_ms: a.connected_at_unix_ms,
        last_used_unix_ms: a.last_used_unix_ms,
        last_refreshed_unix_ms: a.last_refreshed_unix_ms,
        expires_at_unix_ms: a.expires_at_unix_ms,
        account_id: a.account_id,
        account_subject: a.account_subject,
        missing_scopes: a.missing_scopes,
    }
}

fn list(r: pb::accounts::ListAccountsResponse) -> AccountList {
    AccountList {
        accounts: r.accounts.into_iter().map(account).collect(),
        personal_servers: r
            .personal_servers
            .into_iter()
            .map(|p| PersonalServer {
                server_id: p.server_id,
                display_name: p.display_name,
                provider: p.provider,
                credential_scope: p.credential_scope,
                scopes: p.scopes,
                provider_configured: p.provider_configured,
                missing_scopes: p.missing_scopes,
            })
            .collect(),
        redirect_uri: r.redirect_uri,
    }
}

fn mutation(r: pb::accounts::AccountMutationResponse) -> AccountMutation {
    AccountMutation { command_id: r.command_id, deduped: r.deduped, removed: r.removed }
}

fn grant_out(g: pb::accounts::AccountGrant) -> AccountGrant {
    AccountGrant {
        purpose: g.purpose,
        consumer_id: g.consumer_id,
        slot: g.slot,
        scopes: g.scopes,
        granted_at_unix_ms: g.granted_at_unix_ms,
        missing_scopes: g.missing_scopes,
        scope_check: g.scope_check,
    }
}

fn grant_in(g: AccountGrant) -> pb::accounts::AccountGrant {
    pb::accounts::AccountGrant {
        purpose: g.purpose,
        consumer_id: g.consumer_id,
        slot: g.slot,
        scopes: g.scopes,
        // Stamped by the kernel.
        granted_at_unix_ms: 0,
        // Computed by the kernel on read; never sent.
        missing_scopes: vec![],
        scope_check: String::new(),
    }
}

fn org_account(a: pb::accounts::OrgAccount) -> OrgAccount {
    OrgAccount {
        id: a.id,
        provider: a.provider,
        external_account: a.external_account,
        display_name: a.display_name,
        status: a.status,
        status_detail: a.status_detail,
        created_at_unix_ms: a.created_at_unix_ms,
        updated_at_unix_ms: a.updated_at_unix_ms,
        rotated_at_unix_ms: a.rotated_at_unix_ms,
        last_used_unix_ms: a.last_used_unix_ms,
        secret_last_four: a.secret_last_four,
        grants: a.grants.into_iter().map(grant_out).collect(),
        origin: a.origin,
        scopes: a.scopes,
        auth_kind: a.auth_kind,
        expires_at_unix_ms: a.expires_at_unix_ms,
        scopes_known: a.scopes_known,
    }
}

fn consumer(c: pb::accounts::AccountConsumer) -> AccountConsumer {
    AccountConsumer {
        kind: c.kind,
        consumer_id: c.consumer_id,
        display_name: c.display_name,
        slot: c.slot,
        account_id: c.account_id,
        principal_id: c.principal_id,
        required_scopes: c.required_scopes,
        missing_scopes: c.missing_scopes,
        state: c.state,
        detail: c.detail,
    }
}

fn system(s: pb::accounts::System) -> System {
    let sum = s.summary.unwrap_or_default();
    System {
        id: s.id,
        name: s.name,
        provider: s.provider,
        icon: s.icon,
        docs_url: s.docs_url,
        org_mode: s.org_mode,
        personal_mode: s.personal_mode,
        account_providers: s.account_providers,
        mcp_catalog_ids: s.mcp_catalog_ids,
        ingress_templates: s.ingress_templates,
        server_ids: s.server_ids,
        org_account_ids: s.org_account_ids,
        consumers: s.consumers.into_iter().map(consumer).collect(),
        summary: SystemAccountSummary {
            org_accounts: sum.org_accounts,
            org_connected: sum.org_connected,
            org_attention: sum.org_attention,
            personal_connected: sum.personal_connected,
            personal_attention: sum.personal_attention,
            consumers: sum.consumers,
            consumers_needing_consent: sum.consumers_needing_consent,
        },
        health: s.health,
        org_install_available: s.org_install_available,
        org_install_unavailable_reason: s.org_install_unavailable_reason,
    }
}

fn org_mutation(r: pb::accounts::OrgAccountMutationResponse) -> OrgAccountMutation {
    OrgAccountMutation { command_id: r.command_id, deduped: r.deduped, account: r.account.map(org_account) }
}

fn provider_client(p: pb::accounts::ProviderClient) -> ProviderClient {
    ProviderClient {
        provider: p.provider,
        display_name: p.display_name,
        client_id_configured: p.client_id_configured,
        client_id_last_four: p.client_id_last_four,
        client_secret_configured: p.client_secret_configured,
        updated_at_unix_ms: p.updated_at_unix_ms,
        public_client: p.public_client,
        configured: p.configured,
    }
}

fn provider_mutation(r: pb::accounts::ProviderClientMutationResponse) -> ProviderClientMutation {
    ProviderClientMutation { command_id: r.command_id, deduped: r.deduped, provider: r.provider.map(provider_client) }
}

impl Transport {
    async fn accounts_client(&self) -> Result<AccountsClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(AccountsAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    /// StartAccountConnect, returning the start URL to the CALLER IN RUST so it
    /// can be opened without crossing into the webview.
    pub async fn start_account_connect(
        &self,
        server_id: String,
    ) -> Result<(AccountConnectStart, String), String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .start_account_connect(Request::new(pb::accounts::StartAccountConnectRequest { server_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok((
            AccountConnectStart {
                flow_id: r.flow_id,
                expires_at_unix_ms: r.expires_at_unix_ms,
                provider: r.provider,
                scopes: r.scopes,
                opened: false,
                open_error: String::new(),
            },
            r.start_url,
        ))
    }

    pub async fn get_account_connect_flow(&self, flow_id: String) -> Result<AccountConnectFlow, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .get_account_connect_flow(Request::new(pb::accounts::GetAccountConnectFlowRequest { flow_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(AccountConnectFlow {
            status: r.status,
            detail: r.detail,
            server_id: r.server_id,
            account: r.account,
            expires_at_unix_ms: r.expires_at_unix_ms,
            mode: r.mode,
            account_id: r.account_id,
        })
    }

    /// StartOrgAccountInstall (Operator): like `start_account_connect`, the
    /// start URL stays in Rust and is opened in the system browser.
    pub async fn start_org_account_install(
        &self,
        provider: String,
        account_id: String,
        consumers: Vec<AccountGrant>,
        reason: String,
    ) -> Result<(AccountConnectStart, String), String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .start_org_account_install(Request::new(pb::accounts::StartOrgAccountInstallRequest {
                provider,
                account_id,
                consumers: consumers.into_iter().map(grant_in).collect(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok((
            AccountConnectStart {
                flow_id: r.flow_id,
                expires_at_unix_ms: r.expires_at_unix_ms,
                provider: r.provider,
                scopes: r.scopes,
                opened: false,
                open_error: String::new(),
            },
            r.start_url,
        ))
    }

    /// ListSystems (any role; the kernel filters a non-Operator's view).
    pub async fn list_systems(&self) -> Result<SystemList, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_systems(Request::new(pb::accounts::ListSystemsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SystemList { systems: r.systems.into_iter().map(system).collect(), operator_view: r.operator_view })
    }

    /// ListAccountConsumers (Operator): what breaks if the account is revoked.
    pub async fn list_account_consumers(&self, account_id: String) -> Result<AccountConsumers, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_account_consumers(Request::new(pb::accounts::ListAccountConsumersRequest { account_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(AccountConsumers { account_id: r.account_id, consumers: r.consumers.into_iter().map(consumer).collect() })
    }

    pub async fn list_my_accounts(&self) -> Result<AccountList, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_my_accounts(Request::new(pb::accounts::ListMyAccountsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(list(r))
    }

    pub async fn disconnect_my_account(&self, server_id: String, reason: String) -> Result<AccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .disconnect_my_account(Request::new(pb::accounts::DisconnectMyAccountRequest {
                command_id: new_command_id(),
                reason,
                server_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn list_accounts(&self, server_id: String, principal_id: String) -> Result<AccountList, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_accounts(Request::new(pb::accounts::ListAccountsRequest { server_id, principal_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(list(r))
    }

    pub async fn revoke_account(
        &self,
        server_id: String,
        principal_id: String,
        reason: String,
    ) -> Result<AccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .revoke_account(Request::new(pb::accounts::RevokeAccountRequest {
                command_id: new_command_id(),
                reason,
                server_id,
                principal_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    // -- Phase 2 --------------------------------------------------------------

    /// ConfirmMyAccount: `account` is the identity the person was SHOWN; the
    /// kernel refuses when it differs from the stored one.
    pub async fn confirm_my_account(&self, server_id: String, account: String) -> Result<AccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .confirm_my_account(Request::new(pb::accounts::ConfirmMyAccountRequest {
                command_id: new_command_id(),
                server_id,
                account,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn list_org_accounts(&self, provider: String, consumer_id: String) -> Result<Vec<OrgAccount>, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_org_accounts(Request::new(pb::accounts::ListOrgAccountsRequest { provider, consumer_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(r.accounts.into_iter().map(org_account).collect())
    }

    /// The secret is forwarded once and never retained or logged here.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_org_account(
        &self,
        provider: String,
        external_account: String,
        display_name: String,
        secret: String,
        grants: Vec<AccountGrant>,
        scopes: Vec<String>,
        reason: String,
    ) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .create_org_account(Request::new(pb::accounts::CreateOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                provider,
                external_account,
                display_name,
                secret,
                grants: grants.into_iter().map(grant_in).collect(),
                scopes,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    pub async fn update_org_account(
        &self,
        account_id: String,
        display_name: String,
        reason: String,
    ) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .update_org_account(Request::new(pb::accounts::UpdateOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                account_id,
                display_name,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    /// Replaces the secret (also re-activates a revoked account).
    pub async fn rotate_org_account(
        &self,
        account_id: String,
        secret: String,
        reason: String,
    ) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .rotate_org_account(Request::new(pb::accounts::RotateOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                account_id,
                secret,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    pub async fn revoke_org_account(&self, account_id: String, reason: String) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .revoke_org_account(Request::new(pb::accounts::RevokeOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                account_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    pub async fn bind_org_account(
        &self,
        account_id: String,
        grant: AccountGrant,
        reason: String,
    ) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .bind_org_account(Request::new(pb::accounts::BindOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                account_id,
                grant: Some(grant_in(grant)),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    pub async fn unbind_org_account(
        &self,
        account_id: String,
        purpose: String,
        consumer_id: String,
        slot: String,
        reason: String,
    ) -> Result<OrgAccountMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .unbind_org_account(Request::new(pb::accounts::UnbindOrgAccountRequest {
                command_id: new_command_id(),
                reason,
                account_id,
                purpose,
                consumer_id,
                slot,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(org_mutation(r))
    }

    pub async fn list_provider_clients(&self) -> Result<ProviderClients, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .list_provider_clients(Request::new(pb::accounts::ListProviderClientsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ProviderClients {
            providers: r.providers.into_iter().map(provider_client).collect(),
            redirect_uri: r.redirect_uri,
        })
    }

    /// `client_secret` "" keeps the stored one. Forwarded once, never retained.
    pub async fn set_provider_client(
        &self,
        provider: String,
        client_id: String,
        client_secret: String,
        reason: String,
    ) -> Result<ProviderClientMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .set_provider_client(Request::new(pb::accounts::SetProviderClientRequest {
                command_id: new_command_id(),
                reason,
                provider,
                client_id,
                client_secret,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(provider_mutation(r))
    }

    pub async fn clear_provider_client(
        &self,
        provider: String,
        reason: String,
    ) -> Result<ProviderClientMutation, String> {
        let mut client = self.accounts_client().await?;
        let r = client
            .clear_provider_client(Request::new(pb::accounts::ClearProviderClientRequest {
                command_id: new_command_id(),
                reason,
                provider,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(provider_mutation(r))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_urls_are_opened() {
        assert!(openable_url("https://kernel.example/oauth/start?flow=abc").is_ok());
        assert!(openable_url("http://127.0.0.1:8767/oauth/start?flow=abc").is_ok());
        assert!(openable_url("").is_err());
        assert!(openable_url("file:///etc/passwd").is_err());
        assert!(openable_url("javascript:alert(1)").is_err());
        assert!(openable_url("ms-settings:privacy").is_err());
        assert!(openable_url("https://kernel.example/a b").is_err());
        assert!(openable_url("https://kernel.example/\nx").is_err());
    }

    #[test]
    fn list_maps_every_field_and_no_secret() {
        let r = pb::accounts::ListAccountsResponse {
            accounts: vec![pb::accounts::Account {
                server_id: "gmail".into(),
                principal_id: "alice".into(),
                provider: "google".into(),
                account: "alice@example.com".into(),
                scopes: vec!["gmail.readonly".into()],
                status: "reconnect_needed".into(),
                status_detail: "invalid_grant".into(),
                connected_at_unix_ms: 1,
                last_used_unix_ms: 2,
                last_refreshed_unix_ms: 3,
                expires_at_unix_ms: 4,
                account_id: "google:alice:gmail".into(),
                account_subject: "1234".into(),
                missing_scopes: vec!["gmail.send".into()],
            }],
            personal_servers: vec![pb::accounts::PersonalServer {
                server_id: "gmail".into(),
                display_name: "Gmail".into(),
                provider: "google".into(),
                credential_scope: "per_user".into(),
                scopes: vec![],
                provider_configured: true,
                missing_scopes: vec![],
            }],
            redirect_uri: "https://k/oauth/callback".into(),
        };
        let l = list(r);
        assert_eq!(l.accounts[0].status, "reconnect_needed");
        assert_eq!(l.accounts[0].expires_at_unix_ms, 4);
        assert!(l.personal_servers[0].provider_configured);
        assert_eq!(l.accounts[0].missing_scopes, vec!["gmail.send".to_string()]);
        let json = serde_json::to_string(&l).unwrap();
        assert!(!json.contains("token"), "no token-shaped field may be serialized: {json}");
    }

    #[test]
    fn org_account_carries_last_four_and_grants_only() {
        let a = org_account(pb::accounts::OrgAccount {
            id: "static_token:org:acme-bot".into(),
            provider: "static_token".into(),
            secret_last_four: "9f1c".into(),
            status: "revoked".into(),
            grants: vec![pb::accounts::AccountGrant {
                purpose: "ingress".into(),
                consumer_id: "github-prs".into(),
                slot: "api_key".into(),
                scopes: vec![],
                granted_at_unix_ms: 5,
                missing_scopes: vec!["files:read".into()],
                scope_check: "needs_consent".into(),
            }],
            ..Default::default()
        });
        assert_eq!(a.grants[0].slot, "api_key");
        assert_eq!(a.grants[0].scope_check, "needs_consent");
        assert_eq!(a.status, "revoked");
        let json = serde_json::to_string(&a).unwrap();
        assert!(!json.contains("\"secret\""), "{json}");
        // The grant a console sends never forges the kernel's timestamp.
        let sent = grant_in(AccountGrant { granted_at_unix_ms: 99, ..a.grants[0].clone() });
        assert_eq!(sent.granted_at_unix_ms, 0);
        // Nor its read-only scope verdict.
        assert!(sent.missing_scopes.is_empty() && sent.scope_check.is_empty());
    }

    #[test]
    fn system_maps_membership_and_summary() {
        let s = system(pb::accounts::System {
            id: "slack".into(),
            name: "Slack".into(),
            server_ids: vec!["slack".into()],
            org_account_ids: vec!["slack:org:t1".into()],
            consumers: vec![pb::accounts::AccountConsumer {
                kind: "ingress".into(),
                consumer_id: "dms".into(),
                state: "needs_consent".into(),
                missing_scopes: vec!["files:read".into()],
                ..Default::default()
            }],
            summary: Some(pb::accounts::SystemAccountSummary { consumers_needing_consent: 1, ..Default::default() }),
            health: "attention".into(),
            org_install_available: true,
            ..Default::default()
        });
        assert_eq!(s.summary.consumers_needing_consent, 1);
        assert_eq!(s.consumers[0].missing_scopes, vec!["files:read".to_string()]);
        assert!(s.org_install_available);
    }
}
