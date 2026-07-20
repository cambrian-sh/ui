# Handoff: Cambrian UI — missing projection fields (core side)

**From:** Doruk (UI)  **To:** Afşin (core / kernel)  **Re:** contract 0057 regression + graceful UI degradation
**Date:** 2026-07-20  **Branch state:** UI `main` restored & building

## Why this note exists

After the 0057 merge the UI broke because the webview assumed per-entity
**getter RPCs** (`GetTool`, `GetAgent`, `GetSkill`, `GetMCPServer`, `GetScope`,
`GetWatchConfig`) plus a set of **rich detail fields** projected onto `StateOfRecord`.
0057 removed those getters. The kernel's `OperatorConsole` proto is otherwise
**intact** (all 34 RPCs + messages present; verified identical to
`core/api/proto/operator.proto`).

**Decision:** the UI now reads everything from the projection (`getState()` /
`Snapshot` / `StreamEvents`) and degrades gracefully — detail screens show the
summary fields the kernel already projects and honestly omit the rich panels.
Action commands that map to live core RPCs are restored
(`SetScope`, `RegisterMCP`, `RegisterSkill`, `TriggerConsolidation`,
`ListTools`, `ListSkills`).

What follows is **exactly what core must add to `StateOfRecord`** (the
projection structs in `src/state.rs` + the `pb`/`StateOfRecord` message in
`operator.proto`) for each detail screen to show its full content again. No new
RPCs needed — only new **fields on the existing summary types** or a richer
projection. Everything below is additive.

---

## 1. Tool  (`tools: ToolSummary[]`)
Currently projected: `id, description, danger, granted_agent_count, recent_invocation_count, last_cost`
Missing for full detail:
- `manifest_version: string`
- `schema_json: string` (the tool's JSON schema, pretty or raw)
- `granted_agents: string[]` (agent ids currently granted — needed so the
  "Granted Agents" tab can list/toggle instead of only showing a count)

## 2. Skill  (`skills: SkillSummary[]`)
Currently projected: `id, description, scope_tags, loaded_in_count, last_loaded_at`
Missing for full detail:
- `bundled_tool_grants: string[]` (tool ids this skill bundles)
- `skill_md: string` (the rendered SKILL.md body)
- `where_loaded: string[]` (agent ids that have this skill loaded)

## 3. Agent  (`agents: AgentSummary[]`)
Currently projected: `id, trait, scope_summary, trust_score, last_activity_at, last_state`
Missing for full detail:
- `manifest_version: string`
- `manifest_json: string` (raw agent manifest)
- `cognitive_fingerprint: string`
- `trust_score_ewma: number` (the smoothed EWMA, distinct from `trust_score`)
- `recent_verification_outcomes: VerificationOutcome[]` (verifier round results)
- `last_error: string` (nullable)
- `last_successful_plan_id: string` (nullable)
- `scope: ScopeConfig` (the agent's full effective scope, not just `scope_summary`)

## 4. MCP server  (`mcp_servers: MCPServerSummary[]`)
Currently projected: `id, description, transport, url, connected, tool_count, current_agent_count`
Missing for full detail:
- `health_check_history: HealthCheck[]` (recent health probe results)
- `discovered_tools: string[]` (tools the server advertised on discovery)

## 5. Scope  (`scope: map<agent_id, ScopeSummary>`)
Currently projected: `agent_id, required_tags, any_of_tags, forbidden_tags, last_updated_at`
Missing for full detail:
- `effective_scope: ScopeConfig` (resolved scope after inheritance/blending)
- `k_anonymity_floor: number`
- `caller_scope: ScopeConfig` (the operator's own scope when viewing)
- `scope_change_history: ScopeChange[]` (prior versions + timestamps)

## 6. Watch  (`watch_configs: WatchConfigSummary[]`)
Currently projected: `id, description, is_active, last_fired_at, fire_count, target_agent`
Missing for full detail:
- `rule: string` (the full watch rule definition)
- `last_fires: WatchFire[]` (recent trigger events)
- `errors: string[]` (recent evaluation errors)

---

## Acceptance / how the UI consumes it
- Add the fields above to the corresponding `state::*Summary` structs in
  `src/tauri/src/state.rs` and to `StateOfRecord`/`*Summary` in
  `proto/operator.proto`, re-vendor, regenerate `pb`.
- The UI already reads these from the projection; once the fields exist, the
  detail screens' guarded "not projected by the current kernel build" notes can
  be replaced by real renders. No UI RPC changes required.
- Nothing here is breaking — it is additive to the projection contract.

## What the UI did NOT need (do not build)
- No per-entity getter RPCs. The projection is sufficient.
- No new mutation RPCs beyond the 6 already restored
  (`SetScope`, `RegisterMCP`, `RegisterSkill`, `TriggerConsolidation`,
  `ListTools`, `ListSkills`).
