//! The Operator Transport Plane client (ADR-0047). The ONLY thing in this app
//! that speaks gRPC to the runtime-core. Holds the tonic client, the bearer-token
//! auth, the command senders, and the feed loop (cursor resume → resync →
//! snapshot → reconnect). The webview reaches all of this only via Tauri commands.

use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use tonic::codegen::InterceptedService;
use tonic::service::Interceptor;
use tonic::transport::Channel;
use tonic::{Request, Status};

use crate::pb;
use crate::pb::operator_console_client::OperatorConsoleClient;
use crate::state::{ConnectionState, ConnectionStatus, StateOfRecord};

/// Tauri event names emitted to the webview.
const EV_STATE: &str = "kernel://state";
const EV_TOKEN: &str = "kernel://token";

const RECONNECT_BASE: Duration = Duration::from_secs(1);
const RECONNECT_CAP: Duration = Duration::from_secs(30);
const UNREACHABLE_AFTER: Duration = Duration::from_secs(180); // ~3 min of failed attempts

type SharedToken = Arc<StdMutex<Option<String>>>;
type ConsoleClient = OperatorConsoleClient<InterceptedService<Channel, AuthInterceptor>>;

/// Injects `authorization: Bearer <token>` on every call once logged in.
#[derive(Clone)]
pub struct AuthInterceptor {
    token: SharedToken,
}

impl Interceptor for AuthInterceptor {
    fn call(&mut self, mut req: Request<()>) -> Result<Request<()>, Status> {
        let tok = self.token.lock().unwrap().clone();
        if let Some(t) = tok {
            let value = format!("Bearer {t}")
                .parse()
                .map_err(|_| Status::internal("invalid token for authorization header"))?;
            req.metadata_mut().insert("authorization", value);
        }
        Ok(req)
    }
}

/// The transport, managed by Tauri as shared state.
#[derive(Clone)]
pub struct Transport {
    endpoint: Arc<AsyncMutex<Option<String>>>,
    token: SharedToken,
    channel: Arc<AsyncMutex<Option<Channel>>>,
    pub state: Arc<AsyncMutex<StateOfRecord>>,
    feed_running: Arc<StdMutex<bool>>,
}

impl Default for Transport {
    fn default() -> Self {
        Self {
            endpoint: Arc::new(AsyncMutex::new(None)),
            token: Arc::new(StdMutex::new(None)),
            channel: Arc::new(AsyncMutex::new(None)),
            state: Arc::new(AsyncMutex::new(StateOfRecord::default())),
            feed_running: Arc::new(StdMutex::new(false)),
        }
    }
}

impl Transport {
    /// Connect (lazily) and return a client with the auth interceptor attached.
    async fn client(&self) -> Result<ConsoleClient, String> {
        let mut guard = self.channel.lock().await;
        if guard.is_none() {
            let ep = self
                .endpoint
                .lock()
                .await
                .clone()
                .ok_or_else(|| "not connected: call login first".to_string())?;
            let channel = Channel::from_shared(ep)
                .map_err(|e| format!("bad endpoint: {e}"))?
                .connect()
                .await
                .map_err(|e| format!("connect: {e}"))?;
            *guard = Some(channel);
        }
        let channel = guard.as_ref().unwrap().clone();
        Ok(OperatorConsoleClient::with_interceptor(
            channel,
            AuthInterceptor { token: self.token.clone() },
        ))
    }

    fn set_token(&self, token: Option<String>) {
        *self.token.lock().unwrap() = token.clone();
        // Best-effort persistence in the OS keychain.
        if let Ok(entry) = keyring::Entry::new("cambrian-ui", "operator-token") {
            match &token {
                Some(t) => {
                    let _ = entry.set_password(t);
                }
                None => {
                    let _ = entry.delete_credential();
                }
            }
        }
    }

    async fn emit_state(&self, app: &AppHandle) {
        let snap = self.state.lock().await.clone();
        let _ = app.emit(EV_STATE, snap);
    }

    async fn set_connection(&self, app: &AppHandle, status: ConnectionStatus) {
        {
            let mut s = self.state.lock().await;
            s.connection.status = status;
        }
        self.emit_state(app).await;
    }

    // ---- Auth ------------------------------------------------------------

