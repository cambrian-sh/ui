//! Cambrian UI — Tauri Rust core.
//!
//! This is the ONLY layer that speaks gRPC to the runtime-core (ADR-0047). It
//! owns the client-side state of record (`state`), the Operator Transport Plane
//! client (`transport`), and the Tauri command/event bridge to the webview.

pub mod pb;
pub mod policy;
mod telegram;
pub mod state;
pub mod transport;

use tauri::{AppHandle, State};

use policy::{
    IngressSpec, PolicyProposal, TagSpec,
    AccessDecision, DecisionRecord, GroupSpec, LinkSpec, PolicySpec, ResultantPolicy, SaveOutcome,
    SimulationResult,
};
use state::{ConversationMessage, ConversationSummary, SkillSummary, StateOfRecord, ToolSummary, WatchConfigSummary};
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

#[tauri::command(rename_all = "snake_case")]
async fn op_get_config_schema() -> Result<serde_json::Value, String> {
    Err("not implemented: no GetConfigSchema RPC on the operator contract yet".into())
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
    Ok(FileStat { name, size: meta.len() })
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
    transport.inner().clone().propose_policy(request, simulate_limit).await
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
    transport.inner().clone().tag_memory(doc_id, tag, add, reason).await
}


// ---- Telegram ingress (ADR-0090) ------------------------------------------
//
// The token travels one way. There is no command that returns it, and none of these log
// their arguments — a console that can echo a credential leaks it to the screen, to a
// recording, and to whatever captures the log.

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_status(
    transport: State<'_, Transport>,
) -> Result<crate::telegram::TelegramStatus, String> {
    transport.inner().clone().telegram_status().await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_set_token(
    transport: State<'_, Transport>,
    token: String,
) -> Result<crate::telegram::TelegramAck, String> {
    transport.inner().clone().telegram_set_token(token).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_clear_token(
    transport: State<'_, Transport>,
    reason: String,
) -> Result<crate::telegram::TelegramAck, String> {
    transport.inner().clone().telegram_clear_token(reason).await
}

#[tauri::command(rename_all = "snake_case")]
async fn op_telegram_set_enabled(
    transport: State<'_, Transport>,
    enabled: bool,
) -> Result<crate::telegram::TelegramAck, String> {
    transport.inner().clone().telegram_set_enabled(enabled).await
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Transport::default())
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
            op_list_tools,
            op_list_skills,
            op_list_watches,
            op_ingest_memory,
            op_ingest_file,
            op_stat_file,
            op_query_memory,
            op_answer_memory,
            op_complete_session,
            op_blast_radius_preview,
            op_get_config_schema,
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
            op_register_ingress,
            op_deregister_ingress,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
