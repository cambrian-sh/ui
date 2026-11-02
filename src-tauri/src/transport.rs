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
use tonic::transport::{Channel, ClientTlsConfig};
use tonic::{Request, Status};

use crate::pb;
use crate::pb::operator_console_client::OperatorConsoleClient;
use crate::state::{DuplicateEffectKey, NodeItem, NodeReads, PipelineDryRun, PipelineFailure, PipelineGraph,
    PipelineNodeExample, PipelineSaved, PipelineTransitioned,
    PipelineSummary, PipelineValidation, Refusal,
    PipelineTermination, ShadowEffect, 
    AuthoredStep, ClassifiedInput, ConfigSchema, ConfigWriteOutcome, ConfigWriteResult,
    ConnectionStatus, ConversationMessage,
    ConversationSummary, GeneratorSpec, GeneratorTestResult, InterviewOption, InterviewQuestion,
    MCPServerConfigSpec, MCPServerTestResult,
    PlanProposal, PlanProposalResponse, PlanValidationIssue, PreviewCandidate, PreviewRanked,
    PreviewRouteResult, RoleAssignment, SkillSummary, StateOfRecord, SubmitPlanResult, ToolSummary,
    WatchAction, WatchBacktestVerdict, WatchConfigFull, WatchConfigSummary, WatchDeadLetter,
    WatchMetrics,
};

/// `WatchConfigOp` → the projection form, unabridged.
fn watch_full_from_op(c: pb::WatchConfigOp) -> WatchConfigFull {
    let action = c.action.unwrap_or_default();
    WatchConfigFull {
        id: c.id,
        name: c.name,
        description: c.description,
        source_type: c.source_type,
        source_stream_id: c.source_stream_id,
        condition: c.condition,
        condition_type: c.condition_type,
        daemon_params: c.daemon_params,
        action: WatchAction {
            r#type: action.r#type,
            target_type: action.target_type,
            target: action.target,
            payload: action.payload,
        },
        active: c.active,
        response_mode: c.response_mode,
        max_concurrent_plans: c.max_concurrent_plans,
        debounce_seconds: c.debounce_seconds,
        condition_payload_keys: c.condition_payload_keys,
        approved: c.approved,
        dry_run: c.dry_run,
        source_cron: c.source_cron,
        source_timezone: c.source_timezone,
        missed_fire_policy: c.missed_fire_policy,
    }
}

/// The projection form → `WatchConfigOp`, for register and backtest.
fn watch_op_from_full(c: &WatchConfigFull) -> pb::WatchConfigOp {
    pb::WatchConfigOp {
        id: c.id.clone(),
        name: c.name.clone(),
        description: c.description.clone(),
        source_type: c.source_type.clone(),
        source_stream_id: c.source_stream_id.clone(),
        condition: c.condition.clone(),
        condition_type: c.condition_type.clone(),
        daemon_params: Default::default(),
        action: Some(pb::WatchActionOp {
            r#type: c.action.r#type.clone(),
            target_type: c.action.target_type.clone(),
            target: c.action.target.clone(),
            payload: c.action.payload.clone(),
        }),
        active: c.active,
        response_mode: c.response_mode.clone(),
        max_concurrent_plans: c.max_concurrent_plans,
        debounce_seconds: c.debounce_seconds,
        condition_payload_keys: c.condition_payload_keys.clone(),
        approved: c.approved,
        dry_run: c.dry_run,
        source_cron: c.source_cron.clone(),
        source_timezone: c.source_timezone.clone(),
        missed_fire_policy: c.missed_fire_policy.clone(),

        // Contract 0074/0076 additions. These are OUTBOUND-EMPTY on purpose.
        //
        // `source_stream_state`, `source_stream_refcount` and `last_fires` are
        // computed BY the kernel — they describe whether the feeding daemon is
        // alive and what this watch has actually done. Sending a value for them
        // would be the client asserting liveness it cannot observe, and on a
        // register/backtest round-trip that assertion would overwrite the real
        // one. Defaulted so the kernel keeps ownership of the answer.
        source_stream_state: String::new(),
        source_stream_refcount: 0,
        last_fires: Vec::new(),

        // Arms 2..N. The console models a single action today, so it sends none —
        // and an empty `actions` is exactly "no extra arms" rather than "clear the
        // ones you have", because the kernel keeps `action` as the first arm and
        // reads the two together (domain.WatchConfig.EffectiveActions).
        actions: Vec::new(),
    }
}

/// Tauri event names emitted to the webview.
const EV_STATE: &str = "kernel://state";
const EV_TOKEN: &str = "kernel://token";

const RECONNECT_BASE: Duration = Duration::from_secs(1);
const RECONNECT_CAP: Duration = Duration::from_secs(30);
const UNREACHABLE_AFTER: Duration = Duration::from_secs(180); // ~3 min of failed attempts
/// Ceiling for a single encoded/decoded gRPC message. See the note in `client()`.
/// 512 MiB to match the kernel's `maxGRPCMessageBytes` — the operator ingest lane
/// carries whole files, so the encode (send) side must clear large uploads.
pub(crate) const MAX_MESSAGE_BYTES: usize = 512 * 1024 * 1024;

type SharedToken = Arc<StdMutex<Option<String>>>;
pub(crate) type ConsoleClient = OperatorConsoleClient<InterceptedService<Channel, AuthInterceptor>>;

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
    #[serde(flatten)]
    pub time: EventTime,
}

/// When a hit or citation's content HAPPENED (ADR-0134, contract 0099).
///
/// Flattened into `MemoryHit` and `Citation` so the webview reads one shape for
/// both. `event_time_unix_ms` is None when the kernel sent no time at all (a
/// pre-0099 kernel): that is "unknown", and must never be rendered as a date.
/// `time_source` and `time_precision` pass through verbatim -- the console picks
/// its copy from the word ("ingest_default" is the ingest time, not when the
/// content happened), so flattening them would lose the half that matters.
#[derive(Clone, serde::Serialize, Default, Debug, PartialEq)]
pub struct EventTime {
    pub event_time_unix_ms: Option<i64>,
    /// Span end for a chunk covering several timed parts. None for an instant.
    pub event_time_end_unix_ms: Option<i64>,
    /// explicit | source_metadata | inferred | ingest_default | clamped_future
    pub time_source: String,
    /// year | month | day | hour | minute | second
    pub time_precision: String,
}

impl EventTime {
    fn from_wire(
        start: Option<prost_types::Timestamp>,
        end: Option<prost_types::Timestamp>,
        time_source: String,
        time_precision: String,
    ) -> Self {
        let ms = |t: &Option<prost_types::Timestamp>| t.as_ref().map(|_| crate::state::ts_millis(t));
        Self {
            event_time_unix_ms: ms(&start),
            event_time_end_unix_ms: ms(&end),
            time_source,
            time_precision,
        }
    }
}

/// The precisions the kernel accepts on ingest (domain/event_time.go). Checked
/// here so a typo is refused at the console, not discovered as INVALID_ARGUMENT.
const TIME_PRECISIONS: &[&str] = &["year", "month", "day", "hour", "minute", "second"];

/// The ingest-side event time: an absolute instant (milliseconds since the epoch,
/// so the zone was resolved by the webview, which knows the operator's zone) and
/// the precision the operator stated. Both absent = the kernel dates the document
/// by its ingest clock and labels it `ingest_default`.
pub(crate) fn ingest_event_time(
    occurred_at_unix_ms: Option<i64>,
    time_precision: Option<String>,
) -> Result<(Option<prost_types::Timestamp>, String), String> {
    let precision = time_precision.unwrap_or_default();
    let Some(ms) = occurred_at_unix_ms else {
        if !precision.is_empty() {
            return Err("time_precision without occurred_at: say when it happened, or neither".into());
        }
        return Ok((None, String::new()));
    };
    if !precision.is_empty() && !TIME_PRECISIONS.contains(&precision.as_str()) {
        return Err(format!(
            "unknown time_precision {precision:?}; one of {}",
            TIME_PRECISIONS.join(", ")
        ));
    }
    let ts = prost_types::Timestamp {
        seconds: ms.div_euclid(1000),
        nanos: (ms.rem_euclid(1000) * 1_000_000) as i32,
    };
    Ok((Some(ts), precision))
}

