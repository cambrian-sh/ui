//! Cambrian UI — Tauri Rust core.
//!
//! This is the ONLY layer that speaks gRPC to the runtime-core (ADR-0047). It
//! owns the client-side state of record (`state`), the Operator Transport Plane
//! client (`transport`), and the Tauri command/event bridge to the webview.

mod ingress_studio;
pub mod links;
pub mod logs;
pub mod pb;
pub mod policy;
pub mod records;
pub mod state;
pub mod substrate;
mod telegram;
pub mod transport;

use tauri::{AppHandle, State};

use policy::{
    AccessDecision, DecisionRecord, GroupSpec, IdentityBinding, IngressActivityPage, IngressSpec,
    LinkSpec, PolicyProposal, PolicySpec, PrincipalSpec, ResultantPolicy, SaveOutcome,
    SimulationResult,
    StrangerPolicy, TagSpec, UnboundSender,
};
use state::{
    AuthoredStep, ClassifiedInput, ConfigSchema, ConfigWriteResult, ConversationMessage,
    ConversationSummary,
    GeneratorSpec, GeneratorTestResult, MCPServerConfigSpec, MCPServerTestResult,
    PlanProposalResponse, RoleAssignment, SkillSummary,
    PipelineSummary, StateOfRecord, SubmitPlanResult, ToolSummary, WatchConfigSummary,
};
use transport::{DocumentPage, MemoryQueryResult, Transport};

// ---- Command response DTOs ----------------------------------------------
//
// These exist because `invoke<T>()` on the webview side is an UNCHECKED cast:
// TypeScript believes whatever the caller declares. Returning a bare `String` or
// `bool` here while `src/ipc/types.ts` declares `{session_id}` / `{deduped}`
// therefore compiles cleanly on both sides and only fails at runtime — which is
// exactly how `createSession` came to hand back a string that destructured to
// `undefined`. Keep these shapes identical to `types.ts` (and to the proto
// messages they mirror).

#[derive(serde::Serialize)]
pub struct LoginResponse {
    pub role: String,
}

#[derive(serde::Serialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
}

#[derive(serde::Serialize)]
pub struct CommandAck {
    pub deduped: bool,
}

#[derive(serde::Serialize)]
pub struct SavedConnection {
    pub endpoint: String,
    pub username: String,
}

// ---- Tauri command bridge (webview → core → kernel) ---------------------
//
// Each command clones the Transport out of State before awaiting, so we never
// hold the State borrow across an await point. All mutating commands carry a
// mandatory `reason` (the kernel rejects empty reasons) and a generated
// command_id (idempotency) inside the transport layer.

#[tauri::command(rename_all = "snake_case")]
async fn op_login(
    app: AppHandle,
    transport: State<'_, Transport>,
    endpoint: String,
    username: String,
    password: String,
    remember: bool,
) -> Result<LoginResponse, String> {
    let t = transport.inner().clone();
    let role = t
        .login(&app, endpoint, username, password, remember)
        .await?;
    Ok(LoginResponse { role })
}

/// The saved connection (endpoint, username) if one is in the OS keychain. The
/// password is deliberately NOT returned to the webview — `op_login_saved`
/// reconnects using the stored password without it ever crossing the IPC bridge.
#[tauri::command(rename_all = "snake_case")]
async fn op_saved_connection() -> Result<Option<SavedConnection>, String> {
    Ok(Transport::saved_connection()
        .map(|(endpoint, username, _password)| SavedConnection { endpoint, username }))
}

/// Reconnect using the credentials saved in the OS keychain (launch auto-connect).
/// Fails if nothing is saved.
#[tauri::command(rename_all = "snake_case")]
async fn op_login_saved(
    app: AppHandle,
    transport: State<'_, Transport>,
) -> Result<LoginResponse, String> {
    let (endpoint, username, password) =
        Transport::saved_connection().ok_or_else(|| "no saved connection".to_string())?;
    let t = transport.inner().clone();
    let role = t.login(&app, endpoint, username, password, true).await?;
    Ok(LoginResponse { role })
}

