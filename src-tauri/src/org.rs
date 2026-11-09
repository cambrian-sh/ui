//! The premium organisation-hierarchy plane (ADR-0142 stage 2, D5/D6/D11):
//! `cambrian.premium.org.OrgDirectoryAdmin`, mounted on the kernel server behind
//! the operator interceptors and spoken over the SAME channel and bearer as the
//! console (ADR-0088). The webview renders it only when the handshake carries
//! `org-directory` (pb::ORG_DIRECTORY_CAPABILITY).
//!
//! The generated messages derive serde (build.rs), so they cross the Tauri
//! bridge unchanged. Every mutation gets a command_id here (never from the
//! webview) and a mandatory reason.
//!
//! A SCIM bearer arrives only in `CreateScimConnection` / `RotateScimToken`
//! answers. It is handed to the webview ONCE, for the show-once dialog; the
//! Rust core keeps no copy and never logs it.

use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb::org as o;
use crate::transport::{map_status, new_command_id, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};
use o::org_directory_admin_client::OrgDirectoryAdminClient;

type OrgClient = OrgDirectoryAdminClient<InterceptedService<Channel, AuthInterceptor>>;

fn need_reason(reason: &str) -> Result<(), String> {
    if reason.trim().is_empty() {
        return Err("a reason is required".into());
    }
    Ok(())
}