/// One row of the document listing (contract 0070).
///
/// A listing row, not a document: no body, no chunks. Enough to decide what to
/// label and nothing more, so paging a large corpus stays cheap.
#[derive(Clone, serde::Serialize, Default)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub tags: Vec<String>,
    pub chunk_count: i32,
    pub created_at_unix_ms: i64,
}

/// One page of the document listing, plus the size of the whole matching set.
///
/// `total_matching` ignores paging on purpose: "50 shown" does not tell an operator
/// how much of the corpus no rule can reach, and "422 of 1163" does.
#[derive(Clone, serde::Serialize, Default)]
pub struct DocumentPage {
    pub documents: Vec<DocumentSummary>,
    pub next_cursor: String,
    pub total_matching: i32,
}

/// A ranked recall, plus the kernel's explanation when access policy shaped it.
///
/// The note is the whole point of ADR-0085 INV-3: a fail-closed model turns a
/// misconfiguration into zero rows and no error, which is indistinguishable from
/// an empty corpus. It is empty whenever policy played no part, so a UI can show
/// it unconditionally without training operators to ignore it.
#[derive(Clone, serde::Serialize, Default)]
pub struct MemoryQueryResult {
    pub hits: Vec<MemoryHit>,
    pub policy_note: String,
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
    #[serde(flatten)]
    pub time: EventTime,
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
            time: EventTime::from_wire(
                c.event_time,
                c.event_time_end,
                c.time_source,
                c.time_precision,
            ),
        }
    }
}

/// A grounded, cited answer (ADR-0081).
#[derive(Clone, serde::Serialize, Default)]
pub struct AnswerMemory {
    pub status: String,
    pub answer: String,
    pub citations: Vec<Citation>,
    /// Set when access policy CAUSED this abstention, rather than the corpus.
    /// Empty when policy played no part (ADR-0085 INV-3).
    pub policy_note: String,
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
            time: EventTime::from_wire(
                m.event_time,
                m.event_time_end,
                m.time_source,
                m.time_precision,
            ),
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

/// Normalize what the operator typed into a dialable endpoint URI.
///
/// An explicit `http://`/`https://` scheme is honoured as-is. A bare
/// `localhost`/IP-literal target is the local plaintext case (`http://`).
/// Anything else is a remote DOMAIN — e.g. `cambrian.dorkodu.com` behind the
/// Cloudflare gRPC proxy — and gets `https://`: TLS on the remote hop is the
/// rule here, and the kernel's SEC-03 loopback posture means a remote
/// plaintext dial could never reach a kernel anyway.
fn normalize_endpoint(raw: &str) -> String {
    let ep = raw.trim();
    if ep.starts_with("http://") || ep.starts_with("https://") {
        return ep.to_string();
    }
    let host = ep.strip_prefix('[').map_or_else(
        || ep.split(':').next().unwrap_or(ep).to_string(),
        |rest| rest.split(']').next().unwrap_or(rest).to_string(),
    );
    let local = host == "localhost" || host.parse::<std::net::IpAddr>().is_ok();
    if local {
        format!("http://{ep}")
    } else {
        format!("https://{ep}")
    }
}

impl Transport {
    /// Dial an endpoint, with TLS (native roots) whenever the normalized URI is
    /// `https://`. Shared by `client()` and `authed_channel()` so the two can
    /// never disagree about transport security.
    async fn dial(ep_raw: &str) -> Result<Channel, String> {
        let ep = normalize_endpoint(ep_raw);
        let mut endpoint =
            Channel::from_shared(ep.clone()).map_err(|e| format!("bad endpoint: {e}"))?;
        if ep.starts_with("https://") {
            endpoint = endpoint
                .tls_config(ClientTlsConfig::new().with_native_roots())
                .map_err(|e| format!("tls: {e}"))?;
        }
        endpoint
            .connect()
            .await
            .map_err(|e| format!("connect: {e}"))
    }