/// Tear down the operator session (stop the feed, forget the token). The webview
/// calls this from the connection panel; reconnecting means a fresh `op_login`.
#[tauri::command(rename_all = "snake_case")]
async fn op_disconnect(app: AppHandle, transport: State<'_, Transport>) -> Result<(), String> {
    let t = transport.inner().clone();
    t.disconnect(&app).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_state(transport: State<'_, Transport>) -> Result<StateOfRecord, String> {
    let t = transport.inner().clone();
    let s = t.state.lock().await.clone();
    Ok(s)
}

#[tauri::command(rename_all = "snake_case")]
async fn op_create_session(
    transport: State<'_, Transport>,
    goal: String,
    reason: String,
) -> Result<CreateSessionResponse, String> {
    let session_id = transport
        .inner()
        .clone()
        .create_session(goal, reason)
        .await?;
    Ok(CreateSessionResponse { session_id })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_send_message(
    transport: State<'_, Transport>,
    session_id: String,
    text: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .send_message(session_id, text, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_inject_correction(
    transport: State<'_, Transport>,
    session_id: String,
    instruction: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .inject_correction(session_id, instruction, reason)
        .await?;
    Ok(CommandAck { deduped })
}

// ---- Conversations (ADR-0084 D9 OSS chat lane) -------------------------

#[tauri::command(rename_all = "snake_case")]
async fn op_open_conversation(
    transport: State<'_, Transport>,
    conversation_id: String,
    title: String,
    profile: String,
    policy: String,
    reason: String,
) -> Result<CreateSessionResponse, String> {
    let id = transport
        .inner()
        .clone()
        .open_conversation(conversation_id, title, profile, policy, reason)
        .await?;
    // Reuse the {session_id} shape as the id carrier so the webview has one id type; the
    // field is the conversation id here.
    Ok(CreateSessionResponse { session_id: id })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_send_turn(
    transport: State<'_, Transport>,
    conversation_id: String,
    text: String,
    reason: String,
) -> Result<Option<ConversationMessage>, String> {
    transport
        .inner()
        .clone()
        .send_turn(conversation_id, text, reason)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_conversations(
    transport: State<'_, Transport>,
    limit: i32,
) -> Result<Vec<ConversationSummary>, String> {
    transport.inner().clone().list_conversations(limit).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_conversation_messages(
    transport: State<'_, Transport>,
    conversation_id: String,
    after_seq: i64,
    limit: i32,
) -> Result<Vec<ConversationMessage>, String> {
    transport
        .inner()
        .clone()
        .list_conversation_messages(conversation_id, after_seq, limit)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_close_conversation(
    transport: State<'_, Transport>,
    conversation_id: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .close_conversation(conversation_id, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_pause_session(
    transport: State<'_, Transport>,
    session_id: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .session_command(true, session_id, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_resume_session(
    transport: State<'_, Transport>,
    session_id: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .session_command(false, session_id, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_resolve_hitl(
    transport: State<'_, Transport>,
    intervention_id: String,
    approve: bool,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .resolve_hitl(intervention_id, approve, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_set_tool_grant(
    transport: State<'_, Transport>,
    agent_id: String,
    tool_name: String,
    granted: bool,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .set_tool_grant(agent_id, tool_name, granted, reason)
        .await?;
    Ok(CommandAck { deduped })
}

/// Ingest one document (ADR-0047 A2.4).
///
/// `content` arrives from the webview as a byte array (a JS `Uint8Array` over the
/// Tauri IPC bridge) — the webview reads the file, the core sends the bytes. It is
/// deliberately NOT a path: the webview cannot hand the kernel a filesystem path it
/// may not be able to read, and the kernel is not necessarily on this machine.
///
/// Pass `content: []` + a non-empty `text` for the text lane, or `content` + a
/// `filename` for the binary/docling lane. The kernel rejects both-or-neither.
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
async fn op_ingest_memory(
    transport: State<'_, Transport>,
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
    transport
        .inner()
        .clone()
        .ingest_memory(
            text,
            content,
            filename,
            content_type,
            context,
            tags,
            importance,
            source,
            session_id,
            reason,
        )
        .await
}

// ---- Declared-but-unimplemented commands --------------------------------
//
// `src/ipc/client.ts` calls these, but no kernel RPC backs them yet. They
// are registered so the failure is a legible reason instead of Tauri's opaque
// "command not found", which reads like a build problem rather than a missing
// kernel capability.

/// UI-IMPL-19, resolved: the kernel exposes CloseSession as of contract 0064, so this is a
/// real command instead of a legible refusal.
#[tauri::command(rename_all = "snake_case")]
async fn op_complete_session(
    transport: State<'_, Transport>,
    session_id: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .close_session(session_id, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_blast_radius_preview(
    _mutation: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Err(
        "not implemented: blast-radius preview needs a kernel RPC that does not \
         exist yet (UI-IMPL-29). The panel cannot show a real preview, and showing \
         an empty one would understate the blast radius"
            .into(),
    )
}

#[derive(serde::Serialize)]
pub struct FileStat {
    pub name: String,
    pub size: u64,
}

/// Stat a picked file for the ingest queue (name + size) WITHOUT reading its
/// bytes, so staging a 500 MB file costs nothing until the operator ingests.
#[tauri::command(rename_all = "snake_case")]
async fn op_stat_file(path: String) -> Result<FileStat, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("stat {path}: {e}"))?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    Ok(FileStat {
        name,
        size: meta.len(),
    })
}

/// Ingest a document the Rust core reads FROM A LOCAL PATH.
///
/// This is the file lane: the webview picks a file via the OS dialog and hands the
/// core a path, never the bytes. The core reads the file here (`fs::read`) and
/// sends the bytes to the kernel. The kernel still receives bytes, never a path —
/// it may be on another machine — so the "kernel reads no local paths" invariant
/// holds while the multi-hundred-MB file never crosses the JS/IPC boundary as a
/// number array.
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
async fn op_ingest_file(
    transport: State<'_, Transport>,
    path: String,
    context: String,
    tags: Vec<String>,
    importance: f64,
    reason: String,
) -> Result<(String, bool), String> {
    let content = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .ok_or_else(|| format!("no filename in path: {path}"))?;
    let content_type = mime_from_ext(&filename);
    transport
        .inner()
        .clone()
        .ingest_memory(
            String::new(),
            content,
            filename,
            content_type,
            context,
            tags,
            importance,
            String::new(),
            String::new(),
            reason,
        )
        .await
}

/// Best-effort MIME from a filename extension. Advisory only — the kernel routes
/// the chunker off the extension, not this hint.
fn mime_from_ext(filename: &str) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "html" | "htm" => "text/html",
        _ => "application/octet-stream",
    }
    .to_string()
}

/// Grounded, [n]-cited answer (ADR-0081). See `Transport::answer_memory`.
#[tauri::command(rename_all = "snake_case")]
async fn op_answer_memory(
    transport: State<'_, Transport>,
    query: String,
    top_k: i32,
    source: String,
    session: String,
    min_importance: f64,
) -> Result<transport::AnswerMemory, String> {
    transport
        .inner()
        .clone()
        .answer_memory(query, top_k, source, session, min_importance)
        .await
}

/// Ranked recall — evidence, not an answer. See `Transport::query_memory`.
#[tauri::command(rename_all = "snake_case")]
async fn op_query_memory(
    transport: State<'_, Transport>,
    query: String,
    top_k: i32,
    source: String,
    session: String,
    min_importance: f64,
) -> Result<MemoryQueryResult, String> {
    transport
        .inner()
        .clone()
        .query_memory(query, top_k, source, session, min_importance)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_set_scope(
    transport: State<'_, Transport>,
    agent_id: String,
    required_tags: Vec<String>,
    any_of_tags: Vec<String>,
    forbidden_tags: Vec<String>,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .set_scope(agent_id, required_tags, any_of_tags, forbidden_tags, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_register_mcp(
    transport: State<'_, Transport>,
    name: String,
    command: String,
    url: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .register_mcp(name, command, url, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_register_skill(
    transport: State<'_, Transport>,
    name: String,
    description: String,
    instructions: String,
    tool_grants: Vec<String>,
    scope_tags: Vec<String>,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .register_skill(
            name,
            description,
            instructions,
            tool_grants,
            scope_tags,
            reason,
        )
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_trigger_consolidation(
    transport: State<'_, Transport>,
    scope: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .trigger_consolidation(scope, reason)
        .await?;
    Ok(CommandAck { deduped })
}

/// Hot-apply numeric runtime tunables (ADR-0054). Operator-only, audited,
/// mandatory reason. See `Transport::set_runtime_config` for why partial sets
/// and unknown keys behave the way they do.
#[tauri::command(rename_all = "snake_case")]
async fn op_set_runtime_config(
    transport: State<'_, Transport>,
    params: std::collections::HashMap<String, f64>,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .set_runtime_config(params, reason)
        .await?;
    Ok(CommandAck { deduped })
}

// ── Reactive: the six watch RPCs the console never picked up ──────────────
// All on the pinned contract since the REACT-0x work; wiring needs no kernel
// change. See report.md §2b.

#[tauri::command(rename_all = "snake_case")]
async fn op_list_watch_configs(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::state::WatchConfigFull>, String> {
    transport.inner().clone().list_watch_configs().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_register_watch(
    transport: State<'_, Transport>,
    config: crate::state::WatchConfigFull,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .register_watch(config, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_delete_watch(
    transport: State<'_, Transport>,
    watch_id: String,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .delete_watch(watch_id, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_set_watch_active(
    transport: State<'_, Transport>,
    watch_id: String,
    active: bool,
    reason: String,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .set_watch_active(watch_id, active, reason)
        .await?;
    Ok(CommandAck { deduped })
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_watch_dead_letters(
    transport: State<'_, Transport>,
    limit: i32,
) -> Result<Vec<crate::state::WatchDeadLetter>, String> {
    transport
        .inner()
        .clone()
        .list_watch_dead_letters(limit)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_watch_metrics(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::state::WatchMetrics>, String> {
    transport.inner().clone().get_watch_metrics().await
}

/// Replay the journal through a candidate config. Never executes an arm.
#[tauri::command(rename_all = "snake_case")]
async fn op_backtest_watch(
    transport: State<'_, Transport>,
    config: crate::state::WatchConfigFull,
    after_seq: u64,
) -> Result<Vec<crate::state::WatchBacktestVerdict>, String> {
    transport
        .inner()
        .clone()
        .backtest_watch(config, after_seq)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_preview_route(
    transport: State<'_, Transport>,
    task_desc: String,
    required_capabilities: Vec<String>,
    candidates: Vec<crate::state::PreviewCandidate>,
) -> Result<crate::state::PreviewRouteResult, String> {
    transport
        .inner()
        .clone()
        .preview_route(task_desc, required_capabilities, candidates)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_tools(
    transport: State<'_, Transport>,
    app: AppHandle,
) -> Result<Vec<ToolSummary>, String> {
    transport.inner().clone().list_tools(&app).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_skills(
    transport: State<'_, Transport>,
    app: AppHandle,
) -> Result<Vec<SkillSummary>, String> {
    transport.inner().clone().list_skills(&app).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_watches(
    transport: State<'_, Transport>,
    app: AppHandle,
) -> Result<Vec<WatchConfigSummary>, String> {
    transport.inner().clone().list_watches(&app).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_node_items(
    transport: State<'_, Transport>,
    pipeline_id: String,
    node_id: String,
    limit: i32,
) -> Result<Vec<crate::state::NodeItem>, String> {
    transport.inner().clone().list_node_items(pipeline_id, node_id, limit).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_pipelines(
    transport: State<'_, Transport>,
) -> Result<Vec<PipelineSummary>, String> {
    transport.inner().clone().list_pipelines().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_pipeline(
    transport: State<'_, Transport>,
    pipeline_id: String,
    revision: Option<i32>,
) -> Result<crate::state::PipelineGraph, String> {
    transport
        .inner()
        .clone()
        .get_pipeline(pipeline_id, revision.unwrap_or_default())
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_validate_pipeline(
    transport: State<'_, Transport>,
    graph_json: String,
) -> Result<crate::state::PipelineValidation, String> {
    transport.inner().clone().validate_pipeline(graph_json).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_save_pipeline(
    transport: State<'_, Transport>,
    graph_json: String,
    command_id: Option<String>,
) -> Result<crate::state::PipelineSaved, String> {
    transport
        .inner()
        .clone()
        .save_pipeline(graph_json, command_id.unwrap_or_default())
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_transition_pipeline(
    transport: State<'_, Transport>,
    pipeline_id: String,
    revision: Option<i32>,
    to_state: String,
    command_id: Option<String>,
    reason: Option<String>,
) -> Result<crate::state::PipelineTransitioned, String> {
    transport
        .inner()
        .clone()
        .transition_pipeline(
            pipeline_id,
            revision.unwrap_or(0),
            to_state,
            command_id.unwrap_or_default(),
            reason.unwrap_or_default(),
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_dry_run_pipeline(
    transport: State<'_, Transport>,
    pipeline_id: String,
    revision: Option<i32>,
    sample_limit: Option<i32>,
) -> Result<crate::state::PipelineDryRun, String> {
    transport
        .inner()
        .clone()
        .dry_run_pipeline(
            pipeline_id,
            revision.unwrap_or_default(),
            sample_limit.unwrap_or_default(),
        )
        .await
}

// ---- Access policy (ADR-0085/0086/0087) ---------------------------------
//
// The first premium UI surface. `op_explain_access` and
// `op_list_classification_tags` ride the pinned OSS contract; everything else
// rides premium's own plane over the same connection (ADR-0088). None of them is
// gated here — the kernel answers `Unimplemented` without the plugin, and the
// webview gates on the `access-policy` capability so the operator gets an empty
// state that names what to enable rather than an error.

#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
async fn op_explain_access(
    transport: State<'_, Transport>,
    principal_id: String,
    principal_kind: Option<String>,
    surface_kind: Option<String>,
    surface_id: Option<String>,
    resource_kind: Option<String>,
    resource_id: Option<String>,
    tags: Option<Vec<String>>,
    effects: Option<Vec<String>>,
) -> Result<AccessDecision, String> {
    transport
        .inner()
        .clone()
        .explain_access(
            principal_id,
            principal_kind.unwrap_or_default(),
            surface_kind.unwrap_or_default(),
            surface_id.unwrap_or_default(),
            resource_kind.unwrap_or_default(),
            resource_id.unwrap_or_default(),
            tags.unwrap_or_default(),
            effects.unwrap_or_default(),
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_classification_tags(
    transport: State<'_, Transport>,
) -> Result<Vec<String>, String> {
    transport.inner().clone().list_classification_tags().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_groups(transport: State<'_, Transport>) -> Result<Vec<GroupSpec>, String> {
    transport.inner().clone().list_groups().await
}

/// The vocabulary WITH closed-ness (ADR-0091). Distinct from
/// `op_list_classification_tags`, which rides the pinned OSS contract and carries
/// only the names — closed-ness is a premium concept and lives on that plane.
#[tauri::command(rename_all = "snake_case")]
async fn op_list_tags(transport: State<'_, Transport>) -> Result<Vec<TagSpec>, String> {
    transport.inner().clone().list_tags().await
}

/// Draft a policy from a description in English (ADR-0092).
///
/// This command CANNOT apply anything. It returns a proposal, and approving it
/// means the front end calling `op_save_policy` and `op_link_policy` — the same
/// commands used for hand-authored policy, so approval cannot route around a
/// validation or an audit record.
#[tauri::command(rename_all = "snake_case")]
async fn op_propose_policy(
    transport: State<'_, Transport>,
    request: String,
    simulate_limit: i32,
) -> Result<PolicyProposal, String> {
    transport
        .inner()
        .clone()
        .propose_policy(request, simulate_limit)
        .await
}

/// Enumerate ingested documents by row (contract 0070).
///
/// The read that makes labelling possible at all. Access policy acts on labels and
/// never on a document by name, so a document with no labels is not denied — it is
/// invisible to the policy model, and semantic search cannot find one because
/// "which of my documents have no labels?" has no query text. Gated in the webview
/// on the `document-listing` capability; an older kernel answers `Unimplemented`.
#[tauri::command(rename_all = "snake_case")]
async fn op_list_documents(
    transport: State<'_, Transport>,
    limit: Option<i32>,
    cursor: Option<String>,
    unlabelled_only: Option<bool>,
    id_prefix: Option<String>,
) -> Result<DocumentPage, String> {
    transport
        .inner()
        .clone()
        .list_documents(
            limit.unwrap_or(0),
            cursor.unwrap_or_default(),
            unlabelled_only.unwrap_or(false),
            id_prefix.unwrap_or_default(),
        )
        .await
}

/// Apply or remove one label on a document or memory (ADR-0093).
///
/// A mandatory reason travels with it: classification changes what people can see, so
/// the audit row has to say why, not just what.
#[tauri::command(rename_all = "snake_case")]
async fn op_tag_memory(
    transport: State<'_, Transport>,
    doc_id: String,
    tag: String,
    add: bool,
    reason: String,
) -> Result<bool, String> {
    transport
        .inner()
        .clone()
        .tag_memory(doc_id, tag, add, reason)
        .await
}

// ---- Telegram ingress (ADR-0090) ------------------------------------------
//
// The token travels one way. There is no command that returns it, and none of these log
// their arguments — a console that can echo a credential leaks it to the screen, to a
// recording, and to whatever captures the log.

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_status(
    transport: State<'_, Transport>,
    bot_id: Option<String>,
) -> Result<crate::telegram::TelegramStatus, String> {
    transport
        .inner()
        .clone()
        .telegram_status(bot_id.unwrap_or_default())
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_set_token(
    transport: State<'_, Transport>,
    token: String,
    bot_id: Option<String>,
) -> Result<crate::telegram::TelegramAck, String> {
    transport
        .inner()
        .clone()
        .telegram_set_token(bot_id.unwrap_or_default(), token)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_clear_token(
    transport: State<'_, Transport>,
    reason: String,
    bot_id: Option<String>,
) -> Result<crate::telegram::TelegramAck, String> {
    transport
        .inner()
        .clone()
        .telegram_clear_token(bot_id.unwrap_or_default(), reason)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_set_enabled(
    transport: State<'_, Transport>,
    enabled: bool,
    bot_id: Option<String>,
) -> Result<crate::telegram::TelegramAck, String> {
    transport
        .inner()
        .clone()
        .telegram_set_enabled(bot_id.unwrap_or_default(), enabled)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_query_logs(
    transport: State<'_, Transport>,
    filter: Option<crate::logs::LogFilter>,
    after_seq: Option<u64>,
    limit: Option<i32>,
) -> Result<crate::logs::LogPage, String> {
    transport
        .inner()
        .clone()
        .query_logs(
            filter.unwrap_or_default(),
            after_seq.unwrap_or(0),
            limit.unwrap_or(0),
        )
        .await
}

/// Start (or restart) the live tail. Records arrive on `kernel://log`.
///
/// Starting again replaces the running tail rather than adding a second one —
/// otherwise changing a filter would leave both streams emitting into the same
/// channel and the console would show a merge of two filters.
#[tauri::command(rename_all = "snake_case")]
async fn op_start_log_tail(
    app: tauri::AppHandle,
    transport: State<'_, Transport>,
    tail: State<'_, crate::logs::LogTail>,
    filter: Option<crate::logs::LogFilter>,
    after_seq: Option<u64>,
) -> Result<(), String> {
    transport.inner().clone().start_log_tail(
        app,
        tail.inner().clone(),
        filter.unwrap_or_default(),
        after_seq.unwrap_or(0),
    );
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn op_stop_log_tail(tail: State<'_, crate::logs::LogTail>) -> Result<(), String> {
    tail.inner().stop();
    Ok(())
}

// ---------------------------------------------------------------------------
// Record lane (ADR-0102) — the drift product's surfaces.
//
// All four are request/response reads on the premium plane, deliberately NOT on
// the projection: `ListAlerts` is poll-only (alerts are not on the operator event
// feed, and putting them there is a contract bump), and the drift tally is a
// process-lifetime gauge rather than folded state. The one exception is retention,
// which IS on the feed as `RetentionRunOp` — `op_list_retention_runs` only
// backfills the history the feed cannot replay.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Knowledge substrate (ADR-0118) — the premium query/explore plane. All four
// are request/response (nothing substrate-shaped is on the operator feed);
// the console polls nothing here — reads happen on navigation and on demand.
// The USER-facing query surface is `op_knowledge_ask` (NL → compiled AST);
// `op_knowledge_query` is internal plumbing behind curated drill-ins (entity
// cards, contradictions, receipts), never a user-facing query builder.
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
async fn op_knowledge_ask(
    transport: State<'_, Transport>,
    question: String,
) -> Result<crate::substrate::AskOutcome, String> {
    transport.inner().clone().knowledge_ask(question).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_knowledge_query(
    transport: State<'_, Transport>,
    query: crate::substrate::CompiledQuery,
) -> Result<crate::substrate::KnowledgeAnswer, String> {
    transport.inner().clone().knowledge_query(query).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_knowledge_overview(
    transport: State<'_, Transport>,
) -> Result<crate::substrate::SubstrateOverview, String> {
    transport.inner().clone().knowledge_overview().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_knowledge_entities(
    transport: State<'_, Transport>,
    query: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<crate::substrate::EntityOverview>, String> {
    transport
        .inner()
        .clone()
        .knowledge_entities(query.unwrap_or_default(), limit.unwrap_or(50))
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_alerts(transport: State<'_, Transport>) -> Result<Vec<crate::records::Alert>, String> {
    transport.inner().clone().list_alerts().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_drift_stats(
    transport: State<'_, Transport>,
) -> Result<crate::records::DriftStats, String> {
    transport.inner().clone().drift_stats().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_refusals(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::records::Refusal>, String> {
    transport.inner().clone().list_refusals().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_retention_runs(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::records::RetentionRun>, String> {
    transport.inner().clone().list_retention_runs().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_coverage(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::records::SourceCoverage>, String> {
    transport.inner().clone().coverage().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_push_status(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::records::KindPushStatus>, String> {
    transport.inner().clone().push_status().await
}

// ── Ingress Studio (ADR-0112 §13) ──
// Thin pass-throughs; every rule lives kernel-side. `op_studio_set_credential`
// follows the write-only discipline: the value crosses these functions and is
// never retained, echoed, or logged.

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_create_ingress(
    transport: State<'_, Transport>,
    ingress_id: String,
    display_name: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_create_ingress(ingress_id, display_name).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_list_ingresses(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::ingress_studio::StudioIngress>, String> {
    transport.inner().clone().studio_list_ingresses().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_get_ingress(
    transport: State<'_, Transport>,
    ingress_id: String,
) -> Result<crate::ingress_studio::StudioStatus, String> {
    transport.inner().clone().studio_get_ingress(ingress_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_lifecycle(
    transport: State<'_, Transport>,
    verb: String,
    ingress_id: String,
    reason: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_lifecycle(verb, ingress_id, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_arm(
    transport: State<'_, Transport>,
    ingress_id: String,
    transport_revision: i32,
    mapping_revision: i32,
    reason: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport
        .inner()
        .clone()
        .studio_arm(ingress_id, transport_revision, mapping_revision, reason)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_rollback(
    transport: State<'_, Transport>,
    ingress_id: String,
    release_id: String,
    reason: String,
    resume: bool,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_rollback(ingress_id, release_id, reason, resume).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_save_spec(
    transport: State<'_, Transport>,
    kind: String,
    ingress_id: String,
    spec_json: String,
) -> Result<crate::ingress_studio::StudioSaveResult, String> {
    transport.inner().clone().studio_save_spec(kind, ingress_id, spec_json).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_get_revision(
    transport: State<'_, Transport>,
    kind: String,
    ingress_id: String,
    revision: i32,
) -> Result<crate::ingress_studio::StudioSpec, String> {
    transport.inner().clone().studio_get_revision(kind, ingress_id, revision).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_diff_mapping(
    transport: State<'_, Transport>,
    ingress_id: String,
    from_revision: i32,
    to_revision: i32,
) -> Result<crate::ingress_studio::StudioDiff, String> {
    transport.inner().clone().studio_diff_mapping(ingress_id, from_revision, to_revision).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_draft_mapping(
    transport: State<'_, Transport>,
    ingress_id: String,
    guidance: String,
    base_spec_json: Option<String>,
) -> Result<crate::ingress_studio::StudioDraft, String> {
    transport
        .inner()
        .clone()
        .studio_draft_mapping(ingress_id, guidance, base_spec_json.unwrap_or_default())
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_capture_status(
    transport: State<'_, Transport>,
    ingress_id: String,
) -> Result<crate::ingress_studio::StudioCaptureStatus, String> {
    transport.inner().clone().studio_capture_status(ingress_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_start_discovery(
    transport: State<'_, Transport>,
    ingress_id: String,
    intent: String,
    endpoint: String,
) -> Result<crate::ingress_studio::DiscoverySession, String> {
    transport.inner().clone().studio_start_discovery(ingress_id, intent, endpoint).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_get_discovery(
    transport: State<'_, Transport>,
    ingress_id: String,
    session_id: String,
) -> Result<crate::ingress_studio::DiscoverySession, String> {
    transport.inner().clone().studio_get_discovery(ingress_id, session_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_answer_discovery(
    transport: State<'_, Transport>,
    ingress_id: String,
    session_id: String,
    question_id: String,
    answer: String,
    expected_version: i32,
    proposal_revision: i32,
    idempotency_key: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport
        .inner()
        .clone()
        .studio_answer_discovery(
            ingress_id,
            session_id,
            question_id,
            answer,
            expected_version,
            proposal_revision,
            idempotency_key,
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_approve_origin(
    transport: State<'_, Transport>,
    ingress_id: String,
    session_id: String,
    scheme: String,
    host: String,
    port: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport
        .inner()
        .clone()
        .studio_approve_origin(ingress_id, session_id, scheme, host, port)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_accept_discovery(
    transport: State<'_, Transport>,
    ingress_id: String,
    session_id: String,
) -> Result<crate::ingress_studio::StudioSaveResult, String> {
    transport.inner().clone().studio_accept_discovery(ingress_id, session_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_comment_discovery(
    transport: State<'_, Transport>,
    ingress_id: String,
    session_id: String,
    comment: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_comment_discovery(ingress_id, session_id, comment).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_capture_samples(
    transport: State<'_, Transport>,
    ingress_id: String,
    limit: i32,
) -> Result<crate::ingress_studio::StudioCaptureSamples, String> {
    transport.inner().clone().studio_capture_samples(ingress_id, limit).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_preview(
    transport: State<'_, Transport>,
    ingress_id: String,
) -> Result<Vec<crate::ingress_studio::StudioPreviewEntry>, String> {
    transport.inner().clone().studio_preview(ingress_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_shadow_reprocess(
    transport: State<'_, Transport>,
    ingress_id: String,
    mapping_revision: i32,
    limit: i32,
) -> Result<String, String> {
    transport.inner().clone().studio_shadow_reprocess(ingress_id, mapping_revision, limit).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_promote_repair(
    transport: State<'_, Transport>,
    ingress_id: String,
    mapping_revision: i32,
    limit: i32,
    reason: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_promote_repair(ingress_id, mapping_revision, limit, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_set_credential(
    transport: State<'_, Transport>,
    ingress_id: String,
    name: String,
    value: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_set_credential(ingress_id, name, value).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_clear_credential(
    transport: State<'_, Transport>,
    ingress_id: String,
    name: String,
    reason: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_clear_credential(ingress_id, name, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_set_egress_policy(
    transport: State<'_, Transport>,
    ingress_id: String,
    policy_json: String,
) -> Result<crate::ingress_studio::StudioAck, String> {
    transport.inner().clone().studio_set_egress_policy(ingress_id, policy_json).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_studio_delivery_failures(
    transport: State<'_, Transport>,
    ingress_id: String,
) -> Result<Vec<crate::ingress_studio::StudioFailure>, String> {
    transport.inner().clone().studio_delivery_failures(ingress_id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_list_bots(
    transport: State<'_, Transport>,
) -> Result<Vec<crate::telegram::TelegramBot>, String> {
    transport.inner().clone().telegram_list_bots().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_add_bot(
    transport: State<'_, Transport>,
    id: String,
    label: String,
    token: String,
) -> Result<crate::telegram::TelegramAck, String> {
    transport.inner().clone().telegram_add_bot(id, label, token).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_remove_bot(
    transport: State<'_, Transport>,
    id: String,
    reason: String,
) -> Result<crate::telegram::TelegramAck, String> {
    transport.inner().clone().telegram_remove_bot(id, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_ingresses(transport: State<'_, Transport>) -> Result<Vec<IngressSpec>, String> {
    transport.inner().clone().list_ingresses().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_register_ingress(
    transport: State<'_, Transport>,
    ingress: IngressSpec,
) -> Result<SaveOutcome, String> {
    transport.inner().clone().register_ingress(ingress).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_deregister_ingress(
    transport: State<'_, Transport>,
    agent_id: String,
) -> Result<(), String> {
    transport.inner().clone().deregister_ingress(agent_id).await
}

// ── Identity bindings + ingress activity (contract 0077) ────────────────────
//
// These were declared on the webview client but never bridged, so every panel
// built on them rendered its "this kernel does not report that" branch against a
// kernel that does. The RPCs have been served since 0077.

#[tauri::command(rename_all = "snake_case")]
async fn op_list_principals(
    transport: State<'_, Transport>,
) -> Result<Vec<PrincipalSpec>, String> {
    transport.inner().clone().list_principals().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_identity_bindings(
    transport: State<'_, Transport>,
    surface: String,
) -> Result<Vec<IdentityBinding>, String> {
    transport.inner().clone().list_identity_bindings(surface).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_bind_identity(
    transport: State<'_, Transport>,
    binding: IdentityBinding,
    reason: String,
) -> Result<SaveOutcome, String> {
    transport.inner().clone().bind_identity(binding, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_unbind_identity(
    transport: State<'_, Transport>,
    surface: String,
    external_id: String,
    reason: String,
) -> Result<(), String> {
    transport
        .inner()
        .clone()
        .unbind_identity(surface, external_id, reason)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_unbound_senders(
    transport: State<'_, Transport>,
    surface: String,
) -> Result<Vec<UnboundSender>, String> {
    transport.inner().clone().list_unbound_senders(surface).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_block_sender(
    transport: State<'_, Transport>,
    surface: String,
    external_id: String,
    blocked: bool,
    reason: String,
) -> Result<(), String> {
    transport
        .inner()
        .clone()
        .block_sender(surface, external_id, blocked, reason)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_get_stranger_policy(
    transport: State<'_, Transport>,
    surface: String,
) -> Result<StrangerPolicy, String> {
    transport.inner().clone().get_stranger_policy(surface).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_set_stranger_policy(
    transport: State<'_, Transport>,
    policy: StrangerPolicy,
    reason: String,
) -> Result<SaveOutcome, String> {
    transport.inner().clone().set_stranger_policy(policy, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_ingress_activity(
    transport: State<'_, Transport>,
    surface: String,
    limit: i32,
) -> Result<IngressActivityPage, String> {
    transport.inner().clone().list_ingress_activity(surface, limit).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_save_group(
    transport: State<'_, Transport>,
    group: GroupSpec,
) -> Result<SaveOutcome, String> {
    transport.inner().clone().save_group(group).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_delete_group(transport: State<'_, Transport>, id: String) -> Result<(), String> {
    transport.inner().clone().delete_group(id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_policies(transport: State<'_, Transport>) -> Result<Vec<PolicySpec>, String> {
    transport.inner().clone().list_policies().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_save_policy(
    transport: State<'_, Transport>,
    policy: PolicySpec,
) -> Result<SaveOutcome, String> {
    transport.inner().clone().save_policy(policy).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_delete_policy(transport: State<'_, Transport>, id: String) -> Result<(), String> {
    transport.inner().clone().delete_policy(id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_links(transport: State<'_, Transport>) -> Result<Vec<LinkSpec>, String> {
    transport.inner().clone().list_links().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_link_policy(transport: State<'_, Transport>, link: LinkSpec) -> Result<(), String> {
    transport.inner().clone().link_policy(link).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_unlink_policy(
    transport: State<'_, Transport>,
    policy_id: String,
    container_kind: String,
    target_id: String,
) -> Result<(), String> {
    transport
        .inner()
        .clone()
        .unlink_policy(policy_id, container_kind, target_id)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_resultant_policy(
    transport: State<'_, Transport>,
    principal_id: String,
    principal_kind: Option<String>,
    surface_kind: Option<String>,
    surface_id: Option<String>,
) -> Result<ResultantPolicy, String> {
    transport
        .inner()
        .clone()
        .resultant_policy(
            principal_id,
            principal_kind.unwrap_or_default(),
            surface_kind.unwrap_or_default(),
            surface_id.unwrap_or_default(),
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_simulate_policy(
    transport: State<'_, Transport>,
    draft_policies: Option<Vec<PolicySpec>>,
    draft_links: Option<Vec<LinkSpec>>,
    limit: Option<i32>,
) -> Result<SimulationResult, String> {
    transport
        .inner()
        .clone()
        .simulate_policy(
            draft_policies.unwrap_or_default(),
            draft_links.unwrap_or_default(),
            limit.unwrap_or(0),
        )
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_export_decisions(
    transport: State<'_, Transport>,
    limit: Option<i32>,
    denials_only: Option<bool>,
) -> Result<Vec<DecisionRecord>, String> {
    transport
        .inner()
        .clone()
        .export_decisions(limit.unwrap_or(0), denials_only.unwrap_or(false))
        .await
}

// ---- Contract 0072-0076: the surfaces the console could not reach -----------
//
// The webview never speaks gRPC: every call crosses this boundary as a Tauri
// command into `transport.rs`. Vendoring the proto gives the Rust core the
// TYPES; without a command here the TS client's `invoke` fails with "command not
// found" and the screen renders its honest-degradation copy -- which reads as
// "the kernel does not serve this" even when the kernel serves it perfectly.
//
// None of these is capability-gated here. The kernel answers `Unimplemented`
// when a source is not wired, and the webview gates on the handshake, so the
// operator gets an empty state that names what to enable rather than an error.

#[tauri::command(rename_all = "snake_case")]
async fn op_list_generators(transport: State<'_, Transport>) -> Result<Vec<GeneratorSpec>, String> {
    transport.inner().clone().list_generators().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_list_role_assignments(
    transport: State<'_, Transport>,
) -> Result<Vec<RoleAssignment>, String> {
    transport.inner().clone().list_role_assignments().await
}

// ── MCP servers (contract 0097) ──────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn op_list_mcp_servers(
    transport: State<'_, Transport>,
) -> Result<Vec<MCPServerConfigSpec>, String> {
    transport.inner().clone().list_mcp_servers().await
}

/// Create or replace an MCP server. The kernel arms it LIVE — no restart.
#[tauri::command(rename_all = "snake_case")]
async fn op_save_mcp_server(
    transport: State<'_, Transport>,
    server: MCPServerConfigSpec,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().save_mcp_server(server, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_remove_mcp_server(
    transport: State<'_, Transport>,
    id: String,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().remove_mcp_server(id, reason).await
}

/// Write-only, exactly like a generator key.
#[tauri::command(rename_all = "snake_case")]
async fn op_set_mcp_server_token(
    transport: State<'_, Transport>,
    id: String,
    token: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().set_mcp_server_token(id, token).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_clear_mcp_server_token(
    transport: State<'_, Transport>,
    id: String,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().clear_mcp_server_token(id, reason).await
}

/// One ephemeral connection against a possibly-unsaved spec.
#[tauri::command(rename_all = "snake_case")]
async fn op_test_mcp_server(
    transport: State<'_, Transport>,
    server: MCPServerConfigSpec,
) -> Result<MCPServerTestResult, String> {
    transport.inner().clone().test_mcp_server(server).await
}

/// Contract 0096: bind a system organ to the generator that serves it.
///
/// The TS client has called this since the RoleMap grid was built; nothing
/// served it, so clicking a radio produced `Command op_set_role_assignment not
/// found` -- the same missing-bridge failure op_save_generator once had.
#[tauri::command(rename_all = "snake_case")]
async fn op_set_role_assignment(
    transport: State<'_, Transport>,
    role: String,
    generator_id: String,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport
        .inner()
        .clone()
        .set_role_assignment(role, generator_id, reason)
        .await
}

/// One real call against the live endpoint.
///
/// A failed probe is a SUCCESSFUL command carrying `reachable: false` -- the
/// operator asked "does this work?" and got an answer. Surfacing it as an error
/// would make a working diagnostic look like a broken console.
#[tauri::command(rename_all = "snake_case")]
async fn op_test_generator(
    transport: State<'_, Transport>,
    id: String,
) -> Result<GeneratorTestResult, String> {
    transport.inner().clone().test_generator(id).await
}

/// Contract 0083: create or replace a generator.
///
/// The TS client has called this since the panes were built; nothing served it,
/// so a Save produced `Command op_save_generator not found` -- a console error
/// for a missing bridge, which reads to an operator like a broken kernel.
#[tauri::command(rename_all = "snake_case")]
async fn op_save_generator(
    transport: State<'_, Transport>,
    generator: GeneratorSpec,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().save_generator(generator, reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_remove_generator(
    transport: State<'_, Transport>,
    id: String,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().remove_generator(id, reason).await
}

/// Write-only, exactly like the Telegram bot token: the key goes in and only its
/// last four ever come back. There is deliberately no getter anywhere.
#[tauri::command(rename_all = "snake_case")]
async fn op_set_generator_key(
    transport: State<'_, Transport>,
    id: String,
    key: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().set_generator_key(id, key).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_clear_generator_key(
    transport: State<'_, Transport>,
    id: String,
    reason: String,
) -> Result<ConfigWriteResult, String> {
    transport.inner().clone().clear_generator_key(id, reason).await
}

/// The read half of the runtime-config surface.
///
/// `value_source` is what it exists for: it names the layer supplying each key,
/// so a field pinned by an environment variable renders read-only NAMING the pin
/// instead of accepting a write that silently does nothing.
#[tauri::command(rename_all = "snake_case")]
async fn op_get_config_schema(transport: State<'_, Transport>) -> Result<ConfigSchema, String> {
    transport.inner().clone().get_config_schema().await
}

/// Classify a typed sentence WITHOUT acting on it.
///
/// The classification is one of FIVE values (chat | plan | ingest | watch |
/// clarification) and is passed through verbatim. `ingest` in particular must
/// not be collapsed into another: it WRITES to memory, so rendering it as a read
/// makes an operator approve a write believing they approved a question.
#[tauri::command(rename_all = "snake_case")]
async fn op_classify_input(
    transport: State<'_, Transport>,
    text: String,
) -> Result<ClassifiedInput, String> {
    transport.inner().clone().classify_input(text).await
}

/// Propose a plan without committing to one: no session, no plan, no spend.
#[tauri::command(rename_all = "snake_case")]
async fn op_propose_plan(
    transport: State<'_, Transport>,
    goal: String,
    answers: Option<Vec<String>>,
) -> Result<PlanProposalResponse, String> {
    transport
        .inner()
        .clone()
        .propose_plan(goal, answers.unwrap_or_default())
        .await
}

/// Run an operator-authored plan, or validate one with `dry_run`.
#[tauri::command(rename_all = "snake_case")]
async fn op_submit_plan(
    transport: State<'_, Transport>,
    steps: Vec<AuthoredStep>,
    reason: String,
    dry_run: Option<bool>,
) -> Result<SubmitPlanResult, String> {
    transport
        .inner()
        .clone()
        .submit_plan(steps, reason, dry_run.unwrap_or(false))
        .await
}

// ---- The identity plane's review lane (contract 0098) ---------------------
//
// `ListLinkCandidates` is a plain read. The two mutations carry the operator's
// reason across the bridge and nothing else: the `command_id` is generated in
// `links.rs`, because a webview-chosen key would make a double-click
// indistinguishable from a deliberate resend.

#[tauri::command(rename_all = "snake_case")]
async fn op_links_candidates(
    transport: State<'_, Transport>,
    namespace_id: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<crate::links::Link>, String> {
    transport
        .inner()
        .clone()
        .list_link_candidates(namespace_id.unwrap_or_default(), limit.unwrap_or(0))
        .await
}

/// Promote one candidate. The returned link is the APPENDED human-mechanism row,
/// not the candidate that was confirmed -- see `links.rs`.
#[tauri::command(rename_all = "snake_case")]
async fn op_links_confirm(
    transport: State<'_, Transport>,
    link_id: String,
    reason: String,
    namespace_id: Option<String>,
) -> Result<crate::links::LinkConfirmation, String> {
    transport
        .inner()
        .clone()
        .confirm_link(link_id, reason, namespace_id.unwrap_or_default())
        .await
}

/// Reject one candidate. Stamps state + retracted_at; never a delete.
#[tauri::command(rename_all = "snake_case")]
async fn op_links_retract(
    transport: State<'_, Transport>,
    link_id: String,
    reason: String,
    namespace_id: Option<String>,
) -> Result<CommandAck, String> {
    let deduped = transport
        .inner()
        .clone()
        .retract_link(link_id, reason, namespace_id.unwrap_or_default())
        .await?;
    Ok(CommandAck { deduped })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Transport::default())
        // Holds the running log tail so a restart replaces it rather than
        // stacking a second stream onto the same event channel.
        .manage(crate::logs::LogTail::default())
        .invoke_handler(tauri::generate_handler![
            op_login,
            op_login_saved,
            op_saved_connection,
            op_disconnect,
            op_get_state,
            op_create_session,
            op_send_message,
            op_inject_correction,
            op_open_conversation,
            op_send_turn,
            op_list_conversations,
            op_list_conversation_messages,
            op_close_conversation,
            op_pause_session,
            op_resume_session,
            op_resolve_hitl,
            op_set_tool_grant,
            op_set_scope,
            op_register_mcp,
            op_register_skill,
            op_trigger_consolidation,
            op_set_runtime_config,
            op_list_watch_configs,
            op_register_watch,
            op_delete_watch,
            op_set_watch_active,
            op_list_watch_dead_letters,
            op_get_watch_metrics,
            op_backtest_watch,
            op_preview_route,
            op_list_tools,
            op_list_skills,
            op_list_watches,
            op_list_pipelines,
            op_list_node_items,
            op_dry_run_pipeline,
            op_get_pipeline,
            op_validate_pipeline,
            op_save_pipeline,
            op_transition_pipeline,
            op_ingest_memory,
            op_ingest_file,
            op_stat_file,
            op_query_memory,
            op_answer_memory,
            op_complete_session,
            op_blast_radius_preview,
            op_get_config_schema,
            op_list_generators,
            op_list_role_assignments,
            op_set_role_assignment,
            op_list_mcp_servers,
            op_save_mcp_server,
            op_remove_mcp_server,
            op_set_mcp_server_token,
            op_clear_mcp_server_token,
            op_test_mcp_server,
            op_test_generator,
            op_save_generator,
            op_remove_generator,
            op_set_generator_key,
            op_clear_generator_key,
            op_classify_input,
            op_propose_plan,
            op_submit_plan,
            op_explain_access,
            op_list_classification_tags,
            op_list_groups,
            op_list_tags,
            op_list_documents,
            op_tag_memory,
            op_propose_policy,
            op_list_ingresses,
            op_telegram_status,
            op_telegram_set_token,
            op_telegram_clear_token,
            op_telegram_set_enabled,
            op_query_logs,
            op_start_log_tail,
            op_stop_log_tail,
            op_knowledge_ask,
            op_knowledge_query,
            op_knowledge_overview,
            op_knowledge_entities,
            op_list_alerts,
            op_get_drift_stats,
            op_list_refusals,
            op_list_retention_runs,
            op_get_coverage,
            op_get_push_status,
            op_telegram_list_bots,
            op_telegram_add_bot,
            op_telegram_remove_bot,
            op_studio_create_ingress,
            op_studio_list_ingresses,
            op_studio_get_ingress,
            op_studio_lifecycle,
            op_studio_arm,
            op_studio_rollback,
            op_studio_save_spec,
            op_studio_get_revision,
            op_studio_diff_mapping,
            op_studio_draft_mapping,
            op_studio_capture_status,
            op_studio_capture_samples,
            op_studio_start_discovery,
            op_studio_get_discovery,
            op_studio_answer_discovery,
            op_studio_approve_origin,
            op_studio_accept_discovery,
            op_studio_comment_discovery,
            op_studio_preview,
            op_studio_shadow_reprocess,
            op_studio_promote_repair,
            op_studio_set_credential,
            op_studio_clear_credential,
            op_studio_set_egress_policy,
            op_studio_delivery_failures,
            op_register_ingress,
            op_deregister_ingress,
            op_list_principals,
            op_list_identity_bindings,
            op_bind_identity,
            op_unbind_identity,
            op_list_unbound_senders,
            op_block_sender,
            op_get_stranger_policy,
            op_set_stranger_policy,
            op_list_ingress_activity,
            op_save_group,
            op_delete_group,
            op_list_policies,
            op_save_policy,
            op_delete_policy,
            op_list_links,
            op_link_policy,
            op_unlink_policy,
            op_resultant_policy,
            op_simulate_policy,
            op_export_decisions,
            op_links_candidates,
            op_links_confirm,
            op_links_retract,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