impl Transport {
    async fn org_client(&self) -> Result<OrgClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(OrgDirectoryAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    // ---- reads (Operator and Viewer; GetMyOrgChain any role) ------------------

    pub async fn list_org_units(&self) -> Result<Vec<o::OrgUnit>, String> {
        let mut c = self.org_client().await?;
        Ok(c.list_org_units(Request::new(o::ListOrgUnitsRequest {})).await.map_err(map_status)?.into_inner().units)
    }

    pub async fn list_org_people(&self, unit_id: String, query: String, include_inactive: bool) -> Result<Vec<o::OrgPerson>, String> {
        let mut c = self.org_client().await?;
        Ok(c.list_org_people(Request::new(o::ListOrgPeopleRequest { unit_id, query, include_inactive }))
            .await
            .map_err(map_status)?
            .into_inner()
            .people)
    }

    pub async fn list_directory_groups(&self) -> Result<Vec<o::DirectoryGroup>, String> {
        let mut c = self.org_client().await?;
        Ok(c.list_directory_groups(Request::new(o::ListDirectoryGroupsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner()
            .groups)
    }

    /// `principal_id` empty = the caller's own chain (GetMyOrgChain, any role).
    pub async fn get_org_chain(&self, principal_id: String) -> Result<o::OrgChain, String> {
        let mut c = self.org_client().await?;
        let r = if principal_id.is_empty() {
            c.get_my_org_chain(Request::new(o::GetMyOrgChainRequest {})).await
        } else {
            c.get_org_chain(Request::new(o::GetOrgChainRequest { principal_id })).await
        };
        Ok(r.map_err(map_status)?.into_inner())
    }

    pub async fn list_mapping_rules(&self) -> Result<Vec<o::MappingRule>, String> {
        let mut c = self.org_client().await?;
        Ok(c.list_mapping_rules(Request::new(o::ListMappingRulesRequest {})).await.map_err(map_status)?.into_inner().rules)
    }

    /// The dry run: what would change if `upsert` were saved / `delete_id` deleted.
    pub async fn preview_mapping_rules(&self, upsert: Option<o::MappingRule>, delete_id: String) -> Result<o::MappingReport, String> {
        let mut c = self.org_client().await?;
        Ok(c.preview_mapping_rules(Request::new(o::PreviewMappingRulesRequest { upsert, delete_id }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn get_approval_settings(&self) -> Result<o::ApprovalSettings, String> {
        let mut c = self.org_client().await?;
        Ok(c.get_approval_settings(Request::new(o::GetApprovalSettingsRequest {})).await.map_err(map_status)?.into_inner())
    }

    pub async fn list_scim_connections(&self) -> Result<Vec<o::ScimConnection>, String> {
        let mut c = self.org_client().await?;
        Ok(c.list_scim_connections(Request::new(o::ListScimConnectionsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner()
            .connections)
    }

    pub async fn get_reconcile_status(&self) -> Result<o::ReconcileStatus, String> {
        let mut c = self.org_client().await?;
        Ok(c.get_reconcile_status(Request::new(o::GetReconcileStatusRequest {})).await.map_err(map_status)?.into_inner())
    }

    // ---- mutations (Operator; command_id + reason, audited) --------------------

    pub async fn save_org_unit(&self, unit: o::OrgUnit, reason: String) -> Result<o::OrgUnit, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        let r = c
            .save_org_unit(Request::new(o::SaveOrgUnitRequest { command_id: new_command_id(), reason, unit: Some(unit) }))
            .await
            .map_err(map_status)?
            .into_inner();
        r.unit.ok_or_else(|| "the kernel returned no unit".into())
    }

    pub async fn delete_org_unit(&self, id: String, reason: String) -> Result<o::OrgAck, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.delete_org_unit(Request::new(o::DeleteOrgUnitRequest { command_id: new_command_id(), reason, id }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn save_org_person(&self, person: o::OrgPerson, reason: String) -> Result<o::OrgPerson, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        let r = c
            .save_org_person(Request::new(o::SaveOrgPersonRequest { command_id: new_command_id(), reason, person: Some(person) }))
            .await
            .map_err(map_status)?
            .into_inner();
        r.person.ok_or_else(|| "the kernel returned no person".into())
    }

    pub async fn set_org_person_active(&self, principal_id: String, active: bool, reason: String) -> Result<o::OrgPerson, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.set_org_person_active(Request::new(o::SetOrgPersonActiveRequest {
            command_id: new_command_id(),
            reason,
            principal_id,
            active,
        }))
        .await
        .map_err(map_status)?
        .into_inner())
    }

    /// Validates, stores and APPLIES the rule set (the kernel's contract). The
    /// webview offers this only after a preview of exactly this rule.
    pub async fn save_mapping_rule(&self, rule: o::MappingRule, reason: String) -> Result<o::SaveMappingRuleResponse, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.save_mapping_rule(Request::new(o::SaveMappingRuleRequest { command_id: new_command_id(), reason, rule: Some(rule) }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn delete_mapping_rule(&self, id: String, reason: String) -> Result<o::MappingReport, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.delete_mapping_rule(Request::new(o::DeleteMappingRuleRequest { command_id: new_command_id(), reason, id }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn apply_mapping_rules(&self, reason: String) -> Result<o::MappingReport, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.apply_mapping_rules(Request::new(o::ApplyMappingRulesRequest { command_id: new_command_id(), reason }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn create_scim_connection(&self, name: String, oidc_issuer: String, reason: String) -> Result<o::ScimConnectionSecret, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.create_scim_connection(Request::new(o::CreateScimConnectionRequest {
            command_id: new_command_id(),
            reason,
            name,
            oidc_issuer,
        }))
        .await
        .map_err(map_status)?
        .into_inner())
    }

    pub async fn rotate_scim_token(&self, id: String, reason: String) -> Result<o::ScimConnectionSecret, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.rotate_scim_token(Request::new(o::RotateScimTokenRequest { command_id: new_command_id(), reason, id }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn revoke_scim_connection(&self, id: String, reason: String) -> Result<o::ScimConnection, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.revoke_scim_connection(Request::new(o::RevokeScimConnectionRequest { command_id: new_command_id(), reason, id }))
            .await
            .map_err(map_status)?
            .into_inner())
    }

    pub async fn run_reconcile_now(&self, reason: String) -> Result<o::ReconcileStatus, String> {
        need_reason(&reason)?;
        let mut c = self.org_client().await?;
        Ok(c.run_reconcile_now(Request::new(o::RunReconcileNowRequest { command_id: new_command_id(), reason }))
            .await
            .map_err(map_status)?
            .into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn org_messages_cross_the_bridge_with_proto_names_and_defaults() {
        // `match` is a Rust keyword (r#match): serde must still say "match".
        let rule = o::MappingRule {
            id: "r1".into(),
            r#match: Some(o::RuleMatch { departments: vec!["Finance".into()], ..Default::default() }),
            assign: Some(o::RuleAssign {
                approval_limits: vec![o::ApprovalLimit { class: "payment".into(), measure: "amount".into(), max: 5000.0, ..Default::default() }],
                ..Default::default()
            }),
            ..Default::default()
        };
        let v = serde_json::to_value(&rule).unwrap();
        assert_eq!(v["match"]["departments"][0], "Finance");
        assert_eq!(v["assign"]["approval_limits"][0]["max"], 5000.0);
        // A webview payload that omits fields decodes to proto defaults.
        let back: o::MappingRule = serde_json::from_value(serde_json::json!({"name": "x", "match": {"match_all": true}})).unwrap();
        assert!(back.r#match.unwrap().match_all);
        assert_eq!(back.priority, 0);
    }

    #[test]
    fn a_mutation_without_a_reason_is_refused_before_the_wire() {
        assert!(need_reason("  ").is_err());
        assert!(need_reason("reorg").is_ok());
    }
}