    /// Authenticate, store the token, and start the feed loop. Returns the role.
    pub async fn login(
        &self,
        app: &AppHandle,
        endpoint: String,
        username: String,
        password: String,
    ) -> Result<String, String> {
        *self.endpoint.lock().await = Some(endpoint);
        *self.channel.lock().await = None; // force reconnect to the (new) endpoint
        self.set_token(None);
        self.set_connection(app, ConnectionStatus::Reconnecting).await;

        let mut client = self.client().await?;
        let resp = client
            .login(Request::new(pb::LoginRequest { username, password }))
            .await
            .map_err(|e| format!("login: {}", e.message()))?
            .into_inner();

        self.set_token(Some(resp.token.clone()));
        {
            let mut s = self.state.lock().await;
            s.role = Some(resp.role.clone());
        }
        self.start_feed(app.clone());
        Ok(resp.role)
    }

    // ---- Reads -----------------------------------------------------------

    async fn snapshot_into_state(&self) -> Result<(), String> {
        let mut client = self.client().await?;
        let snap = client
            .snapshot(Request::new(pb::SnapshotRequest {}))
            .await
            .map_err(|e| format!("snapshot: {}", e.message()))?
            .into_inner();
        let mut s = self.state.lock().await;
        let conn_status = s.connection.status;
        let conn_endpoint = s.connection.endpoint.clone();
        let conn_last_state = s.connection.last_known_state_at.clone();
        let conn_reason = s.connection.reason.clone();
        let role = s.role.clone();
        s.apply_snapshot(&snap);
        s.connection = ConnectionState {
            status: conn_status,
            endpoint: conn_endpoint,
            last_known_state_at: conn_last_state,
            reason: conn_reason,
        };
        s.role = role;
        Ok(())
    }

    // ---- Commands (idempotent + audited) ---------------------------------

