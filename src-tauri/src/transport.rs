//! The Operator Transport Plane client (ADR-0047). The ONLY thing in this app
//! that speaks gRPC to the runtime-core. Holds the tonic client, the bearer-token
//! auth, the command senders, and the feed loop (cursor resume → resync →
//! snapshot → reconnect). The webview reaches all of this only via Tauri commands.

use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex as AsyncMutex, Notify};
use tonic::codegen::InterceptedService;
use tonic::service::Interceptor;
use tonic::transport::Channel;
use tonic::{Request, Status};

use crate::pb;
use crate::pb::operator_console_client::OperatorConsoleClient;
use crate::state::{
    ConnectionStatus, SkillSummary, StateOfRecord, ToolSummary, WatchConfigSummary,
};

/// Tauri event names emitted to the webview.
const EV_STATE: &str = "kernel://state";
const EV_TOKEN: &str = "kernel://token";

const RECONNECT_BASE: Duration = Duration::from_secs(1);
const RECONNECT_CAP: Duration = Duration::from_secs(30);
const UNREACHABLE_AFTER: Duration = Duration::from_secs(180); // ~3 min of failed attempts
/// Ceiling for a single encoded/decoded gRPC message. See the note in `client()`.
/// 512 MiB to match the kernel's `maxGRPCMessageBytes` — the operator ingest lane
/// carries whole files, so the encode (send) side must clear large uploads.
const MAX_MESSAGE_BYTES: usize = 512 * 1024 * 1024;

type SharedToken = Arc<StdMutex<Option<String>>>;
type ConsoleClient = OperatorConsoleClient<InterceptedService<Channel, AuthInterceptor>>;

/// One retrieval hit, flattened for the webview (prost types are not Serialize).
///
/// `text` is the verbatim chunk and `section_path` its ADR-0060 structural
/// breadcrumb — together they are what makes a citation checkable. `summary` is
/// only a <=200-char preview; never quote it as a source.
#[derive(Clone, serde::Serialize, Default)]
pub struct MemoryHit {
    pub doc_id: String,
    pub summary: String,
    pub text: String,
    pub section_path: String,
    pub score: f64,
    pub source: String,
    pub importance: f64,
    pub tags: Vec<String>,
}

/// One citation the answer's [n] markers resolve to (ADR-0081).
#[derive(Clone, serde::Serialize, Default)]
pub struct Citation {
    pub marker: i32,
    pub doc_id: String,
    pub text: String,
    pub section_path: String,
    pub source: String,
    pub score: f64,
    pub importance: f64,
    pub tags: Vec<String>,
}

impl From<pb::MemoryCitation> for Citation {
    fn from(c: pb::MemoryCitation) -> Self {
        Self {
            marker: c.marker,
            doc_id: c.doc_id,
            text: c.text,
            section_path: c.section_path,
            source: c.source,
            score: c.score,
            importance: c.importance,
            tags: c.tags,
        }
    }
}

/// A grounded, cited answer (ADR-0081).
#[derive(Clone, serde::Serialize, Default)]
pub struct AnswerMemory {
    pub status: String,
    pub answer: String,
    pub citations: Vec<Citation>,
}

impl From<pb::MemoryOp> for MemoryHit {
    fn from(m: pb::MemoryOp) -> Self {
        Self {
            doc_id: m.doc_id,
            summary: m.summary,
            text: m.text,
            section_path: m.section_path,
            score: m.score,
            source: m.source,
            importance: m.importance,
            tags: m.tags,
        }
    }
}

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
    /// Set by `disconnect` to unwind the feed loop. Without it the loop
    /// reconnects forever and "disconnected" could only ever be cosmetic.
    stop_requested: Arc<StdMutex<bool>>,
    /// Wakes the loop out of a `stream.message()` or a backoff sleep so a
    /// disconnect is immediate rather than waiting on kernel traffic.
    stop_notify: Arc<Notify>,
}

impl Default for Transport {
    fn default() -> Self {
        Self {
            endpoint: Arc::new(AsyncMutex::new(None)),
            token: Arc::new(StdMutex::new(None)),
            channel: Arc::new(AsyncMutex::new(None)),
            state: Arc::new(AsyncMutex::new(StateOfRecord::default())),
            feed_running: Arc::new(StdMutex::new(false)),
            stop_requested: Arc::new(StdMutex::new(false)),
            stop_notify: Arc::new(Notify::new()),
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
            AuthInterceptor {
                token: self.token.clone(),
            },
        )
        // tonic defaults to a 4 MiB decode cap. `Snapshot` carries every live
        // session, and one session's `goal` can be a multi-KB agent prompt, so a
        // busy kernel exceeds 4 MiB and the console wedges in "reconnecting"
        // forever — the snapshot is the feed loop's first move. This is a safety
        // valve for the client, NOT a licence for an unbounded snapshot: keeping
        // it bounded is the kernel's side of ADR-0047 D6/D8.
        //
        // The encode side needs the same treatment: `IngestMemory` carries raw
        // file bytes, so any PDF over the 4 MiB default would be rejected before
        // it ever left the console.
        .max_decoding_message_size(MAX_MESSAGE_BYTES)
        .max_encoding_message_size(MAX_MESSAGE_BYTES))
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

