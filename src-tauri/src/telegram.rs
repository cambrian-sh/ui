//! The Telegram ingress plane (ADR-0090) — the operator surface for a bot entry point.
//!
//! Mounted on the same kernel server, over the same connection and bearer token as the
//! operator console, exactly like the access-policy plane. A kernel built without the
//! telegram plugin answers `Unimplemented`, which surfaces as "not available" rather than
//! as an error.
//!
//! **The credential is write-only across this whole file.** Nothing here returns a token
//! and nothing logs one. `TelegramStatus` deliberately carries only whether one is stored
//! and which public bot it belongs to — enough for an operator to know the state, and not
//! enough to leak it to a screen, a recording, or a log.

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::telegram::telegram_admin_client::TelegramAdminClient;

type TelegramClient = TelegramAdminClient<InterceptedService<Channel, AuthInterceptor>>;

/// Everything safe to render about the Telegram ingress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramStatus {
    /// The operator's intent: should the ingress be running.
    pub enabled: bool,
    /// Whether a credential is stored. Never the credential.
    pub token_configured: bool,
    /// Public bot handle, e.g. "@Cambrian1_bot". Empty until verified.
    pub bot_username: String,
    /// Whether the daemon is actually polling — not the same as `enabled`.
    pub running: bool,
    pub surface: String,
    pub namespace: Vec<String>,
    /// "off" | "no_token" | "starting" | "running" | "error"
    pub state: String,
    pub detail: String,
    /// Telegram's own setting: when true the bot only sees messages that mention it.
    pub privacy_mode: bool,
}

/// The outcome of a write. A refusal is a normal authoring result carried in `error`,
/// not a transport failure — "add a token first" is something the form renders inline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramAck {
    pub ok: bool,
    pub error: String,
}

impl Transport {
    async fn telegram_client(&self) -> Result<TelegramClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(TelegramAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    pub async fn telegram_status(&self) -> Result<TelegramStatus, String> {
        let mut client = self.telegram_client().await?;
        let s = client
            .get_status(Request::new(pb::telegram::GetStatusRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramStatus {
            enabled: s.enabled,
            token_configured: s.token_configured,
            bot_username: s.bot_username,
            running: s.running,
            surface: s.surface,
            namespace: s.namespace,
            state: s.state,
            detail: s.detail,
            privacy_mode: s.privacy_mode,
        })
    }

    /// Store a bot token. The value is passed straight through and never retained,
    /// echoed, or logged on this side.
    pub async fn telegram_set_token(&self, token: String) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .set_token(Request::new(pb::telegram::SetTokenRequest { token }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck { ok: ack.ok, error: ack.error })
    }

    /// Remove the credential. `reason` is mandatory — the kernel refuses without one.
    pub async fn telegram_clear_token(&self, reason: String) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .clear_token(Request::new(pb::telegram::ClearTokenRequest { reason }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck { ok: ack.ok, error: ack.error })
    }

    pub async fn telegram_set_enabled(&self, enabled: bool) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .set_enabled(Request::new(pb::telegram::SetEnabledRequest { enabled }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck { ok: ack.ok, error: ack.error })
    }
}
