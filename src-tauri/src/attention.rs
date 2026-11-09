//! Consumer attention (ADR-0141 D3, capability `accounts`):
//! `AccountsAdmin.ListMyAttention` — the consumers (today: ingresses) stopped
//! because the account they authenticate with is unusable (revoked,
//! reconnect-needed, awaiting confirmation, missing). The Inbox lists them.
//!
//! A read for any role: the kernel filters to the CALLER (their own personal
//! ingress items, plus the organisation's for an Operator); no request field
//! names a principal. Items carry no credential, and resolve themselves when
//! the account works again — there is nothing to dismiss here.

use serde::{Deserialize, Serialize};
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, Transport, MAX_MESSAGE_BYTES};

use pb::accounts::accounts_admin_client::AccountsAdminClient;

/// One consumer stopped by its account.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AttentionItem {
    /// `<purpose>:<consumer_id>`, stable while the item is open.
    pub id: String,
    /// The consumer kind: "ingress".
    pub purpose: String,
    pub consumer_id: String,
    pub consumer_name: String,
    /// The consumer's credential slot (an ingress binding name).
    pub slot: String,
    /// Who must act; "" = the organisation (Operators).
    pub owner: String,
    /// The account reference as authored ("owner:google", an org account id, "").
    pub account: String,
    pub provider: String,
    /// account_revoked | account_reconnect_needed | account_pending_confirmation |
    /// account_missing | account_not_permitted | account_insufficient_scope.
    pub reason: String,
    /// Addressed to the owner, ready to show.
    pub title: String,
    pub detail: String,
    pub since_unix_ms: i64,
}

fn item(a: pb::accounts::AttentionItem) -> AttentionItem {
    AttentionItem {
        id: a.id,
        purpose: a.purpose,
        consumer_id: a.consumer_id,
        consumer_name: a.consumer_name,
        slot: a.slot,
        owner: a.owner,
        account: a.account,
        provider: a.provider,
        reason: a.reason,
        title: a.title,
        detail: a.detail,
        since_unix_ms: a.since_unix_ms,
    }
}

impl Transport {
    /// ListMyAttention: the attention items addressed to the caller.
    pub async fn list_my_attention(&self) -> Result<Vec<AttentionItem>, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        let mut client = AccountsAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES);
        let r = client
            .list_my_attention(Request::new(pb::accounts::ListMyAttentionRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(r.items.into_iter().map(item).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_maps_every_field() {
        let got = item(pb::accounts::AttentionItem {
            id: "ingress:mail".into(),
            purpose: "ingress".into(),
            consumer_id: "mail".into(),
            consumer_name: "Alice's mail".into(),
            slot: "token".into(),
            owner: "alice".into(),
            account: "owner:google".into(),
            provider: "google".into(),
            reason: "account_reconnect_needed".into(),
            title: "Reconnect your Google account to keep ingesting Alice's mail".into(),
            detail: "credential \"token\" unresolved".into(),
            since_unix_ms: 42,
        });
        assert_eq!(got.id, "ingress:mail");
        assert_eq!(got.owner, "alice");
        assert_eq!(got.reason, "account_reconnect_needed");
        assert_eq!(got.since_unix_ms, 42);
        assert_eq!(got.consumer_name, "Alice's mail");
    }
}
