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

// ---- Blast-radius preview (computed locally; no kernel RPC) ------------------

#[derive(serde::Deserialize)]
#[serde(tag = "kind")]
#[allow(dead_code)]
enum BlastRadiusMutation {
    #[serde(rename = "tag_memory")]
    TagMemory {
        doc_id: String,
        tag: String,
        add: bool,
    },
    #[serde(rename = "set_scope")]
    SetScope {
        agent_id: String,
        scope: ScopeConfigInput,
        mode: String,
    },
    #[serde(rename = "set_write_tags")]
    SetWriteTags {
        agent_id: String,
        tags: Vec<String>,
        mode: String,
    },
    #[serde(rename = "set_tool_grant")]
    SetToolGrant {
        agent_id: String,
        tool_name: String,
        granted: bool,
    },
}

#[derive(Clone, serde::Deserialize)]
struct ScopeConfigInput {
    required_tags: Vec<String>,
    any_of_tags: Vec<String>,
    forbidden_tags: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
struct EffectiveScope {
    required_tags: Vec<String>,
    any_of_tags: Vec<String>,
    forbidden_tags: Vec<String>,
    resolved_required: Vec<String>,
    resolved_any_of: Vec<String>,
    resolved_forbidden: Vec<String>,
}

#[derive(serde::Serialize)]
struct AgentImpact {
    agent_id: String,
    before_effective_scope: EffectiveScope,
    after_effective_scope: EffectiveScope,
    before_default_write_tags: Vec<String>,
    after_default_write_tags: Vec<String>,
    impact: String,
}

#[derive(serde::Serialize)]
struct PlanImpact {
    plan_id: String,
    re_evaluation_required: bool,
    reason: String,
}

#[derive(serde::Serialize)]
struct BlastRadiusPreviewResponse {
    affected_agents: Vec<AgentImpact>,
    affected_plans: Vec<PlanImpact>,
    computed_at: String,
    cache_ttl_ms: u64,
}

fn empty_scope() -> EffectiveScope {
    EffectiveScope {
        required_tags: vec![],
        any_of_tags: vec![],
        forbidden_tags: vec![],
        resolved_required: vec![],
        resolved_any_of: vec![],
        resolved_forbidden: vec![],
    }
}

fn scope_from_input(s: &ScopeConfigInput) -> EffectiveScope {
    EffectiveScope {
        required_tags: s.required_tags.clone(),
        any_of_tags: s.any_of_tags.clone(),
        forbidden_tags: s.forbidden_tags.clone(),
        resolved_required: s.required_tags.clone(),
        resolved_any_of: s.any_of_tags.clone(),
        resolved_forbidden: s.forbidden_tags.clone(),
    }
}

fn impact_from_mode(mode: &str) -> String {
    match mode {
        "widen" => "widened".to_string(),
        "narrow" => "narrowed".to_string(),
        _ => "unchanged".to_string(),
    }
}

#[tauri::command]
async fn op_blast_radius_preview(
    transport: State<'_, Transport>,
    mutation: BlastRadiusMutation,
) -> Result<BlastRadiusPreviewResponse, String> {
    let t = transport.inner().clone();
    let state = t.state.lock().await.clone();
    let computed_at = chrono::Utc::now().to_rfc3339();

    let (affected_agent_id, before_scope, after_scope, before_tags, after_tags, impact) =
        match &mutation {
            BlastRadiusMutation::SetToolGrant { agent_id, .. } => {
                let tags = state
                    .scope
                    .get(agent_id)
                    .map(|s| s.default_write_tags.clone())
                    .unwrap_or_default();
                (
                    agent_id.clone(),
                    empty_scope(),
                    empty_scope(),
                    tags.clone(),
                    tags,
                    "unchanged".to_string(),
                )
            }
            BlastRadiusMutation::SetScope { agent_id, scope, mode } => {
                let before_tags = state
                    .scope
                    .get(agent_id)
                    .map(|s| s.default_write_tags.clone())
                    .unwrap_or_default();
                (
                    agent_id.clone(),
                    empty_scope(),
                    scope_from_input(scope),
                    before_tags.clone(),
                    before_tags,
                    impact_from_mode(mode),
                )
            }
            BlastRadiusMutation::SetWriteTags { agent_id, tags, mode } => {
                let before_tags = state
                    .scope
                    .get(agent_id)
                    .map(|s| s.default_write_tags.clone())
                    .unwrap_or_default();
                (
                    agent_id.clone(),
                    empty_scope(),
                    empty_scope(),
                    before_tags,
                    tags.clone(),
                    impact_from_mode(mode),
                )
            }
            BlastRadiusMutation::TagMemory { .. } => {
                (String::new(), empty_scope(), empty_scope(), vec![], vec![], "unchanged".to_string())
            }
        };

    let mut affected_agents = vec![];
    if !affected_agent_id.is_empty() {
        affected_agents.push(AgentImpact {
            agent_id: affected_agent_id.clone(),
            before_effective_scope: before_scope,
            after_effective_scope: after_scope,
            before_default_write_tags: before_tags,
            after_default_write_tags: after_tags,
            impact,
        });
    }

    let affected_plans: Vec<PlanImpact> = if affected_agent_id.is_empty() {
        vec![]
    } else {
        state
            .plans
            .iter()
            .filter(|p| p.active_agent.as_deref() == Some(&affected_agent_id))
            .map(|p| PlanImpact {
                plan_id: p.plan_id.clone(),
                re_evaluation_required: true,
                reason: format!(
                    "active agent '{}' is affected by the proposed mutation",
                    affected_agent_id
                ),
            })
            .collect()
    };

    Ok(BlastRadiusPreviewResponse {
        affected_agents,
        affected_plans,
        computed_at,
        cache_ttl_ms: 5_000,
    })
}

// ---- UI-IMPL-21a stubs: subsystems read RPCs --------------------------------
// These 9 commands are placeholders. The kernel proto has been extended locally
// with the corresponding RPCs and messages, but the Rust-side gRPC calls and
// feed folding are deferred to UI-IMPL-21b (kernel-side contract bump to 0048).
// The webview can develop against the new types via the mock IPC; calling any
// of these stubs returns an error.

#[tauri::command]
async fn op_list_agents() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_get_agent() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_list_tools() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_get_tool() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_list_skills() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_get_skill() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_list_mcp_servers() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_get_mcp_server() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
}

#[tauri::command]
async fn op_get_scope() -> Result<String, String> {
    Err("not implemented: see UI-IMPL-21b".to_string())
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
            op_register_skill,
            op_register_mcp,
            op_blast_radius_preview,
            op_list_agents,
            op_get_agent,
            op_list_tools,
            op_get_tool,
            op_list_skills,
            op_get_skill,
            op_list_mcp_servers,
            op_get_mcp_server,
            op_get_scope,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
