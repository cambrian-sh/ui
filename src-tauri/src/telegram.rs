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
    /// Which bot this status is for (contract 0081).
    pub bot_id: String,
    pub label: String,
    /// The principal this bot's daemon runs as — the id the ingress registry maps
    /// to this bot's surface.
    pub agent_id: String,
    /// Whether an ingress registration exists for this bot's surface.
    ///
    /// False means traffic arrives with NO POLICY attached to the door it came
    /// through. The bot still polls, receives and answers, which is exactly why
    /// the console has to say so rather than render it as healthy.
    pub surface_registered: bool,
}

/// One configured bot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramBot {
    pub id: String,
    pub label: String,
    pub surface: String,
    pub agent_id: String,
    pub token_configured: bool,
    pub enabled: bool,
    pub running: bool,
    pub bot_username: String,
    pub state: String,
    pub detail: String,
    pub surface_registered: bool,
}

/// The outcome of a write. A refusal is a normal authoring result carried in `error`,
/// not a transport failure — "add a token first" is something the form renders inline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramAck {
    pub ok: bool,
    pub error: String,
    /// What succeeded and what it left undone.
    ///
    /// A bot can be created successfully and still not be governed — its surface
    /// is registered separately, under the operator's own authority — and an
    /// `ok` alone cannot carry that.
    pub detail: String,
}

impl Transport {
    async fn telegram_client(&self) -> Result<TelegramClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(TelegramAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    /// Status for one bot. An EMPTY `bot_id` means the default, so the call is
    /// unchanged for a deployment that has never configured a second one.
    pub async fn telegram_status(&self, bot_id: String) -> Result<TelegramStatus, String> {
        let mut client = self.telegram_client().await?;
        let s = client
            .get_status(Request::new(pb::telegram::GetStatusRequest { bot_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramStatus {
            bot_id: s.bot_id,
            label: s.label,
            agent_id: s.agent_id,
            surface_registered: s.surface_registered,
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
    pub async fn telegram_set_token(&self, bot_id: String, token: String) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .set_token(Request::new(pb::telegram::SetTokenRequest { token, bot_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck {
            ok: ack.ok,
            error: ack.error,
            detail: ack.detail,
        })
    }

    /// Remove the credential. `reason` is mandatory — the kernel refuses without one.
    pub async fn telegram_clear_token(&self, bot_id: String, reason: String) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .clear_token(Request::new(pb::telegram::ClearTokenRequest { reason, bot_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck {
            ok: ack.ok,
            error: ack.error,
            detail: ack.detail,
        })
    }

    pub async fn telegram_set_enabled(&self, bot_id: String, enabled: bool) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        let ack = client
            .set_enabled(Request::new(pb::telegram::SetEnabledRequest { enabled, bot_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(TelegramAck {
            ok: ack.ok,
            error: ack.error,
            detail: ack.detail,
        })
    }

    /// Every configured bot, with the state of each.
    pub async fn telegram_list_bots(&self) -> Result<Vec<TelegramBot>, String> {
        let mut client = self.telegram_client().await?;
        let resp = client
            .list_bots(Request::new(pb::telegram::ListBotsRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .bots
            .into_iter()
            .map(|b| TelegramBot {
                id: b.id,
                label: b.label,
                surface: b.surface,
                agent_id: b.agent_id,
                token_configured: b.token_configured,
                enabled: b.enabled,
                running: b.running,
                bot_username: b.bot_username,
                state: b.state,
                detail: b.detail,
                surface_registered: b.surface_registered,
            })
            .collect())
    }

    /// Record a new bot. A rejected id is an authoring outcome the form renders
    /// inline, not a transport failure that blanks the page.
    pub async fn telegram_add_bot(
        &self,
        id: String,
        label: String,
        token: String,
    ) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        match client
            .add_bot(Request::new(pb::telegram::AddBotRequest { id, label, token }))
            .await
        {
            Ok(resp) => Ok(TelegramAck {
                ok: true,
                error: String::new(),
                detail: resp.into_inner().detail,
            }),
            Err(st)
                if st.code() == tonic::Code::InvalidArgument
                    || st.code() == tonic::Code::AlreadyExists =>
            {
                Ok(TelegramAck { ok: false, error: st.message().to_string(), detail: String::new() })
            }
            Err(st) => Err(map_status(st)),
        }
    }

    /// Stop a bot and forget its credential. `reason` is mandatory.
    pub async fn telegram_remove_bot(
        &self,
        id: String,
        reason: String,
    ) -> Result<TelegramAck, String> {
        let mut client = self.telegram_client().await?;
        match client
            .remove_bot(Request::new(pb::telegram::RemoveBotRequest { id, reason }))
            .await
        {
            Ok(_) => Ok(TelegramAck { ok: true, error: String::new(), detail: String::new() }),
            Err(st) if st.code() == tonic::Code::InvalidArgument => {
                Ok(TelegramAck { ok: false, error: st.message().to_string(), detail: String::new() })
            }
            Err(st) => Err(map_status(st)),
        }
    }
}
