//! Cambrian UI — Tauri Rust core.
//!
//! This is the ONLY layer that speaks gRPC to the runtime-core (ADR-0047). It
//! owns the client-side state of record (`state`), the Operator Transport Plane
//! client (`transport`), and the Tauri command/event bridge to the webview.

pub mod pb;
pub mod state;
pub mod transport;

use tauri::{AppHandle, State};

use state::StateOfRecord;
use transport::Transport;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