    /// Persist the full connection (endpoint, username, password) in the OS
    /// keychain so the console can reconnect on launch without re-prompting.
    ///
    /// The password is stored ONLY because the kernel's login token is ephemeral
    /// (an in-memory table entry, lost on kernel restart), so the token alone
    /// cannot re-establish a session. It lives in the OS keychain, never in a
    /// plaintext file, and is cleared on `disconnect`.
    fn save_connection(endpoint: &str, username: &str, password: &str) {
        if let Ok(entry) = keyring::Entry::new("cambrian-ui", "saved-connection") {
            let blob = format!("{endpoint}\n{username}\n{password}");
            let _ = entry.set_password(&blob);
        }
    }

    fn clear_saved_connection() {
        if let Ok(entry) = keyring::Entry::new("cambrian-ui", "saved-connection") {
            let _ = entry.delete_credential();
        }
    }

    /// Read the saved connection, if any. Returns `(endpoint, username, password)`.
    pub fn saved_connection() -> Option<(String, String, String)> {
        let entry = keyring::Entry::new("cambrian-ui", "saved-connection").ok()?;
        let blob = entry.get_password().ok()?;
        let mut parts = blob.splitn(3, '\n');
        let endpoint = parts.next()?.to_string();
        let username = parts.next()?.to_string();
        let password = parts.next()?.to_string();
        if endpoint.is_empty() || username.is_empty() {
            return None;
        }
        Some((endpoint, username, password))
    }

    async fn emit_state(&self, app: &AppHandle) {
        let snap = self.state.lock().await.clone();
        let _ = app.emit(EV_STATE, snap);
    }

    async fn set_connection(&self, app: &AppHandle, status: ConnectionStatus) {
        {
            let mut s = self.state.lock().await;
            s.connection.status = status;
            if matches!(status, ConnectionStatus::Live) {
                s.connection.reason = None; // a live feed clears the last fault
            }
        }
        self.emit_state(app).await;
    }

    /// Record WHY the feed is not live. Without this a failing snapshot leaves the
    /// console sitting in "reconnecting" with no explanation — the operator cannot
    /// tell a dead kernel from an oversized response.
    async fn set_fault(&self, app: &AppHandle, reason: String) {
        tracing::warn!("feed fault: {reason}");
        {
            let mut s = self.state.lock().await;
            s.connection.reason = Some(reason);
        }
        self.emit_state(app).await;
    }

    // ---- Auth ------------------------------------------------------------

    /// Authenticate, store the token, and start the feed loop. Returns the role.
    ///
    /// When `remember` is set, the connection (incl. password) is written to the
    /// OS keychain so the next launch can reconnect without prompting. It is saved
    /// only AFTER the kernel accepts the credentials, so a bad password is never
    /// persisted.
    pub async fn login(
        &self,
        app: &AppHandle,
        endpoint: String,
        username: String,
        password: String,
        remember: bool,
    ) -> Result<String, String> {
        *self.stop_requested.lock().unwrap() = false;
        *self.endpoint.lock().await = Some(endpoint.clone());
        *self.channel.lock().await = None; // force reconnect to the (new) endpoint
        self.set_token(None);
        {
            // The webview names the instance it is operating; without this the
            // connection panel can only ever show a blank endpoint.
            let mut s = self.state.lock().await;
            s.connection.endpoint = Some(endpoint.clone());
        }
        self.set_connection(app, ConnectionStatus::Reconnecting)
            .await;

        let mut client = self.client().await?;
        let resp = client
            .login(Request::new(pb::LoginRequest {
                username: username.clone(),
                password: password.clone(),
            }))
            .await
            .map_err(|e| format!("login: {}", e.message()))?
            .into_inner();

        self.set_token(Some(resp.token.clone()));
        if remember {
            Self::save_connection(&endpoint, &username, &password);
        }
        {
            let mut s = self.state.lock().await;
            s.role = Some(resp.role.clone());
        }
        self.start_feed(app.clone());
        Ok(resp.role)
    }

    fn stop_requested(&self) -> bool {
        *self.stop_requested.lock().unwrap()
    }

