//! Cambrian UI — Tauri Rust core.
//!
//! This is the ONLY layer that speaks gRPC to the runtime-core (ADR-0047). It
//! owns the client-side state of record (`state`), the Operator Transport Plane
//! client (`transport`), and the Tauri command/event bridge to the webview.

pub mod pb;
pub mod state;
pub mod transport;

use tauri::{AppHandle, State};

use state::{SkillSummary, StateOfRecord, ToolSummary};
use transport::{MemoryHit, Transport};

// ---- Tauri command bridge (webview → core → kernel) ---------------------
//
// Each command clones the Transport out of State before awaiting, so we never
// hold the State borrow across an await point. All mutating commands carry a
// mandatory `reason` (the kernel rejects empty reasons) and a generated
// command_id (idempotency) inside the transport layer.

#[tauri::command]
async fn op_login(
    app: AppHandle,
    transport: State<'_, Transport>,
    endpoint: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let t = transport.inner().clone();
    t.login(&app, endpoint, username, password).await
}

#[tauri::command]
async fn op_get_state(transport: State<'_, Transport>) -> Result<StateOfRecord, String> {
    let t = transport.inner().clone();
    let s = t.state.lock().await.clone();
    Ok(s)
}

#[tauri::command]
async fn op_create_session(
    transport: State<'_, Transport>,
    goal: String,
    reason: String,
) -> Result<String, String> {
    transport.inner().clone().create_session(goal, reason).await
}

#[tauri::command]
async fn op_send_message(
    transport: State<'_, Transport>,
    session_id: String,
    text: String,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().send_message(session_id, text, reason).await
}

#[tauri::command]
async fn op_inject_correction(
    transport: State<'_, Transport>,
    session_id: String,
    instruction: String,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().inject_correction(session_id, instruction, reason).await
}

#[tauri::command]
async fn op_pause_session(
    transport: State<'_, Transport>,
    session_id: String,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().session_command(true, session_id, reason).await
}

#[tauri::command]
async fn op_resume_session(
    transport: State<'_, Transport>,
    session_id: String,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().session_command(false, session_id, reason).await
}

// TODO(UI-IMPL-19): add op_complete_session when the kernel exposes a
// CompleteSession RPC. The proto is pinned at 0047 and has PauseSession /
// ResumeSession only. The webview already calls this command; the mock
// handles it; the Rust side returns "not implemented" until the contract
// bumps.

#[tauri::command]
async fn op_resolve_hitl(
    transport: State<'_, Transport>,
    intervention_id: String,
    approve: bool,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().resolve_hitl(intervention_id, approve, reason).await
}

#[tauri::command]
async fn op_set_tool_grant(
    transport: State<'_, Transport>,
    agent_id: String,
    tool_name: String,
    granted: bool,
    reason: String,
) -> Result<bool, String> {
    transport.inner().clone().set_tool_grant(agent_id, tool_name, granted, reason).await
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
#[tauri::command]
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
            text, content, filename, content_type, context, tags, importance, source, session_id,
            reason,
        )
        .await
}

/// Ranked recall — evidence, not an answer. See `Transport::query_memory`.
#[tauri::command]
async fn op_query_memory(
    transport: State<'_, Transport>,
    query: String,
    top_k: i32,
    source: String,
    session: String,
    min_importance: f64,
) -> Result<Vec<MemoryHit>, String> {
    transport
        .inner()
        .clone()
        .query_memory(query, top_k, source, session, min_importance)
        .await
}

#[tauri::command]
async fn op_set_scope(
    transport: State<'_, Transport>,
    agent_id: String,
    required_tags: Vec<String>,
    any_of_tags: Vec<String>,
    forbidden_tags: Vec<String>,
    reason: String,
) -> Result<bool, String> {
    transport
        .inner()
        .clone()
        .set_scope(agent_id, required_tags, any_of_tags, forbidden_tags, reason)
        .await
}

#[tauri::command]
async fn op_register_mcp(
    transport: State<'_, Transport>,
    name: String,
    command: String,
    url: String,
    reason: String,
) -> Result<bool, String> {
    transport
        .inner()
        .clone()
        .register_mcp(name, command, url, reason)
        .await
}

#[tauri::command]
async fn op_register_skill(
    transport: State<'_, Transport>,
    name: String,
    description: String,
    instructions: String,
    tool_grants: Vec<String>,
    scope_tags: Vec<String>,
    reason: String,
) -> Result<bool, String> {
    transport
        .inner()
        .clone()
        .register_skill(name, description, instructions, tool_grants, scope_tags, reason)
        .await
}

#[tauri::command]
async fn op_trigger_consolidation(
    transport: State<'_, Transport>,
    scope: String,
    reason: String,
) -> Result<bool, String> {
    transport
        .inner()
        .clone()
        .trigger_consolidation(scope, reason)
        .await
}

#[tauri::command]
async fn op_list_tools(transport: State<'_, Transport>) -> Result<Vec<ToolSummary>, String> {
    transport.inner().clone().list_tools().await
}

#[tauri::command]
async fn op_list_skills(transport: State<'_, Transport>) -> Result<Vec<SkillSummary>, String> {
    transport.inner().clone().list_skills().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Transport::default())
        .invoke_handler(tauri::generate_handler![
            op_login,
            op_get_state,
            op_create_session,
            op_send_message,
            op_inject_correction,
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
            op_ingest_memory,
            op_query_memory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
