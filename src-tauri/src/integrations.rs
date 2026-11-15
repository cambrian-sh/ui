//! Integrations (capability `integrations`): the product surface over the MCP
//! server substrate — a curated catalog, install / enable / configure, write-only
//! secrets, live health, test connection. OperatorConsole RPCs, same channel and
//! token as everything else (T-20261106-integrations-manage-mcp-servers-from-the).
//!
//! Load-bearing:
//! * Secrets are WRITE-ONLY. Nothing here ever carries a secret value back to
//!   the webview; `IntegrationSecretState` says set / source / updated_at only.
//!   Values go out on `install_integration` and `set_integration_secret` and are
//!   never logged.
//! * A mutation's `outcome.effect` ("live" | "restart_required" | "shadowed" |
//!   "rejected") is passed through verbatim — it is the half an operator acts on.
//! * Health is ALSO folded from `OperatorEvent.integration_health` into the
//!   state of record (`StateOfRecord.integration_health`), so the page updates
//!   without re-reading.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tonic::Request;

use crate::pb;
use crate::state::ConfigWriteOutcome;
use crate::transport::{map_status, new_command_id, Transport};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationField {
    pub name: String,
    pub label: String,
    pub secret: bool,
    pub required: bool,
    pub help: String,
    pub kind: String,
    pub default_value: String,
    pub placeholder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationToolPolicy {
    pub name: String,
    pub dangerous: bool,
    pub effects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub publisher: String,
    pub license: String,
    pub trust_tier: String,
    pub docs_url: String,
    pub version: String,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub url: String,
    pub runtimes: Vec<String>,
    pub platforms: Vec<String>,
    pub platform_supported: bool,
    pub fields: Vec<IntegrationField>,
    pub tool_policies: Vec<IntegrationToolPolicy>,
    pub has_default_policy: bool,
    pub default_policy: Option<IntegrationToolPolicy>,
    pub policy_summary: String,
    pub probe_tool: String,
    pub notes: String,
    pub source: String,
    pub multi_instance: bool,
    /// ADR-0140: "shared" | "per_user" | "either", and the account each person
    /// connects (empty for shared) — known before install.
    pub credential_scope: String,
    pub provider: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationCatalog {
    pub entries: Vec<IntegrationCatalogEntry>,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationSecretState {
    pub name: String,
    pub label: String,
    pub set: bool,
    pub source: String,
    pub updated_at_unix_ms: i64,
    pub required: bool,
    pub kind: String,
}

/// One server's live state. Also the feed payload.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationHealth {
    pub server_id: String,
    /// stopped | starting | ready | error
    pub state: String,
    pub last_handshake_unix_ms: i64,
    pub tool_count: i32,
    pub last_error: String,
    pub restart_count: i32,
    pub changed_at_unix_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Integration {
    pub id: String,
    pub catalog_id: String,
    pub name: String,
    pub category: String,
    pub source: String,
    pub overrides_file: bool,
    pub editable: bool,
    pub enabled: bool,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub url: String,
    pub settings: HashMap<String, String>,
    pub secrets: Vec<IntegrationSecretState>,
    pub health: Option<IntegrationHealth>,
    pub installed_version: String,
    pub update_available: bool,
    pub missing_required: Vec<String>,
    pub tool_policies: Vec<IntegrationToolPolicy>,
    pub has_default_policy: bool,
    pub default_policy: Option<IntegrationToolPolicy>,
    pub policy_summary: String,
    pub classification_tags: Vec<String>,
    pub trust_tier: String,
    pub passthrough_env: Vec<String>,
    /// ADR-0139 D8: a stdio server's effective containment; None for http/sse
    /// (T-20261106-integrationop-has-no-structured-containment).
    pub containment: Option<IntegrationContainment>,
}

/// `IntegrationContainmentOp`: one stdio server's effective process containment.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationContainment {
    pub tier: String,
    pub tier_source: String,
    pub runner: String,
    pub mechanisms: Vec<String>,
    pub enforced: Vec<String>,
    pub missing: Vec<String>,
    pub notes: Vec<String>,
    pub refused: bool,
    pub disabled: bool,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Integrations {
    pub integrations: Vec<Integration>,
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationMutation {
    pub deduped: bool,
    pub outcome: Option<ConfigWriteOutcome>,
    pub integration: Option<Integration>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationTool {
    pub name: String,
    pub description: String,
    pub dangerous: bool,
    pub effects: Vec<String>,
    pub policy_source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationTestResult {
    pub ok: bool,
    pub latency_ms: i64,
    pub error: String,
    pub used_live_session: bool,
    pub tools: Vec<IntegrationTool>,
    pub probe_tool: String,
    pub probe_ok: bool,
    pub probe_output: String,
    pub probe_skipped_reason: String,
}

/// A custom (non-catalog) server, as the install form sends it.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationCustomSpec {
    pub name: String,
    pub category: String,
    pub transport: String,
    pub endpoint: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub auth_type: String,
    #[serde(default)]
    pub auth_header: String,
    #[serde(default)]
    pub secret_names: Vec<String>,
    #[serde(default)]
    pub passthrough_env: Vec<String>,
}

fn policy(p: pb::IntegrationToolPolicyOp) -> IntegrationToolPolicy {
    IntegrationToolPolicy { name: p.name, dangerous: p.dangerous, effects: p.effects }
}

pub(crate) fn health(h: pb::IntegrationHealthOp) -> IntegrationHealth {
    IntegrationHealth {
        server_id: h.server_id,
        state: h.state,
        last_handshake_unix_ms: h.last_handshake_unix_ms,
        tool_count: h.tool_count,
        last_error: h.last_error,
        restart_count: h.restart_count,
        changed_at_unix_ms: h.changed_at_unix_ms,
    }
}

fn integration(i: pb::IntegrationOp) -> Integration {
    Integration {
        id: i.id,
        catalog_id: i.catalog_id,
        name: i.name,
        category: i.category,
        source: i.source,
        overrides_file: i.overrides_file,
        editable: i.editable,
        enabled: i.enabled,
        transport: i.transport,
        command: i.command,
        args: i.args,
        url: i.url,
        settings: i.settings,
        secrets: i
            .secrets
            .into_iter()
            .map(|s| IntegrationSecretState {
                name: s.name,
                label: s.label,
                set: s.set,
                source: s.source,
                updated_at_unix_ms: s.updated_at_unix_ms,
                required: s.required,
                kind: s.kind,
            })
            .collect(),
        health: i.health.map(health),
        installed_version: i.installed_version,
        update_available: i.update_available,
        missing_required: i.missing_required,
        tool_policies: i.tool_policies.into_iter().map(policy).collect(),
        has_default_policy: i.has_default_policy,
        default_policy: i.default_policy.map(policy),
        policy_summary: i.policy_summary,
        classification_tags: i.classification_tags,
        trust_tier: i.trust_tier,
        passthrough_env: i.passthrough_env,
        containment: i.containment.map(|c| IntegrationContainment {
            tier: c.tier,
            tier_source: c.tier_source,
            runner: c.runner,
            mechanisms: c.mechanisms,
            enforced: c.enforced,
            missing: c.missing,
            notes: c.notes,
            refused: c.refused,
            disabled: c.disabled,
            summary: c.summary,
        }),
    }
}

fn catalog_entry(e: pb::IntegrationCatalogEntryOp) -> IntegrationCatalogEntry {
    IntegrationCatalogEntry {
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        publisher: e.publisher,
        license: e.license,
        trust_tier: e.trust_tier,
        docs_url: e.docs_url,
        version: e.version,
        transport: e.transport,
        command: e.command,
        args: e.args,
        url: e.url,
        runtimes: e.runtimes,
        platforms: e.platforms,
        platform_supported: e.platform_supported,
        fields: e
            .fields
            .into_iter()
            .map(|f| IntegrationField {
                name: f.name,
                label: f.label,
                secret: f.secret,
                required: f.required,
                help: f.help,
                kind: f.kind,
                default_value: f.default_value,
                placeholder: f.placeholder,
            })
            .collect(),
        tool_policies: e.tool_policies.into_iter().map(policy).collect(),
        has_default_policy: e.has_default_policy,
        default_policy: e.default_policy.map(policy),
        policy_summary: e.policy_summary,
        probe_tool: e.probe_tool,
        notes: e.notes,
        source: e.source,
        multi_instance: e.multi_instance,
        credential_scope: e.credential_scope,
        provider: e.provider,
        scopes: e.scopes,
    }
}

fn mutation(r: pb::IntegrationMutationOpResponse) -> IntegrationMutation {
    IntegrationMutation {
        deduped: r.deduped,
        outcome: r.outcome.map(|o| ConfigWriteOutcome {
            key: o.key,
            stored: o.stored,
            effect: o.effect,
            shadowed_by: o.shadowed_by,
            error: o.error,
            written_to: o.written_to,
            overrides_file: o.overrides_file,
            overrides_value: o.overrides_value,
        }),
        integration: r.integration.map(integration),
    }
}

fn custom_spec(c: IntegrationCustomSpec) -> pb::IntegrationCustomSpecOp {
    pb::IntegrationCustomSpecOp {
        name: c.name,
        category: c.category,
        transport: c.transport,
        endpoint: c.endpoint,
        args: c.args,
        auth_type: c.auth_type,
        auth_header: c.auth_header,
        secret_names: c.secret_names,
        passthrough_env: c.passthrough_env,
        // Unlisted tools FAIL CLOSED (dangerous read+write+egress) until an
        // operator declares a policy — the safe default for a custom server.
        ..Default::default()
    }
}

impl Transport {
    pub async fn list_integration_catalog(&self) -> Result<IntegrationCatalog, String> {
        let mut client = self.client().await?;
        let r = client
            .list_integration_catalog(Request::new(pb::ListIntegrationCatalogOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(IntegrationCatalog {
            entries: r.entries.into_iter().map(catalog_entry).collect(),
            categories: r.categories,
        })
    }

    pub async fn list_integrations(&self) -> Result<Integrations, String> {
        let mut client = self.client().await?;
        let r = client
            .list_integrations(Request::new(pb::ListIntegrationsOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(Integrations {
            integrations: r.integrations.into_iter().map(integration).collect(),
            configured: r.configured,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn install_integration(
        &self,
        catalog_id: String,
        id: String,
        settings: HashMap<String, String>,
        secrets: HashMap<String, String>,
        enabled: bool,
        custom: Option<IntegrationCustomSpec>,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .install_integration(Request::new(pb::InstallIntegrationOpRequest {
                command_id: new_command_id(),
                reason,
                catalog_id,
                id,
                settings,
                secrets,
                enabled,
                custom: custom.map(custom_spec),
                classification_tags: vec![],
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn update_integration(
        &self,
        id: String,
        settings: HashMap<String, String>,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .update_integration(Request::new(pb::UpdateIntegrationOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                settings,
                ..Default::default()
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn set_integration_secret(
        &self,
        id: String,
        name: String,
        value: String,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .set_integration_secret(Request::new(pb::SetIntegrationSecretOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                name,
                value,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn clear_integration_secret(
        &self,
        id: String,
        name: String,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .clear_integration_secret(Request::new(pb::ClearIntegrationSecretOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                name,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn set_integration_enabled(
        &self,
        id: String,
        enabled: bool,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .set_integration_enabled(Request::new(pb::SetIntegrationEnabledOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                enabled,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    pub async fn test_integration(&self, id: String, call_probe: bool) -> Result<IntegrationTestResult, String> {
        let mut client = self.client().await?;
        let r = client
            .test_integration(Request::new(pb::TestIntegrationOpRequest { id, call_probe }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(IntegrationTestResult {
            ok: r.ok,
            latency_ms: r.latency_ms,
            error: r.error,
            used_live_session: r.used_live_session,
            tools: r
                .tools
                .into_iter()
                .map(|t| IntegrationTool {
                    name: t.name,
                    description: t.description,
                    dangerous: t.dangerous,
                    effects: t.effects,
                    policy_source: t.policy_source,
                })
                .collect(),
            probe_tool: r.probe_tool,
            probe_ok: r.probe_ok,
            probe_output: r.probe_output,
            probe_skipped_reason: r.probe_skipped_reason,
        })
    }

    pub async fn remove_integration(
        &self,
        id: String,
        keep_secrets: bool,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .remove_integration(Request::new(pb::RemoveIntegrationOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                keep_secrets,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    /// SetIntegrationTrustTier: set (or, with "", clear) a server's ADR-0139 D8
    /// sandbox tier. Owner decision 2026-11-15: any tier, audited by the
    /// kernel with who, old tier, new tier and the reason.
    pub async fn set_integration_trust_tier(
        &self,
        id: String,
        trust_tier: String,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .set_integration_trust_tier(Request::new(pb::SetIntegrationTrustTierOpRequest {
                command_id: new_command_id(),
                reason,
                id,
                trust_tier,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }

    /// RevertIntegrationToFile: drop the console override of an mcp.json
    /// server so the file entry applies again (restarted live by the kernel).
    pub async fn revert_integration_to_file(
        &self,
        id: String,
        reason: String,
    ) -> Result<IntegrationMutation, String> {
        let mut client = self.client().await?;
        let r = client
            .revert_integration_to_file(Request::new(pb::RevertIntegrationToFileOpRequest {
                command_id: new_command_id(),
                reason,
                id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(mutation(r))
    }
}