    /// Tear down the operator session: stop the feed loop, drop the channel,
    /// forget the token (including the keychain copy), and reset to Down.
    ///
    /// The role and the folded live state are cleared too — leaving them would
    /// let a disconnected UI keep rendering a previous kernel's data as if it
    /// were current.
    pub async fn disconnect(&self, app: &AppHandle) -> Result<(), String> {
        *self.stop_requested.lock().unwrap() = true;
        self.stop_notify.notify_waiters();

        self.set_token(None);
        // Explicit disconnect means "forget me": drop the saved credentials so the
        // next launch does not silently reconnect to an instance the operator left.
        Self::clear_saved_connection();
        *self.channel.lock().await = None;
        *self.endpoint.lock().await = None;

        {
            let mut s = self.state.lock().await;
            s.reset_live();
            s.role = None;
            s.capabilities.clear();
            s.kernel_version.clear();
            s.contract_version.clear();
            s.connection.endpoint = None;
            s.connection.reason = Some("disconnected by operator".to_string());
        }
        self.set_connection(app, ConnectionStatus::Down).await;
        Ok(())
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
        let conn = s.connection.clone();
        let role = s.role.clone();
        s.apply_snapshot(&snap);
        s.connection = conn;
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
        s.pending_hitl
            .retain(|h| h.intervention_id != intervention_id);
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

    pub async fn trigger_consolidation(
        &self,
        scope: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .trigger_consolidation(Request::new(pb::TriggerConsolidationRequest {
                command_id: new_command_id(),
                reason,
                scope,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn list_tools(&self, app: &AppHandle) -> Result<Vec<ToolSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_tools(Request::new(pb::ListToolsOpRequest {
                page: 0,
                page_size: 0,
                query: String::new(),
                dangerous_only: false,
                source: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        let tools: Vec<ToolSummary> = resp
            .tools
            .into_iter()
            .map(|t| ToolSummary {
                id: t.name,
                description: t.description,
                danger: t.dangerous,
                granted_agent_count: t.grants.len() as i32,
                recent_invocation_count: 0,
                last_cost: 0.0,
            })
            .collect();
        {
            let mut st = self.state.lock().await;
            st.tools = tools.clone();
        }
        self.emit_state(app).await;
        Ok(tools)
    }

    pub async fn list_skills(&self, app: &AppHandle) -> Result<Vec<SkillSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_skills(Request::new(pb::ListSkillsOpRequest {
                page: 0,
                page_size: 0,
                query: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        let skills: Vec<SkillSummary> = resp
            .skills
            .into_iter()
            .map(|s| SkillSummary {
                id: s.name,
                description: s.description,
                scope_tags: s.scope_tags,
                loaded_in_count: 0,
                last_loaded_at: String::new(),
            })
            .collect();
        {
            let mut st = self.state.lock().await;
            st.skills = skills.clone();
        }
        self.emit_state(app).await;
        Ok(skills)
    }

    pub async fn list_watches(&self, app: &AppHandle) -> Result<Vec<WatchConfigSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_watches(Request::new(pb::ListWatchesOpRequest {
                page: 0,
                page_size: 0,
                active_only: false,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        let watches: Vec<WatchConfigSummary> = resp
            .configs
            .into_iter()
            .map(|c| WatchConfigSummary {
                id: c.id,
                target_streams: if c.source_stream_id.is_empty() {
                    vec![]
                } else {
                    vec![c.source_stream_id]
                },
                last_fire_at: None,
                last_fire_status: String::new(),
                error_count: 0,
            })
            .collect();
        {
            let mut st = self.state.lock().await;
            st.watch_configs = watches.clone();
        }
        self.emit_state(app).await;
        Ok(watches)
    }

    // ---- Memory (ADR-0047 A2.4, contract 0057) ---------------------------

    /// Ingest one document. Exactly one of `text` / `content` must be set — the
    /// kernel rejects both-or-neither. `content` is the raw file bytes: they go to
    /// the docling_agent for structure-aware parsing, so a PDF keeps its real
    /// hierarchy instead of being flattened. `filename` is REQUIRED alongside
    /// `content` (its extension routes the chunker).
    ///
    /// `context` is the operator's note; the kernel folds it into the body so it is
    /// chunked and embedded with the document rather than stranded in metadata.
    ///
    /// Returns (doc_id, deduped). `deduped` = a replayed command_id, not a content
    /// duplicate.
    #[allow(clippy::too_many_arguments)]
    pub async fn ingest_memory(
        &self,
        text: String,
        content: Vec<u8>,
        filename: String,
        content_type: String,
        context: String,
        tags: Vec<String>,
        importance: f64,
        source: String,
        session_id: String,
        reason: String,
    ) -> Result<(String, bool), String> {
        let mut client = self.client().await?;
        let resp = client
            .ingest_memory(Request::new(pb::IngestMemoryOpRequest {
                command_id: new_command_id(),
                reason,
                text,
                tags,
                importance,
                source,
                session_id,
                content,
                filename,
                content_type,
                context,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok((resp.doc_id, resp.deduped))
    }

    /// AnswerMemory (ADR-0081): a grounded, [n]-cited answer + the evidence each
    /// marker resolves to. Requires the kernel `memory-answer` capability; an older
    /// or agentic-disabled kernel returns Unimplemented.
    pub async fn answer_memory(
        &self,
        query: String,
        top_k: i32,
        source: String,
        session: String,
        min_importance: f64,
    ) -> Result<AnswerMemory, String> {
        let mut client = self.client().await?;
        let resp = client
            .answer_memory(Request::new(pb::AnswerMemoryRequest {
                query,
                top_k,
                source,
                session,
                min_importance,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(AnswerMemory {
            status: resp.status,
            answer: resp.answer,
            citations: resp.citations.into_iter().map(Citation::from).collect(),
        })
    }

    /// Ranked recall over operator-visible memory. This is the deterministic
    /// single-pass lane (kernel `SearchSystem`) — it returns evidence, NOT a
    /// composed answer. Compose answers on the chat lane (`send_message`).
    pub async fn query_memory(
        &self,
        query: String,
        top_k: i32,
        source: String,
        session: String,
        min_importance: f64,
    ) -> Result<Vec<MemoryHit>, String> {
        let mut client = self.client().await?;
        let resp = client
            .query_memory(Request::new(pb::QueryMemoryRequest {
                query,
                top_k,
                source,
                session,
                min_importance,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.results.into_iter().map(MemoryHit::from).collect())
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
        let mut waited = Duration::ZERO;
        loop {
            if self.stop_requested() {
                return;
            }
            self.set_connection(&app, ConnectionStatus::Reconnecting)
                .await;

            // Seed from a snapshot (state + capability/version handshake), then
            // subscribe from the cursor it stamped.
            if let Err(e) = self.snapshot_into_state().await {
                self.set_fault(&app, format!("snapshot: {e}")).await;
                if self.backoff(&app, &mut attempt, &mut waited).await {
                    return; // unreachable: stop the loop
                }
                continue;
            }
            self.emit_state(&app).await;

            let cursor = self.state.lock().await.cursor;
            let mut client = match self.client().await {
                Ok(c) => c,
                Err(e) => {
                    self.set_fault(&app, format!("connect: {e}")).await;
                    if self.backoff(&app, &mut attempt, &mut waited).await {
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
                    self.set_fault(&app, format!("stream_events: {}", e.message()))
                        .await;
                    if self.backoff(&app, &mut attempt, &mut waited).await {
                        return;
                    }
                    continue;
                }
            };

            attempt = 0; // connected
            waited = Duration::ZERO;
            self.set_connection(&app, ConnectionStatus::Live).await;

            if self.drain(&app, stream).await {
                // graceful end (rare) — reconnect
            }
            if self.stop_requested() {
                return;
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
            // A quiet kernel would otherwise park us in `message()` indefinitely,
            // so a disconnect has to be able to interrupt the await itself.
            let next = tokio::select! {
                msg = stream.message() => msg,
                _ = self.stop_notify.notified() => return true,
            };
            match next {
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
                            let _ = app.emit(
                                EV_TOKEN,
                                TokenChunk {
                                    session_id: t.session_id.clone(),
                                    step_index: t.step_index,
                                    text: t.text.clone(),
                                },
                            );
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
                Ok(None) => return true, // stream ended
                Err(e) => {
                    tracing::warn!("stream error: {}", e.message());
                    return false;
                }
            }
        }
    }

    /// Sleep with exponential backoff. Returns true if we've exceeded the
    /// unreachable threshold (caller should stop).
    async fn backoff(&self, app: &AppHandle, attempt: &mut u32, waited: &mut Duration) -> bool {
        let delay = RECONNECT_BASE
            .saturating_mul(2u32.saturating_pow(*attempt))
            .min(RECONNECT_CAP);
        *attempt += 1;
        // Compare CUMULATIVE wait against the threshold. Comparing the single
        // delay could never trip it: delay caps at RECONNECT_CAP (30s), which is
        // below UNREACHABLE_AFTER (180s), so the console previously sat in
        // "reconnecting" forever and never reported the kernel as unreachable.
        *waited += delay;
        if *waited >= UNREACHABLE_AFTER {
            self.set_connection(app, ConnectionStatus::Down).await;
        }
        *self.channel.lock().await = None;
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = self.stop_notify.notified() => return true,
        }
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