    pub async fn create_session(&self, goal: String, reason: String) -> Result<String, String> {
        let mut client = self.client().await?;
        let resp = client
            .create_session(Request::new(pb::CreateSessionRequest {
                command_id: new_command_id(),
                reason,
                goal,
                parent_id: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.session_id)
    }

    pub async fn send_message(
        &self,
        session_id: String,
        text: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .send_message(Request::new(pb::SendMessageRequest {
                command_id: new_command_id(),
                reason,
                session_id,
                text,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn inject_correction(
        &self,
        session_id: String,
        instruction: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .inject_correction(Request::new(pb::InjectCorrectionRequest {
                command_id: new_command_id(),
                reason,
                session_id,
                instruction,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn session_command(
        &self,
        pause: bool,
        session_id: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let req = Request::new(pb::SessionCommandRequest {
            command_id: new_command_id(),
            reason,
            session_id,
        });
        let ack = if pause {
            client.pause_session(req).await
        } else {
            client.resume_session(req).await
        }
        .map_err(map_status)?
        .into_inner();
        Ok(ack.deduped)
    }

    pub async fn resolve_hitl(
        &self,
        intervention_id: String,
        approve: bool,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .resolve_hitl(Request::new(pb::ResolveHitlRequest {
                command_id: new_command_id(),
                reason,
                intervention_id: intervention_id.clone(),
                approve,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        // optimistic: drop the resolved intervention from the pending set.
        let mut s = self.state.lock().await;
        s.pending_hitl.retain(|h| h.intervention_id != intervention_id);
        Ok(ack.deduped)
    }

    pub async fn set_tool_grant(
        &self,
        agent_id: String,
        tool_name: String,
        granted: bool,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_tool_grant(Request::new(pb::SetToolGrantRequest {
                command_id: new_command_id(),
                reason,
                agent_id,
                tool_name,
                granted,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn set_scope(
        &self,
        agent_id: String,
        required_tags: Vec<String>,
        any_of_tags: Vec<String>,
        forbidden_tags: Vec<String>,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_scope(Request::new(pb::SetScopeRequest {
                command_id: new_command_id(),
                reason,
                agent_id,
                required_tags,
                any_of_tags,
                forbidden_tags,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn register_skill(
        &self,
        name: String,
        description: String,
        instructions: String,
        tool_grants: Vec<String>,
        scope_tags: Vec<String>,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .register_skill(Request::new(pb::RegisterSkillRequest {
                command_id: new_command_id(),
                reason,
                name,
                description,
                instructions,
                tool_grants,
                scope_tags,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn register_mcp(
        &self,
        name: String,
        command: String,
        url: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .register_mcp(Request::new(pb::RegisterMcpRequest {
                command_id: new_command_id(),
                reason,
                name,
                command,
                url,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    // ---- The feed loop ---------------------------------------------------

    fn start_feed(&self, app: AppHandle) {
        {
            let mut running = self.feed_running.lock().unwrap();
            if *running {
                return;
            }
            *running = true;
        }
        let this = self.clone();
        tokio::spawn(async move {
            this.run_feed(app).await;
            *this.feed_running.lock().unwrap() = false;
        });
    }

    async fn run_feed(&self, app: AppHandle) {
        let mut attempt: u32 = 0;
        loop {
            self.set_connection(
                &app,
                ConnectionStatus::Reconnecting,
            )
            .await;

            // Seed from a snapshot (state + capability/version handshake), then
            // subscribe from the cursor it stamped.
            if let Err(e) = self.snapshot_into_state().await {
                tracing::warn!("feed snapshot failed: {e}");
                if self.backoff(&app, &mut attempt).await {
                    return; // unreachable: stop the loop
                }
                continue;
            }
            self.emit_state(&app).await;

            let cursor = self.state.lock().await.cursor;
            let mut client = match self.client().await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("feed client failed: {e}");
                    if self.backoff(&app, &mut attempt).await {
                        return;
                    }
                    continue;
                }
            };

            let stream = match client
                .stream_events(Request::new(pb::SubscribeRequest { last_seq: cursor }))
                .await
            {
                Ok(s) => s.into_inner(),
                Err(e) => {
                    tracing::warn!("stream_events failed: {}", e.message());
                    if self.backoff(&app, &mut attempt).await {
                        return;
                    }
                    continue;
                }
            };

            attempt = 0; // connected
            self.set_connection(&app, ConnectionStatus::Live).await;

            if self.drain(&app, stream).await {
                // graceful end (rare) — reconnect
            }
            // dropped/errored: force a fresh channel + reconnect.
            *self.channel.lock().await = None;
        }
    }

    /// Drain the event stream. Returns when it ends or errors.
    async fn drain(
        &self,
        app: &AppHandle,
        mut stream: tonic::Streaming<pb::OperatorEvent>,
    ) -> bool {
        loop {
            match stream.message().await {
                Ok(Some(ev)) => {
                    use pb::operator_event::Payload;
                    match &ev.payload {
                        Some(Payload::Resync(_)) => {
                            // Cursor aged out: re-snapshot, then keep folding the
                            // live tail the kernel continues to send (D6).
                            if let Err(e) = self.snapshot_into_state().await {
                                tracing::warn!("resync snapshot failed: {e}");
                            }
                            self.emit_state(app).await;
                        }
                        Some(Payload::Token(t)) => {
                            // live-only lane — never folded, never replayed.
                            let _ = app.emit(EV_TOKEN, TokenChunk {
                                session_id: t.session_id.clone(),
                                step_index: t.step_index,
                                text: t.text.clone(),
                            });
                        }
                        _ => {
                            let structural = {
                                let mut s = self.state.lock().await;
                                s.fold(&ev)
                            };
                            if structural {
                                self.emit_state(app).await;
                            }
                        }
                    }
                }
                Ok(None) => return true,   // stream ended
                Err(e) => {
                    tracing::warn!("stream error: {}", e.message());
                    return false;
                }
            }
        }
    }

    /// Sleep with exponential backoff. Returns true if we've exceeded the
    /// unreachable threshold (caller should stop).
    async fn backoff(&self, app: &AppHandle, attempt: &mut u32) -> bool {
        let delay = RECONNECT_BASE
            .saturating_mul(2u32.saturating_pow(*attempt))
            .min(RECONNECT_CAP);
        *attempt += 1;
        if delay >= UNREACHABLE_AFTER {
            self.set_connection(app, ConnectionStatus::Down).await;
        }
        *self.channel.lock().await = None;
        tokio::time::sleep(delay).await;
        // Stop after the cap has been hit enough times to cross the threshold.
        *attempt > 8
    }
}

#[derive(Clone, serde::Serialize)]
struct TokenChunk {
    session_id: String,
    step_index: i32,
    text: String,
}

fn new_command_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn map_status(e: Status) -> String {
    format!("{}: {}", e.code(), e.message())
}