    /// Connect (lazily) and return a client with the auth interceptor attached.
    pub(crate) async fn client(&self) -> Result<ConsoleClient, String> {
        let mut guard = self.channel.lock().await;
        if guard.is_none() {
            let ep = self
                .endpoint
                .lock()
                .await
                .clone()
                .ok_or_else(|| "not connected: call login first".to_string())?;
            let channel = Self::dial(&ep).await?;
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

    /// Connect (lazily) and return the raw authed channel, for a plane other than
    /// `OperatorConsole`.
    ///
    /// ADR-0088: a premium plane rides the SAME connection and the SAME bearer
    /// token as the operator console, because it is mounted on the same kernel
    /// server behind the same auth interceptors (ADR-0073). Opening a second
    /// connection would be a second thing to authenticate, reconnect, and reason
    /// about — and it would make the premium plane look like a side door rather
    /// than an extension of the plane we already trust.
    pub(crate) async fn authed_channel(&self) -> Result<(Channel, AuthInterceptor), String> {
        let mut guard = self.channel.lock().await;
        if guard.is_none() {
            let ep = self
                .endpoint
                .lock()
                .await
                .clone()
                .ok_or_else(|| "not connected: call login first".to_string())?;
            let channel = Self::dial(&ep).await?;
            *guard = Some(channel);
        }
        Ok((
            guard.as_ref().unwrap().clone(),
            AuthInterceptor {
                token: self.token.clone(),
            },
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

    /// Persist the full connection (endpoint, username, password) in the OS
    /// keychain so the console can reconnect on launch without re-prompting.
    ///
    /// The password is stored ONLY because the kernel's login token is ephemeral
    /// (an in-memory table entry, lost on kernel restart), so the token alone
    /// cannot re-establish a session. It lives in the OS keychain, never in a
    /// plaintext file, and is cleared on `disconnect`.
    fn save_connection(endpoint: &str, username: &str, password: &str) {
        // Failures are LOGGED, not swallowed. A silent `let _ =` here is what hid the real
        // bug: keyring's mock store accepted every write and forgot it, so "remember me"
        // reported success and persisted nothing. If the keychain is unavailable the
        // operator should learn it from the log, not from re-typing a password every launch.
        match keyring::Entry::new("cambrian-ui", "saved-connection") {
            Ok(entry) => {
                let blob = format!(
                    "{endpoint}
{username}
{password}"
                );
                if let Err(err) = entry.set_password(&blob) {
                    tracing::warn!(
                        ?err,
                        "keychain write failed; this instance will not be remembered"
                    );
                }
            }
            Err(err) => {
                tracing::warn!(
                    ?err,
                    "keychain unavailable; this instance will not be remembered"
                );
            }
        }
    }

    fn clear_saved_connection() {
        if let Ok(entry) = keyring::Entry::new("cambrian-ui", "saved-connection") {
            let _ = entry.delete_credential();
        }
    }

    /// Read the saved connection, if any. Returns `(endpoint, username, password)`.
    pub fn saved_connection() -> Option<(String, String, String)> {
        let entry = keyring::Entry::new("cambrian-ui", "saved-connection")
            .inspect_err(|err| tracing::warn!(?err, "keychain unavailable; cannot auto-connect"))
            .ok()?;
        // NoEntry is the ordinary "nothing saved yet" case and must stay quiet; anything
        // else means auto-connect will fail every launch, which is worth seeing.
        let blob = match entry.get_password() {
            Ok(v) => v,
            Err(keyring::Error::NoEntry) => return None,
            Err(err) => {
                tracing::warn!(?err, "keychain read failed; cannot auto-connect");
                return None;
            }
        };
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

    /// Re-authenticate an expired session in place, without disturbing the feed.
    ///
    /// Operator tokens are random bytes in an in-memory map on the kernel side, so
    /// a kernel restart invalidates every one of them. Retrying the feed with a
    /// dead token can never succeed no matter how patient the loop is -- which is
    /// why a restarted kernel left the console stuck in `reconnecting` while the
    /// kernel itself was up and answering.
    ///
    /// This uses the credentials the operator already chose to save for
    /// auto-connect. Nothing new is stored, and an operator who did NOT tick
    /// remember-me is told to sign in again rather than being silently logged
    /// into an instance they did not ask to rejoin.
    ///
    /// Returns true when a fresh token was obtained.
    async fn reauthenticate(&self, app: &AppHandle) -> bool {
        let endpoint = match self.endpoint.lock().await.clone() {
            Some(e) => e,
            None => return false,
        };
        let Some((saved_endpoint, username, password)) = Self::saved_connection() else {
            self.set_fault(
                app,
                "the kernel restarted, which ended this session -- sign in again".to_string(),
            )
            .await;
            self.set_connection(app, ConnectionStatus::Down).await;
            return false;
        };
        // Only rejoin the instance these credentials were saved for. A console
        // pointed at a different endpoint must not silently authenticate there.
        if saved_endpoint != endpoint {
            return false;
        }

        let mut client = match self.client().await {
            Ok(c) => c,
            // The kernel is not back yet: not an auth problem, so let the
            // ordinary reconnect backoff handle it.
            Err(_) => return false,
        };
        match client
            .login(Request::new(pb::LoginRequest { username, password }))
            .await
        {
            Ok(resp) => {
                let resp = resp.into_inner();
                self.set_token(Some(resp.token.clone()));
                {
                    let mut st = self.state.lock().await;
                    st.role = Some(resp.role.clone());
                }
                tracing::info!("session re-established after a kernel restart");
                true
            }
            Err(e) => {
                // Saved credentials that no longer work is a dead end for the
                // loop: say so instead of retrying them every 30 seconds.
                self.set_fault(app, format!("sign in again: {}", e.message()))
                    .await;
                self.set_connection(app, ConnectionStatus::Down).await;
                false
            }
        }
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

    /// Sign out: revoke this console's bearer token on the kernel (ADR-0130 D5,
    /// contract 0099 `Logout`), then tear the session down locally exactly as
    /// `disconnect` does -- token, keychain copy, saved credentials, folded state.
    ///
    /// The local teardown happens WHATEVER the kernel answered. An operator who
    /// asked to sign out must end up signed out of this console; what the outcome
    /// reports is whether the token is also dead on the kernel, because a token
    /// that was only forgotten locally stays valid there until its TTL runs out,
    /// and that difference is the reason Logout exists.
    pub async fn logout(&self, app: &AppHandle) -> Result<LogoutOutcome, String> {
        let outcome = logout_outcome(self.revoke_remote().await);
        if !outcome.revoked {
            tracing::warn!(note = %outcome.note, "logout: token not revoked on the kernel");
        }
        self.disconnect(app).await?;
        Ok(outcome)
    }

    /// The Logout RPC alone. Separate from `logout` so the verdict can be tested
    /// without an AppHandle or the OS keychain.
    async fn revoke_remote(&self) -> Result<(), Status> {
        if self.token.lock().unwrap().is_none() {
            // Nothing to revoke: never signed in, or already torn down.
            return Err(Status::unauthenticated("no session token"));
        }
        let mut client = self.client().await.map_err(Status::unavailable)?;
        // Bounded: sign-out must not hang on a kernel that has gone away.
        match tokio::time::timeout(
            Duration::from_secs(5),
            client.logout(Request::new(pb::LogoutRequest {})),
        )
        .await
        {
            Ok(r) => r.map(|_| ()),
            Err(_) => Err(Status::deadline_exceeded("the kernel did not answer within 5s")),
        }
    }

    // ---- Reads -----------------------------------------------------------

    /// Seed state from a snapshot.
    ///
    /// Returns the gRPC CODE alongside the message: the feed loop has to tell an
    /// expired session (retrying forever cannot fix it) from an unreachable
    /// kernel (retrying is exactly the fix).
    async fn snapshot_into_state(&self) -> Result<(), (tonic::Code, String)> {
        // Unavailable, not Unauthenticated: a channel that will not open is a
        // kernel that is not there, which the reconnect backoff handles.
        let mut client = self
            .client()
            .await
            .map_err(|e| (tonic::Code::Unavailable, e))?;
        let snap = client
            .snapshot(Request::new(pb::SnapshotRequest {}))
            .await
            .map_err(|e| (e.code(), format!("snapshot: {}", e.message())))?
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

    /// Apply or remove one classification label on a document or memory.
    ///
    /// The kernel routes a DOCUMENT id through the transactional retag (ADR-0093), so
    /// the authoritative row and every one of its chunks move together; anything else
    /// is tagged in place. Operator-only, idempotent on command_id, audited.
    /// Enumerate documents by ROW (contract 0070).
    ///
    /// The counterpart to `query_memory`, not a variant of it. Search answers "find
    /// the document that says X"; this answers "which of my documents have no
    /// labels?" — a question with no query text, because the operator does not yet
    /// know what those documents say. Policy acts only on labels, so an unlabelled
    /// document is invisible to the policy model rather than denied.
    pub async fn list_documents(
        &self,
        limit: i32,
        cursor: String,
        unlabelled_only: bool,
        id_prefix: String,
    ) -> Result<DocumentPage, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_documents(Request::new(pb::ListDocumentsOpRequest {
                limit,
                cursor,
                unlabelled_only,
                id_prefix,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(DocumentPage {
            documents: resp
                .documents
                .into_iter()
                .map(|d| DocumentSummary {
                    id: d.id,
                    title: d.title,
                    source_type: d.source_type,
                    tags: d.tags,
                    chunk_count: d.chunk_count,
                    created_at_unix_ms: d.created_at_unix_ms,
                })
                .collect(),
            next_cursor: resp.next_cursor,
            total_matching: resp.total_matching,
        })
    }

    pub async fn tag_memory(
        &self,
        doc_id: String,
        tag: String,
        add: bool,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .tag_memory(Request::new(pb::TagMemoryRequest {
                command_id: new_command_id(),
                reason,
                doc_id,
                tag,
                add,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    // ---- Conversations (ADR-0084 D9 OSS chat lane) ----------------------
    //
    // Distinct from create_session/send_message above, which drive the task PLANNER: a
    // conversation turn is owned by a single agent loop on the kernel's chat worker pool and
    // is never decomposed into a plan. send_turn returns the agent's reply synchronously.
    // conversation_id is client-generated (a UUID here) so open is idempotent on it.

    pub async fn open_conversation(
        &self,
        conversation_id: String,
        title: String,
        profile: String,
        policy: String,
        reason: String,
    ) -> Result<String, String> {
        let mut client = self.client().await?;
        let resp = client
            .open_conversation(Request::new(pb::OpenConversationOpRequest {
                command_id: new_command_id(),
                reason,
                conversation_id,
                title,
                profile,
                policy,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.conversation_id)
    }

    pub async fn send_turn(
        &self,
        conversation_id: String,
        text: String,
        reason: String,
    ) -> Result<Option<ConversationMessage>, String> {
        let mut client = self.client().await?;
        let resp = client
            .send_turn(Request::new(pb::SendTurnOpRequest {
                command_id: new_command_id(),
                reason,
                conversation_id,
                text,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.reply.map(ConversationMessage::from))
    }

    pub async fn list_conversations(&self, limit: i32) -> Result<Vec<ConversationSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_conversations(Request::new(pb::ListConversationsOpRequest { limit }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .conversations
            .into_iter()
            .map(ConversationSummary::from)
            .collect())
    }

    pub async fn list_conversation_messages(
        &self,
        conversation_id: String,
        after_seq: i64,
        limit: i32,
    ) -> Result<Vec<ConversationMessage>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_conversation_messages(Request::new(pb::ListConversationMessagesOpRequest {
                conversation_id,
                after_seq,
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .messages
            .into_iter()
            .map(ConversationMessage::from)
            .collect())
    }

    pub async fn close_conversation(
        &self,
        conversation_id: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .close_conversation(Request::new(pb::CloseConversationOpRequest {
                command_id: new_command_id(),
                reason,
                conversation_id,
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

    /// Seal a session (contract 0064). Unlike pause/resume this needs no live execution —
    /// the common case is closing work that has already stopped.
    pub async fn close_session(&self, session_id: String, reason: String) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .close_session(Request::new(pb::SessionCommandRequest {
                command_id: new_command_id(),
                reason,
                session_id,
            }))
            .await
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

    /// Hot-apply numeric runtime tunables without a restart (ADR-0054).
    ///
    /// The RPC has been on the pinned contract since 0047 but was never wired
    /// here, so the console had no way to change a tunable at all. Two
    /// properties of the kernel side shape how the caller must behave:
    ///
    /// - **Partial sets merge** over the current live values, so sending only
    ///   the fields the operator touched is correct and does not clear the rest.
    /// - **Unknown keys are ignored** (reported kernel-side), which is exactly
    ///   the UI-015 "skip and warn" behaviour a stale schema needs — a retired
    ///   axis cannot be written back in by accident.
    ///
    /// Edits are ephemeral: they live in memory and `config.json` stays the boot
    /// default. That is a property worth surfacing, not hiding — a tunable that
    /// silently reverts on restart is a very expensive surprise.
    pub async fn set_runtime_config(
        &self,
        params: std::collections::HashMap<String, f64>,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_runtime_config(Request::new(pb::SetRuntimeConfigRequest {
                command_id: new_command_id(),
                reason,
                params,
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
                classification_tags: t.classification_tags,
                effects: t.effects,
                effects_inferred: t.effects_inferred,
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

    // ── Reactive: the six watch RPCs that were on the contract but unwired ───
    //
    // All of these have existed on the pinned contract since the REACT-0x work
    // landed; the console simply never picked them up, so the whole pipeline
    // surface was unreachable. Wiring them needs no kernel change.

    /// Every watch config, unabridged.
    ///
    /// Distinct from `list_watches`, which maps down to the lossy
    /// `WatchConfigSummary` the old list screen wanted. The pipeline builder
    /// needs the condition, the action, the debounce window and the cron
    /// fields, so this returns the config as the kernel holds it.
    pub async fn list_watch_configs(&self) -> Result<Vec<WatchConfigFull>, String> {
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
        Ok(resp.configs.into_iter().map(watch_full_from_op).collect())
    }

    pub async fn register_watch(
        &self,
        config: WatchConfigFull,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .register_watch(Request::new(pb::RegisterWatchOpRequest {
                command_id: new_command_id(),
                reason,
                config: Some(watch_op_from_full(&config)),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn delete_watch(&self, watch_id: String, reason: String) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .delete_watch(Request::new(pb::DeleteWatchOpRequest {
                command_id: new_command_id(),
                reason,
                watch_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn set_watch_active(
        &self,
        watch_id: String,
        active: bool,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_watch_active(Request::new(pb::SetWatchActiveOpRequest {
                command_id: new_command_id(),
                reason,
                watch_id,
                active,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn list_watch_dead_letters(
        &self,
        limit: i32,
    ) -> Result<Vec<WatchDeadLetter>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_watch_dead_letters(Request::new(pb::ListWatchDeadLettersOpRequest { limit }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .entries
            .into_iter()
            .map(|e| WatchDeadLetter {
                id: e.id,
                watch_id: e.watch_id,
                action_type: e.action_type,
                key: e.key,
                reason: e.reason,
                signal_stream_id: e.signal_stream_id,
                signal_raw_text: e.signal_raw_text,
                failed_at_unix_ms: e.failed_at_unix_ms,
            })
            .collect())
    }

    pub async fn get_watch_metrics(&self) -> Result<Vec<WatchMetrics>, String> {
        let mut client = self.client().await?;
        let resp = client
            .get_watch_metrics(Request::new(pb::GetWatchMetricsOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .metrics
            .into_iter()
            .map(|m| WatchMetrics {
                watch_id: m.watch_id,
                signals_seen: m.signals_seen,
                condition_fired: m.condition_fired,
                condition_suppressed: m.condition_suppressed,
                dry_run_would_fire: m.dry_run_would_fire,
                action_failed: m.action_failed,
                dead_lettered: m.dead_lettered,
                mean_condition_latency_ms: m.mean_condition_latency_ms,
            })
            .collect())
    }

    /// Replay the signal journal through a candidate config. **Never acts.**
    pub async fn backtest_watch(
        &self,
        config: WatchConfigFull,
        after_seq: u64,
    ) -> Result<Vec<WatchBacktestVerdict>, String> {
        let mut client = self.client().await?;
        let resp = client
            .backtest_watch(Request::new(pb::BacktestWatchOpRequest {
                config: Some(watch_op_from_full(&config)),
                after_seq,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .verdicts
            .into_iter()
            .map(|v| WatchBacktestVerdict {
                seq: v.seq,
                stream_id: v.stream_id,
                raw_text: v.raw_text,
                would_fire: v.would_fire,
                eval_error: v.eval_error,
            })
            .collect())
    }

    /// Score a step's capability contract over caller-supplied candidates.
    ///
    /// The RPC takes inline profiles by design (deterministic, no live fleet),
    /// which is exactly why the DAG builder cannot yet answer "who would take
    /// this step" against the real registry — see report.md §4.12.
    pub async fn preview_route(
        &self,
        task_desc: String,
        required_capabilities: Vec<String>,
        candidates: Vec<PreviewCandidate>,
    ) -> Result<PreviewRouteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .preview_route(Request::new(pb::PreviewRouteOpRequest {
                task_desc,
                required_capabilities,
                candidates: candidates
                    .into_iter()
                    .map(|c| pb::PreviewCandidateOp {
                        agent_id: c.agent_id,
                        r#trait: c.trait_name,
                        success_rate: c.success_rate,
                        trust_score: c.trust_score,
                        network_latency_ms: c.network_latency_ms,
                        computation_latency_ms: c.computation_latency_ms,
                        context_growth_bytes: c.context_growth_bytes,
                        provisional: c.provisional,
                        avg_cost_per_task: c.avg_cost_per_task,
                        capability_stats: Default::default(),
                    })
                    .collect(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PreviewRouteResult {
            ranked: resp
                .ranked
                .into_iter()
                .map(|r| PreviewRanked {
                    agent_id: r.agent_id,
                    score: r.score,
                    success_rate: r.success_rate,
                    trust_score: r.trust_score,
                    latency_term: r.latency_term,
                    cost_term: r.cost_term,
                    provisional: r.provisional,
                })
                .collect(),
            arm: resp.arm,
        })
    }

    /// Contract 0087: the authored reactive pipelines.
    ///
    /// Returns an empty list rather than an error when the kernel has no
    /// pipeline runtime — "this build authors none" is a true answer, and a
    /// console that has to special-case an error to render an empty panel will
    /// eventually render the error instead.
    /// What actually reached one node, newest first.
    ///
    /// The inspector could report that a node RAN and never what ran through
    /// it — an operator watching their own data saw "effect confirmed" and not
    /// one value that landed.
    pub async fn list_node_items(
        &self,
        pipeline_id: String,
        node_id: String,
        limit: i32,
    ) -> Result<Vec<NodeItem>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_node_items(Request::new(pb::ListNodeItemsOpRequest {
                pipeline_id,
                node_id,
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .items
            .into_iter()
            .map(|i| NodeItem {
                run_id: i.run_id,
                item_key: i.item_key,
                state: i.state,
                attempt: i.attempt,
                input_json: i.input_json,
                result_json: i.result_json,
                error: i.error,
                evidence_ref: i.evidence_ref,
                updated_at: i.updated_at,
                iter_path: i.iter_path,
            })
            .collect())
    }

    pub async fn list_pipelines(&self) -> Result<Vec<PipelineSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_pipelines(Request::new(pb::ListPipelinesOpRequest {
                armed_only: false,
                ingress_id: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .pipelines
            .into_iter()
            .map(|p| PipelineSummary {
                pipeline_id: p.pipeline_id,
                revision: p.revision,
                name: p.name,
                state: p.state,
                trigger_type: p.trigger_type,
                trigger_ref: p.trigger_ref,
                node_count: p.node_count,
                edge_count: p.edge_count,
                effect_node_count: p.effect_node_count,
                mapping_revision: p.mapping_revision,
                plan_checksum: p.plan_checksum,
                semantics_checksum: p.semantics_checksum,
                generated: p.generated,
                dry_run: p.dry_run,
                approved: p.approved,
                entry_live: p.entry_live,
            })
            .collect())
    }

    /// Read one authored revision plus its current refusals (contract 0089).
    pub async fn get_pipeline(
        &self,
        pipeline_id: String,
        revision: i32,
    ) -> Result<PipelineGraph, String> {
        let mut client = self.client().await?;
        let resp = client
            .get_pipeline(Request::new(pb::GetPipelineOpRequest {
                pipeline_id,
                revision,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PipelineGraph {
            refused: resp.refused,
            summary: resp.summary.map(pipeline_summary_from).unwrap_or_default(),
            graph_json: resp.graph_json,
            refusals: resp.refusals.into_iter().map(refusal_from).collect(),
            reads: resp
                .reads
                .into_iter()
                .map(|r| NodeReads { node: r.node, paths: r.paths })
                .collect(),
            field_schema_json: resp.field_schema_json,
        })
    }

    /// Compile a graph document WITHOUT storing it (contract 0089).
    ///
    /// Safe to call on every change: the RPC has no power to store or
    /// transition, which is why an editor is given this one and not Publish.
    pub async fn validate_pipeline(
        &self,
        graph_json: String,
    ) -> Result<PipelineValidation, String> {
        let mut client = self.client().await?;
        let resp = client
            .validate_pipeline(Request::new(pb::ValidatePipelineOpRequest { graph_json }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PipelineValidation {
            refused: resp.refused,
            refusals: resp.refusals.into_iter().map(refusal_from).collect(),
            node_count: resp.node_count,
            effect_node_count: resp.effect_node_count,
            plan_checksum: resp.plan_checksum,
            semantics_checksum: resp.semantics_checksum,
            field_schema_json: resp.field_schema_json,
        })
    }

    /// Store an edited graph as a new draft revision (contract 0090).
    ///
    /// Creates a draft and nothing further. Publishing and arming stay on the
    /// lifecycle, where each is an explicit act with its own gate.
    pub async fn save_pipeline(
        &self,
        graph_json: String,
        command_id: String,
    ) -> Result<PipelineSaved, String> {
        let mut client = self.client().await?;
        let resp = client
            .save_pipeline(Request::new(pb::SavePipelineOpRequest {
                graph_json,
                command_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PipelineSaved {
            refused: resp.refused,
            pipeline_id: resp.pipeline_id,
            revision: resp.revision,
            refusals: resp.refusals.into_iter().map(refusal_from).collect(),
        })
    }

    /// Move one revision along its lifecycle (contract 0093): publish, arm,
    /// pause, retire. Refusals name the gate that held, in the registry's own
    /// words, inside the response.
    pub async fn transition_pipeline(
        &self,
        pipeline_id: String,
        revision: i32,
        to_state: String,
        command_id: String,
        reason: String,
    ) -> Result<PipelineTransitioned, String> {
        let mut client = self.client().await?;
        let resp = client
            .transition_pipeline(Request::new(pb::TransitionPipelineOpRequest {
                pipeline_id,
                revision,
                to_state,
                command_id,
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PipelineTransitioned {
            refused: resp.refused,
            pipeline_id: resp.pipeline_id,
            revision: resp.revision,
            state: resp.state,
        })
    }

    /// Shadow-run a pipeline over its captured deliveries (contract 0088).
    ///
    /// A refusal comes back INSIDE the response, not as a transport error: it is
    /// a named constraint the console renders verbatim, and an error status
    /// would flatten "nothing has been captured yet" and "the graph does not
    /// compile" into the same red box.
    pub async fn dry_run_pipeline(
        &self,
        pipeline_id: String,
        revision: i32,
        sample_limit: i32,
    ) -> Result<PipelineDryRun, String> {
        let mut client = self.client().await?;
        let resp = client
            .dry_run_pipeline(Request::new(pb::DryRunPipelineOpRequest {
                pipeline_id,
                revision,
                sample_limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PipelineDryRun {
            refused: resp.refused,
            run_id: resp.run_id,
            samples: resp.samples,
            effects: resp
                .effects
                .into_iter()
                .map(|e| ShadowEffect {
                    node: e.node,
                    kind: e.kind,
                    effect_key: e.effect_key,
                    item_key: e.item_key,
                    summary: e.summary,
                })
                .collect(),
            duplicates: resp
                .duplicates
                .into_iter()
                .map(|d| DuplicateEffectKey {
                    effect_key: d.effect_key,
                    count: d.count,
                    nodes: d.nodes,
                })
                .collect(),
            terminations: resp
                .terminations
                .into_iter()
                .map(|t| PipelineTermination {
                    node: t.node,
                    port: t.port,
                    reason: t.reason,
                    count: t.count,
                })
                .collect(),
            failures: resp
                .failures
                .into_iter()
                .map(|f| PipelineFailure {
                    node: f.node,
                    item_key: f.item_key,
                    err: f.err,
                })
                .collect(),
            elapsed_ms: resp.elapsed_ms,
            source: resp.source,
            node_examples: resp
                .node_examples
                .into_iter()
                .map(|ex| PipelineNodeExample {
                    node: ex.node,
                    item_key: ex.item_key,
                    value_json: ex.value_json,
                    result_json: ex.result_json,
                })
                .collect(),
        })
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
        occurred_at_unix_ms: Option<i64>,
        time_precision: Option<String>,
    ) -> Result<(String, bool), String> {
        // Validated before dialling: a bad precision is the operator's to fix,
        // and the kernel would only refuse it with INVALID_ARGUMENT anyway.
        let (occurred_at, time_precision) = ingest_event_time(occurred_at_unix_ms, time_precision)?;
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
                // ADR-0134 (contract 0099): when the operator said the content
                // happened. Unset = the kernel dates it by its ingest clock and labels
                // it `ingest_default`. `parts` (per-message times) has no console
                // input; a transcript is ingested by an agent, not pasted here.
                occurred_at,
                time_precision,
                ..Default::default()
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
                // Contract 0099: reference_time / event window (ADR-0134) unset.
                ..Default::default()
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(AnswerMemory {
            status: resp.status,
            answer: resp.answer,
            citations: resp.citations.into_iter().map(Citation::from).collect(),
            // The kernel only sets this when policy actually shaped the outcome,
            // so it can be rendered unconditionally without teaching operators to
            // ignore it.
            policy_note: resp.policy_note.map(|d| d.explain).unwrap_or_default(),
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
    ) -> Result<MemoryQueryResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .query_memory(Request::new(pb::QueryMemoryRequest {
                query,
                top_k,
                source,
                session,
                min_importance,
                // Contract 0099: reference_time / event window (ADR-0134) unset.
                ..Default::default()
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        // ADR-0085 INV-3: when policy shaped the result set the kernel says so.
        // Carrying it through matters most when the list is EMPTY — that is the
        // case an operator would otherwise read as "there is no data".
        let policy_note = resp.policy_note.map(|d| d.explain).unwrap_or_default();
        Ok(MemoryQueryResult {
            hits: resp.results.into_iter().map(MemoryHit::from).collect(),
            policy_note,
        })
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
            if let Err((code, e)) = self.snapshot_into_state().await {
                // A kernel restart invalidates every operator token: they are
                // random bytes in an in-memory map, so nothing survives the
                // process. Retrying with a dead token can never succeed, and
                // the console sat in `reconnecting` against a kernel that was
                // up and healthy.
                if code == tonic::Code::Unauthenticated && self.reauthenticate(&app).await {
                    continue;
                }
                self.set_fault(&app, e).await;
                if self.backoff(&app, &mut attempt, &mut waited).await {
                    return;
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
                    // Same as the snapshot path: a token the kernel no longer
                    // knows is not something patience fixes.
                    if e.code() == tonic::Code::Unauthenticated
                        && self.reauthenticate(&app).await
                    {
                        continue;
                    }
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
                            if let Err((_, e)) = self.snapshot_into_state().await {
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
        let base = RECONNECT_BASE
            .saturating_mul(2u32.saturating_pow(*attempt))
            .min(RECONNECT_CAP);
        // +/-10% jitter, so several consoles reconnecting to one kernel do not
        // arrive in lockstep every 30 seconds.
        let delay = jittered(base);
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
        // NEVER give up. This used to return `*attempt > 8`, and every caller
        // treats true as "stop the loop and return" -- so after roughly 150
        // seconds of failed attempts the feed loop EXITED, permanently. A kernel
        // that came back afterwards could not be noticed, because nothing was
        // watching any more, and the console sat at "kernel unreachable" until
        // someone restarted the app.
        //
        // "Unreachable" is a STATE TO DISPLAY, not a reason to stop trying. It is
        // already surfaced above by the cumulative-wait check, and the interval is
        // capped at 30s, so retrying forever costs one connect attempt every half
        // minute. Only an explicit disconnect stops this loop -- the select! arm
        // above.
        false
    }
}

#[derive(Clone, serde::Serialize)]
struct TokenChunk {
    session_id: String,
    step_index: i32,
    text: String,
}

pub(crate) fn new_command_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Project a SetConfigOpResponse without collapsing its per-key verdicts.
///
/// A partial write can partly succeed, and the effect (`live`,
/// `restart_required`, `shadowed`, `rejected`) is the half an operator acts on.
/// Flattening it to a boolean is what makes a stored-but-inert setting look
/// applied.
fn config_write_result(resp: pb::SetConfigOpResponse) -> ConfigWriteResult {
    ConfigWriteResult {
        command_id: resp.command_id,
        deduped: resp.deduped,
        outcomes: resp
            .outcomes
            .into_iter()
            .map(|o| ConfigWriteOutcome {
                key: o.key,
                stored: o.stored,
                effect: o.effect,
                shadowed_by: o.shadowed_by,
                error: o.error,
                written_to: o.written_to,
                overrides_file: o.overrides_file,
                overrides_value: o.overrides_value,
            })
            .collect(),
    }
}

/// What a sign-out achieved on the kernel. The local session is always gone.
#[derive(Clone, serde::Serialize, Debug, PartialEq)]
pub struct LogoutOutcome {
    /// True when the token can no longer be used against the kernel.
    pub revoked: bool,
    /// Empty on a clean revoke; otherwise what the operator should know.
    pub note: String,
}

/// Turn the Logout RPC's answer into what the console tells the operator.
pub(crate) fn logout_outcome(r: Result<(), Status>) -> LogoutOutcome {
    match r {
        Ok(()) => LogoutOutcome {
            revoked: true,
            note: String::new(),
        },
        // The kernel refused the token at its auth gate: it was already revoked or
        // expired (or a kernel restart dropped it). Dead either way.
        Err(e) if e.code() == tonic::Code::Unauthenticated => LogoutOutcome {
            revoked: true,
            note: "the kernel had already ended this session".into(),
        },
        Err(e) if e.code() == tonic::Code::Unimplemented => LogoutOutcome {
            revoked: false,
            note: "this kernel predates Logout (contract 0099): the token was forgotten here \
                   but stays valid on the kernel until it expires"
                .into(),
        },
        Err(e) => LogoutOutcome {
            revoked: false,
            note: format!(
                "could not revoke the token on the kernel ({}): it was forgotten here but \
                 stays valid there until it expires",
                e.message()
            ),
        },
    }
}

pub(crate) fn map_status(e: Status) -> String {
    format!("{}: {}", e.code(), e.message())
}

// -- Contract 0072-0076: generator, config, classification and plan lanes -----
//
// Each is a straight projection of the kernel's answer. Where the kernel does not
// serve a field the TS type declares, the value here is chosen to read as "not
// reported" -- never as a measurement the kernel did not take.
impl Transport {
    pub async fn list_generators(&self) -> Result<Vec<GeneratorSpec>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_generators(Request::new(pb::ListGeneratorsOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .generators
            .into_iter()
            .map(|g| GeneratorSpec {
                id: g.id,
                protocol: g.provider,
                endpoint: g.endpoint,
                model: g.model,
                timeout_ms: g.timeout_ms,
                // The DECLARED half (contract 0083). Reported so an edit
                // round-trips: reconstructing these on save wrote an invented
                // `false` over a true native_tools declaration, which silently
                // disables tool-calling.
                capability_tags: g.capabilities,
                native_tools: g.native_tools,
                disable_thinking: g.disable_thinking,
                breaker: g.breaker_state,
                recent_failures: g.recent_failures,
                // The kernel tracks breaker state, not latency percentiles.
                // -1, because 0 ms would claim an instantaneous endpoint.
                p50_latency_ms: -1,
                p99_latency_ms: -1,
                // -1 = not tracked (contract 0072). The kernel has no per-generator
                // daily accounting; 0 would make a busy generator look idle.
                tokens_today: if g.tokens_in_today < 0 || g.tokens_out_today < 0 {
                    -1
                } else {
                    g.tokens_in_today + g.tokens_out_today
                },
                calls_today: g.calls_today,
                latency_samples: Vec::new(),
                key_configured: g.key_configured,
                key_last_four: g.key_last_four,
                key_source: g.key_source,
                is_default: g.is_default,
            })
            .collect())
    }

    pub async fn list_role_assignments(&self) -> Result<Vec<RoleAssignment>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_role_assignments(Request::new(pb::ListRoleAssignmentsOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .assignments
            .into_iter()
            .map(|r| RoleAssignment {
                role: r.role,
                generator_id: r.generator_id.clone(),
                // resolved == false means the role points at a generator that does
                // not exist, so it silently falls back to the default. That is the
                // whole reason this field is here.
                falling_back_to: if r.resolved {
                    None
                } else {
                    Some(r.generator_id)
                },
            })
            .collect())
    }

    /// Contract 0096: the WRITE half of `list_role_assignments`.
    ///
    /// The kernel stores the binding durably (per-role key on the ADR-0101
    /// store) and hot-applies it to the live provider, so the reported effect
    /// is `live` — the organ's next call goes to the new generator. The
    /// verdict travels through untouched for the same reason save_generator's
    /// does: `shadowed` and `rejected` are states the operator must see.
    pub async fn set_role_assignment(
        &self,
        role: String,
        generator_id: String,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .set_role_assignment(Request::new(pb::SetRoleAssignmentOpRequest {
                command_id: new_command_id(),
                reason,
                role,
                generator_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn test_generator(&self, id: String) -> Result<GeneratorTestResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .test_generator(Request::new(pb::TestGeneratorOpRequest {
                generator_id: id.clone(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        // The verdict is the KERNEL's now. This used to compare model_served
        // against the generator ID -- a different string entirely -- so a
        // correctly-served model reported a mismatch while the panel displayed
        // two identical values beside it.
        let _ = &id;
        Ok(GeneratorTestResult {
            reachable: resp.ok,
            round_trip_ms: resp.latency_ms,
            // A probe that came back at all authenticated; a credential failure
            // surfaces as ok=false with the endpoint's own words in error.
            authenticated: resp.ok,
            model_served: resp.model_served,
            model_requested: resp.model_requested,
            model_matches: resp.model_matches,
            // Whether tool-calling was exercised AT ALL. False means not tested,
            // which the console must not draw as a failure.
            native_tools_checked: resp.native_tools_checked,
            native_tools_ok: resp.native_tools_ok,
            tokens_in: -1,
            tokens_out: -1,
            tokens_cached: -1,
            error: resp.error,
        })
    }

    /// Contract 0083: create or replace a generator.
    ///
    /// The kernel stores the WHOLE list and reports the effect, which is
    /// `restart_required` -- generators are built once, at boot, into the
    /// provider's routing table. That verdict is passed through rather than
    /// flattened into ok/failed: "saved" alone would leave an operator watching
    /// traffic go to a model they believe they replaced.
    pub async fn save_generator(
        &self,
        generator: GeneratorSpec,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .save_generator(Request::new(pb::SaveGeneratorOpRequest {
                generator: Some(pb::GeneratorSpecOp {
                    id: generator.id,
                    // `protocol` in the console is the kernel's `provider`: the
                    // wire protocol, not the vendor.
                    provider: generator.protocol,
                    model: generator.model,
                    endpoint: generator.endpoint,
                    timeout_ms: generator.timeout_ms,
                    capabilities: generator.capability_tags,
                    native_tools: generator.native_tools,
                    disable_thinking: generator.disable_thinking,
                    // A VARIABLE NAME never travels from this form; the key
                    // itself has exactly one path onto the plane.
                    api_key_env: String::new(),
                }),
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn remove_generator(
        &self,
        id: String,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .remove_generator(Request::new(pb::RemoveGeneratorOpRequest {
                generator_id: id,
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    /// Write-only by construction: the key goes in and only its last four ever
    /// come back, on the NEXT ListGenerators. Nothing here echoes it.
    pub async fn set_generator_key(
        &self,
        id: String,
        key: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .set_generator_key(Request::new(pb::SetGeneratorKeyOpRequest {
                generator_id: id.clone(),
                key,
                command_id: new_command_id(),
                // The reason names the generator and never the credential --
                // this string lands in the audit log, which is the one store
                // designed to be read and exported.
                reason: format!("operator installed an api key for {id}"),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn clear_generator_key(
        &self,
        id: String,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let ack = client
            .clear_generator_key(Request::new(pb::ClearGeneratorKeyOpRequest {
                generator_id: id,
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        // A CommandAck carries no per-key outcome, so none is invented here. The
        // absence of an error IS the result.
        Ok(ConfigWriteResult {
            command_id: ack.command_id,
            deduped: ack.deduped,
            outcomes: Vec::new(),
        })
    }

    // ── MCP servers (contract 0097) ──────────────────────────────────────────

    /// The settings editor's read: declared config + live connection facts.
    /// Distinct from the ops screen's feed projection.
    pub async fn list_mcp_servers(&self) -> Result<Vec<MCPServerConfigSpec>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_mcp_servers(Request::new(pb::ListMcpServersOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .servers
            .into_iter()
            .map(|s| MCPServerConfigSpec {
                id: s.name,
                transport: s.transport,
                endpoint: s.endpoint,
                args: s.args,
                auth_type: s.auth_type,
                auth_header: s.auth_header,
                classification_tags: s.classification_tags,
                connected: s.connected,
                last_error: s.last_error,
                tool_count: s.tool_count,
                token_configured: s.token_configured,
                token_source: s.token_source,
            })
            .collect())
    }

    fn mcp_spec_op(server: &MCPServerConfigSpec) -> pb::McpServerSpecOp {
        pb::McpServerSpecOp {
            id: server.id.clone(),
            transport: server.transport.clone(),
            endpoint: server.endpoint.clone(),
            args: server.args.clone(),
            auth_type: server.auth_type.clone(),
            auth_header: server.auth_header.clone(),
            classification_tags: server.classification_tags.clone(),
        }
    }

    /// Create or replace an MCP server. The kernel arms it LIVE — the effect
    /// travels through so the pane can say "connecting" rather than "restart".
    pub async fn save_mcp_server(
        &self,
        server: MCPServerConfigSpec,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .save_mcp_server(Request::new(pb::SaveMcpServerOpRequest {
                server: Some(Self::mcp_spec_op(&server)),
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn remove_mcp_server(
        &self,
        id: String,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .remove_mcp_server(Request::new(pb::RemoveMcpServerOpRequest {
                server_id: id,
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    /// Write-only, like a generator key: the token goes in and only
    /// `token_configured`/`token_source` ever come back.
    pub async fn set_mcp_server_token(
        &self,
        id: String,
        token: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .set_mcp_server_token(Request::new(pb::SetMcpServerTokenOpRequest {
                server_id: id.clone(),
                token,
                command_id: new_command_id(),
                // Names the server, never the credential — this lands in the
                // audit log.
                reason: format!("operator installed a token for mcp server {id}"),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn clear_mcp_server_token(
        &self,
        id: String,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        let mut client = self.client().await?;
        let ack = client
            .clear_mcp_server_token(Request::new(pb::ClearMcpServerTokenOpRequest {
                server_id: id,
                command_id: new_command_id(),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        // A CommandAck carries no per-key outcome, so none is invented.
        Ok(ConfigWriteResult {
            command_id: ack.command_id,
            deduped: ack.deduped,
            outcomes: Vec::new(),
        })
    }

    /// One ephemeral connection against the SUBMITTED spec — possibly unsaved.
    /// The tool names it returns are what the server actually advertises.
    pub async fn test_mcp_server(
        &self,
        server: MCPServerConfigSpec,
    ) -> Result<MCPServerTestResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .test_mcp_server(Request::new(pb::TestMcpServerOpRequest {
                server: Some(Self::mcp_spec_op(&server)),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(MCPServerTestResult {
            ok: resp.ok,
            latency_ms: resp.latency_ms,
            tool_names: resp.tool_names,
            error: resp.error,
        })
    }

    /// DeleteConfig: remove stored overrides so the layers beneath the store
    /// (a config file, else the default) supply the key again.
    ///
    /// This is the console's "revert to file" (ADR-0101 D8). Writing the file's
    /// value back over the top is NOT the same thing: it leaves the key pinned by
    /// the store, so a later edit of that file would still be ignored.
    pub async fn delete_config(
        &self,
        keys: Vec<String>,
        reason: String,
    ) -> Result<ConfigWriteResult, String> {
        if keys.is_empty() {
            return Err("delete_config: no keys".into());
        }
        let mut client = self.client().await?;
        let resp = client
            .delete_config(Request::new(pb::DeleteConfigOpRequest {
                command_id: new_command_id(),
                reason,
                keys,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(config_write_result(resp))
    }

    pub async fn get_config_schema(&self) -> Result<ConfigSchema, String> {
        let mut client = self.client().await?;
        let resp = client
            .get_config_schema(Request::new(pb::GetConfigSchemaOpRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ConfigSchema {
            schema_version: resp.schema_version,
            schema_json: resp.schema_json,
            schema_hash: resp.schema_hash,
            editable_keys: resp.editable_keys,
            kernel_only_keys: resp.kernel_only_keys,
            current_values: resp.current_values,
            value_source: resp.value_source,
        })
    }

    pub async fn classify_input(&self, text: String) -> Result<ClassifiedInput, String> {
        let mut client = self.client().await?;
        let resp = client
            .classify_input(Request::new(pb::ClassifyInputOpRequest {
                text,
                surface: String::new(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ClassifiedInput {
            // Passed through VERBATIM. All five values, never narrowed.
            classification: resp.classification,
            why: resp.why,
            confidence: resp.confidence,
            clarification_question: resp.clarification_question,
            clarification_options: resp.clarification_options,
        })
    }

    pub async fn propose_plan(
        &self,
        goal: String,
        answers: Vec<String>,
    ) -> Result<PlanProposalResponse, String> {
        let mut client = self.client().await?;
        let resp = client
            .propose_plan(Request::new(pb::ProposePlanOpRequest { goal, answers }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(PlanProposalResponse {
            questions: resp
                .questions
                .into_iter()
                .map(|q| InterviewQuestion {
                    question: q.question,
                    kind: q.kind,
                    why_it_changes_the_answer: q.why_it_changes_the_answer,
                    options: q
                        .options
                        .into_iter()
                        .map(|o| InterviewOption {
                            label: o.label,
                            detail: o.detail,
                            document_count: o.document_count,
                        })
                        .collect(),
                })
                .collect(),
            proposal: resp.proposal.map(|p| PlanProposal {
                steps: p.steps.into_iter().map(authored_step_from_pb).collect(),
                estimated_tokens: p.estimated_tokens,
                estimated_wall_ms: p.estimated_wall_ms,
                max_parallel: p.max_parallel,
                access_note: p.access_note,
            }),
            access_consequence: resp.access_consequence,
        })
    }

    pub async fn submit_plan(
        &self,
        steps: Vec<AuthoredStep>,
        reason: String,
        dry_run: bool,
    ) -> Result<SubmitPlanResult, String> {
        let mut client = self.client().await?;
        let resp = client
            .submit_plan(Request::new(pb::SubmitPlanOpRequest {
                command_id: new_command_id(),
                reason,
                session_id: String::new(),
                dry_run,
                subject: String::new(),
                steps: steps.into_iter().map(authored_step_to_pb).collect(),
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SubmitPlanResult {
            command_id: resp.command_id,
            deduped: resp.deduped,
            accepted: resp.accepted,
            session_id: resp.session_id,
            plan_id: resp.plan_id,
            issues: resp
                .issues
                .into_iter()
                .map(|i| PlanValidationIssue {
                    step_index: i.step_index,
                    code: i.code,
                    message: i.message,
                    fatal: i.fatal,
                })
                .collect(),
            execution_order: resp.execution_order,
        })
    }
}

// `recommended_model` is deprecated in the kernel's contract as of 2026-08-07 (the
// LLM Provider resolves model choice from the declared need, ADR-0042 D1) and the
// kernel no longer reads it. The round trip is kept ANYWAY, deliberately: DagBuilder
// still offers the field as an editable control, and dropping it here would silently
// discard a value the operator typed — a worse failure than carrying one the kernel
// ignores. The open question is a UI one, not a transport one: the control should stop
// promising an override that does nothing. Until it does, this stays symmetric.
#[allow(deprecated)]
fn authored_step_from_pb(s: pb::AuthoredStepOp) -> AuthoredStep {
    AuthoredStep {
        query: s.query,
        required_capabilities: s.required_capabilities,
        depends_on: s.depends_on,
        max_energy: s.max_energy,
        recommended_model: s.recommended_model,
        checkpoint_after: s.checkpoint_after,
        checkpoint_query: s.checkpoint_query,
        is_thought: s.is_thought,
        preferred_agent: s.preferred_agent,
        agent_pin: s.agent_pin,
        fan_out_over: s.fan_out_over,
        fan_out_var: s.fan_out_var,
    }
}

// See authored_step_from_pb: the deprecated `recommended_model` is round-tripped on
// purpose so an authored value is not silently dropped in transport.
#[allow(deprecated)]
fn authored_step_to_pb(s: AuthoredStep) -> pb::AuthoredStepOp {
    pb::AuthoredStepOp {
        query: s.query,
        required_capabilities: s.required_capabilities,
        depends_on: s.depends_on,
        max_energy: s.max_energy,
        recommended_model: s.recommended_model,
        checkpoint_after: s.checkpoint_after,
        checkpoint_query: s.checkpoint_query,
        is_thought: s.is_thought,
        preferred_agent: s.preferred_agent,
        agent_pin: s.agent_pin,
        // -1 is the absent sentinel and must survive the round trip: emitting 0
        // would turn every ordinary step into a fan-out over step 0.
        fan_out_over: s.fan_out_over,
        fan_out_var: s.fan_out_var,
    }
}

/// Spread a retry delay by ±10%.
///
/// Deterministic source (the clock) rather than a new dependency: the point is
/// that two clients do not retry in lockstep, not cryptographic unpredictability.
fn jittered(base: Duration) -> Duration {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    // -10% .. +10%
    let spread = (base.as_millis() as u64) / 5;
    if spread == 0 {
        return base;
    }
    let offset = (nanos as u64 % spread) as i64 - (spread / 2) as i64;
    let millis = (base.as_millis() as i64 + offset).max(1) as u64;
    Duration::from_millis(millis)
}

fn refusal_from(r: pb::RefusalOp) -> Refusal {
    Refusal {
        constraint: r.constraint,
        node: r.node,
        port: r.port,
        message: r.message,
    }
}

fn pipeline_summary_from(p: pb::PipelineOp) -> PipelineSummary {
    PipelineSummary {
        pipeline_id: p.pipeline_id,
        revision: p.revision,
        name: p.name,
        state: p.state,
        trigger_type: p.trigger_type,
        trigger_ref: p.trigger_ref,
        node_count: p.node_count,
        edge_count: p.edge_count,
        effect_node_count: p.effect_node_count,
        mapping_revision: p.mapping_revision,
        plan_checksum: p.plan_checksum,
        semantics_checksum: p.semantics_checksum,
        generated: p.generated,
        dry_run: p.dry_run,
        approved: p.approved,
        entry_live: p.entry_live,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(seconds: i64, nanos: i32) -> Option<prost_types::Timestamp> {
        Some(prost_types::Timestamp { seconds, nanos })
    }

    // ADR-0134: the event time reaches the webview verbatim, and "absent" stays
    // absent -- a pre-0099 kernel sends no time, which must not become 1970.
    #[test]
    fn memory_hit_carries_event_time_and_its_labels() {
        let hit = MemoryHit::from(pb::MemoryOp {
            doc_id: "d1".into(),
            event_time: ts(1_700_000_000, 500_000_000),
            event_time_end: ts(1_700_003_600, 0),
            time_source: "source_metadata".into(),
            time_precision: "minute".into(),
            ..Default::default()
        });
        assert_eq!(hit.time.event_time_unix_ms, Some(1_700_000_000_500));
        assert_eq!(hit.time.event_time_end_unix_ms, Some(1_700_003_600_000));
        assert_eq!(hit.time.time_source, "source_metadata");
        assert_eq!(hit.time.time_precision, "minute");

        let old = MemoryHit::from(pb::MemoryOp::default());
        assert_eq!(old.time, EventTime::default());
        assert_eq!(old.time.event_time_unix_ms, None);
    }

    // The webview reads the flattened names; a nested `time` object would type-check
    // in TS and render nothing.
    #[test]
    fn citation_event_time_is_flattened_on_the_wire_to_the_webview() {
        let c = Citation::from(pb::MemoryCitation {
            marker: 1,
            event_time: ts(86_400, 0),
            time_source: "ingest_default".into(),
            time_precision: "second".into(),
            ..Default::default()
        });
        let v = serde_json::to_value(&c).unwrap();
        assert_eq!(v["event_time_unix_ms"], 86_400_000);
        assert!(v["event_time_end_unix_ms"].is_null());
        assert_eq!(v["time_source"], "ingest_default");
        assert_eq!(v["time_precision"], "second");
        assert!(v.get("time").is_none());
    }

    #[test]
    fn ingest_event_time_converts_and_validates() {
        // Nothing stated: the kernel dates it by its ingest clock.
        assert_eq!(ingest_event_time(None, None).unwrap(), (None, String::new()));
        // A day-precision date at UTC midnight.
        let (t, p) = ingest_event_time(Some(1_704_067_200_000), Some("day".into())).unwrap();
        assert_eq!(t.unwrap().seconds, 1_704_067_200);
        assert_eq!(p, "day");
        // Sub-second and pre-epoch instants survive the split.
        let (t, _) = ingest_event_time(Some(-1), None).unwrap();
        let t = t.unwrap();
        assert_eq!((t.seconds, t.nanos), (-1, 999_000_000));
        // Refused before the kernel has to.
        assert!(ingest_event_time(Some(0), Some("week".into())).is_err());
        assert!(ingest_event_time(None, Some("day".into())).is_err());
    }

    // ADR-0101 D8: the file facts reach the webview, separate from shadowed_by.
    #[test]
    fn config_write_result_carries_d8_file_facts() {
        let r = config_write_result(pb::SetConfigOpResponse {
            command_id: "c".into(),
            deduped: false,
            outcomes: vec![
                pb::ConfigWriteOutcomeOp {
                    key: "a".into(),
                    stored: true,
                    effect: "restart_required".into(),
                    written_to: "configs/tuning.local.json".into(),
                    ..Default::default()
                },
                pb::ConfigWriteOutcomeOp {
                    key: "b".into(),
                    stored: true,
                    effect: "restart_required".into(),
                    overrides_file: "configs/providers.json".into(),
                    overrides_value: "0.4".into(),
                    ..Default::default()
                },
            ],
        });
        assert_eq!(r.outcomes[0].written_to, "configs/tuning.local.json");
        assert_eq!(r.outcomes[0].overrides_file, "");
        assert_eq!(r.outcomes[1].overrides_file, "configs/providers.json");
        assert_eq!(r.outcomes[1].overrides_value, "0.4");
        assert_eq!(r.outcomes[1].shadowed_by, "");
    }

    // ADR-0130 D5: sign-out reports whether the token is dead ON THE KERNEL.
    #[test]
    fn logout_outcome_distinguishes_revoked_from_only_forgotten() {
        assert_eq!(
            logout_outcome(Ok(())),
            LogoutOutcome { revoked: true, note: String::new() }
        );
        let already = logout_outcome(Err(Status::unauthenticated("revoked")));
        assert!(already.revoked);
        assert!(!already.note.is_empty());

        let old_kernel = logout_outcome(Err(Status::unimplemented("no Logout")));
        assert!(!old_kernel.revoked);
        assert!(old_kernel.note.contains("stays valid"));

        let down = logout_outcome(Err(Status::unavailable("connect refused")));
        assert!(!down.revoked);
        assert!(down.note.contains("connect refused"));
    }

    // No token = nothing to revoke, and no dial is attempted.
    #[tokio::test]
    async fn revoke_without_a_token_does_not_dial() {
        let t = Transport::default();
        let err = t.revoke_remote().await.unwrap_err();
        assert_eq!(err.code(), tonic::Code::Unauthenticated);
    }
}
