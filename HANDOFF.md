# Cambrian Web UI — Handoff (2026-07-03)

> **Audience.** A fresh agent (or human) picking up the Web UI repo with no prior context. Read this file first, then `CONTEXT.md`, then the layer `CONTEXT.md`s.
>
> **Author.** The previous agent (Sisyphus / Minimax-M3). The work in scope: UI-IMPL-01…20, plus the AGPL-3.0 license, the 42-file docs migration, the repo split, and the Phase 2 plan below.

---

## 1. What this repo is

**Location:** `~/Code/cambrian/ui/` — a separate repo (NOT a subtree of `cambrian-runtime`).
**What it is:** A **Tauri 2** desktop app: Rust core (`src-tauri/`, gRPC client to the Cambrian runtime-core) + React 19 / TypeScript / Vite / Bun webview (`src/`).
**Kernel counterpart:** `~/Code/cambrian-runtime/` — the Go agent runtime. The UI talks to it via gRPC through the Rust core. **Never import from cambrian-runtime. The boundary is the `proto/operator.proto` contract at version `0047`.**

**Split history (read this to understand why the repo exists):**
- Originally `cambrian-runtime` was a monorepo containing the kernel + a Tauri UI.
- The UI was extracted into its own repo at `~/Code/cambrian/ui/` on **2026-07-02** (commit `7d046f2` "initial commit" of the new repo; commit `67e2c35` "Move all UI-related non-code docs from cambrian-runtime" on **2026-07-03**).
- The corresponding removal commits in `cambrian-runtime` are `e8adc92b` (docs removal) and earlier `feature/ui` branch work.
- **Git history was NOT transferred.** The UI repo started fresh; the `cambrian-runtime` history of UI work is on the `feature/ui` branch in the old repo if needed.

---

## 2. License

**AGPL-3.0** (full text at `LICENSE`). The kernel is **Elastic License 2.0**. The divergence is deliberate and meaningful:
- Kernel = source-available, restricts commercial use.
- UI = fully copyleft, including the AGPL §13 network-use clause (anyone hosting the UI as a network service must provide source).
- Anyone embedding both repos gets the union of obligations.

Copyright: 2026, Doruk Eray and Hakan Afşin (matches kernel `MAINTAINERS.md`).

---

## 3. Architecture in one paragraph

Two hops, three layers:
```
Go kernel ──gRPC/HTTP2 (tonic, ONE conn)──> Rust core (src-tauri) ──Tauri IPC──> Webview (src)
 [runtime-core]      [the transport client]      [state of record]        [a projection/cache]
```

- **Rust core = state of record.** Holds the gRPC client, folds the `StreamEvents` feed into typed state, handles auth + recovery + reconnect. Exposes Tauri commands and events to the webview.
- **Webview = projection.** Zustand store hydrated from Tauri events. Screens consume the store; they never speak gRPC and never open sockets.
- **Vendored contract = `proto/operator.proto`** (pinned to `0047`). Re-vendor from kernel `api/proto/operator.proto` when the contract bumps.

Full detail in `CONTEXT.md`, `src-tauri/CONTEXT.md`, `src/CONTEXT.md`.

---

## 4. Where things live (canonical map)

| Path | Role |
|---|---|
| `CONTEXT.md` | Project source of truth. Read first. |
| `src-tauri/` | Rust core: gRPC client, feed-fold, auth, recovery, Tauri bridge. Detail in `src-tauri/CONTEXT.md`. |
| `src-tauri/src/lib.rs` | Tauri command surface (9 `op_*` commands). One TODO marker: `op_complete_session` is stubbed; wire to kernel in next proto bump. |
| `src-tauri/proto/` | Vendored `operator.proto` (pinned to `0047`). DO NOT EDIT. |
| `src/` | Webview (React 19 + TS + Vite + Bun). Detail in `src/CONTEXT.md`. |
| `src/ipc/` | Tauri IPC client + mock. `client.ts` for prod, `mock.ts` for tests. Same shape. |
| `src/ipc/types.ts` | The IPC contract (mirrors kernel ADR-0047). |
| `src/store/` | `projection.ts` (Zustand vanilla store, hydrate/fold/reset), `shell.ts` (panel widths, theme, density), `useStore.ts` (React hook). |
| `src/design-system/` | The custom shadcn/ui + Cambrian components. Tokens, primitives, Cambrian-specific (nav-rail, status-strip, plan-card, etc.). |
| `src/components/Shell.tsx` | The 3-column shell: nav-rail (left) + route outlet (centre) + right inspector (always renders `PlanWorkSurface`). |
| `src/routes/` | File-based TanStack Router. 14 routes (1 root + 13 console surfaces). Auto-generated route tree in `routeTree.gen.ts`. |
| `src/screens/` | One folder per PRD surface. Each folder has the main component(s) + tests. |
| `src/lib/` | Shared utilities: `relativeTime`, `keyboard`, `useFocusedPlan`, `env`. |
| `docs/` | All UI spec: 7 thematic PRDs, 17 ADRs, tech doc, requirements, design session. See `docs/README.md`. |
| `docs/README.md` | Documentation index — start here for the spec. |
| `docs/prd/01-foundation.md` | **Read first** among PRDs: the design system, token taxonomy, keyboard map, state vocabulary. |
| `docs/tech/web-ui-tech-doc.md` | The implementation contract. §12 has the ticket breakdown (UI-IMPL-01…47). |
| `proto/operator.proto` | Vendored contract at version `0047`. |

---

## 5. Build & verify (the four commands)

```bash
cd ~/Code/cambrian/ui
bun install                                    # one-time, ~2s
bun run typecheck                              # tsc --noEmit, must be 0 errors
bunx vitest run                                # 29/29 tests, ~2.5s
bun run build                                  # vite build, must stay under 200 kB gzip main
```

Tauri build (full desktop binary):
```bash
cd ~/Code/cambrian/ui
bun run tauri dev                              # dev mode
bun run tauri build                            # release binary
```

Tauri build prerequisites: `protoc` with Google well-known types (vendored via `protoc-bin-vendored = "3"` in `src-tauri/Cargo.toml`); `build.rs` sets `PROTOC` env var to the vendored path. Already configured.

**Performance budget:** main JS bundle < 200 kB gzip. Current: **145.11 kB gzip**. Plans chunk (code-split, lazy): **2.41 kB gzip**.

---

## 6. Implementation status (as of 2026-07-03)

| Range | Status | Tests |
|---|---|---|
| UI-IMPL-01…18 (vertical slice) | ✅ Done | covered |
| UI-IMPL-19 (Console Sessions, PRD-06 §4) | ✅ Done | 5 tests |
| UI-IMPL-20 (Console Plans in Flight, PRD-06 §5) | ✅ Done | 17 tests (8 plans + 5 plan-filters + 4 useFocusedPlan) |
| UI-IMPL-21a (Data model extension, webview-side) | ✅ Done | 5 tests (mock IPC subsystem entities) |
| **Total** | **21/47 tickets** | **34/34 pass** |

**The next 4 tickets are Phase 2 (P1 subsystems read views).** See §10 below for the full plan. The data model bridge (UI-IMPL-21a) is done. Agents (UI-IMPL-22) is next.

---

## 7. Key conventions (must follow)

From the project `AGENTS.md` and `CLAUDE.md`:
- **Step by step, ask the user for sign-off between tickets.** Don't auto-chain.
- **No comments unless the design intent is non-obvious.** Section headers like `/* === Component: Card === */` are fine; explanatory paragraphs are not.
- **No `#hex` literals in component code.** Use semantic tokens (`--accent-bg`, `--fg-primary`, etc.).
- **No comments that restate the code.** The code IS the documentation.
- **Use the design-system components.** Never write raw `<button>`, `<input>`, etc. Import from `@/design-system/components`.
- **Use semantic tokens, never literal values.** `bg-[var(--bg-canvas)]`, not `bg-[#0a0a0a]`.
- **No `as any`, `@ts-ignore`, `@ts-expect-error`.** Fix the types.
- **No empty catch blocks.** No swallowing errors.
- **Don't expand scope beyond what was asked.** If something seems off, raise it; don't silently "fix" it.
- **After any refactor/implementation, update `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`.**

From the kernel `AGENTS.md` (inherited):
- **Zero-Hardcode Rule.** Routing logic must never appear as Go `if-else`/`switch`; it belongs in the LLM (Awareness) layer. **For the UI**, the parallel rule is: don't hardcode business logic in component code; derive from the projection store + URL state.
- **Hexagonal separation.** `internal/` tree in the kernel. **For the UI**, the parallel rule: the webview never speaks gRPC; the Rust core never renders UI. The boundary is `src/ipc/`.
- **Kernel vocabulary, verbatim.** Use the terms from `CONTEXT.md` §7 (Substrate, Handoff, ExecutionPlan, Step, Planner, Gatekeeper, Auctioneer, Verifier, etc.). Don't invent synonyms.

---

## 8. Test patterns (proven, copy these)

### 8.1 Projection store tests
```ts
import { projectionStore } from '@/store/projection';
projectionStore.getState().reset();
projectionStore.getState().hydrate(makeState([]));
```

### 8.2 Router hook tests (TanStack Router has no MemoryRouter; RouterProvider doesn't take children)
```ts
const searchState: { focus: string | undefined } = { focus: undefined };
const navigateMock = vi.fn((opts: { search?: { focus?: string } }) => {
  if (opts.search?.focus !== undefined) searchState.focus = opts.search.focus;
});
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));
```

### 8.3 react-hotkeys-hook test (the library respects `enabled` at runtime)
```ts
type HotkeyHandler = (e: { key: string; preventDefault: () => void }) => void;
let capturedHandler: HotkeyHandler | null = null;
let capturedEnabled: boolean | null = null;
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: (_keys: string, handler: HotkeyHandler, options?: { enabled?: boolean }) => {
    capturedHandler = (e) => { if (options?.enabled === false) return; handler(e); };
    capturedEnabled = options?.enabled ?? true;
  },
}));
```

### 8.4 Seed the mock IPC for integration tests
The mock IPC is a drop-in replacement for the real client. Use `@/ipc/mock`'s `__seed`, `__addPlan`, `__addSession`, `__addAuditEntry` helpers to set up state. After UI-IMPL-21a, there will also be `__seedAgents`, `__seedTools`, `__seedSkills`, `__seedMCPServers`, `__seedScope`.

### 8.5 `navigate` to a route with required search params
Some routes have `validateSearch` with required fields. Pass `search` explicitly:
```ts
navigate({ to: '/sessions', search: { focus: undefined } })
```

---

## 9. Known gotchas

1. **`react-hotkeys-hook` v5 API.** The option is `enableOnFormTags` (not `enableOnFormFields` like v3). The type `OptionsOrDependencyArray = Options | DependencyList` means you can't reliably pass a deps array as a 4th arg — just drop it, the hook re-binds on every render.

2. **`useSearch` works outside the route component.** It's available anywhere in the router context, including the Shell (which is outside the outlet). This is how `PlanWorkSurface` (Shell-mounted) can read `?focus=plan_id`.

3. **The right inspector is always `PlanWorkSurface`.** When on `/plans?focus=plan_x`, the Shell's right inspector shows that plan. When on `/sessions`, it shows `plans[0]`. Don't try to render a second `PlanWorkSurface` inside a route — just use the Shell's. (For Agents/Tools/Skills/MCP/Scope, the inspector will show the resource's own detail, not a plan work surface — the Shell's right inspector stays `PlanWorkSurface` for the plan context; the new screens render their detail in their own route-level right column, like Sessions does. See §10 for per-screen layout.)

4. **TanStack Router `Link`/`navigate` requires explicit `search`** when the target route has `validateSearch`. Don't use `asChild` on Button with `Link` — just use `navigate` in an `onClick`.

5. **`@xyflow/react` (React Flow) is lazy-loaded.** It's 275 kB raw / 90 kB gzip. Only loaded when the user opens the DAG view in a plan's work surface. Don't import it eagerly.

6. **`dagre` is the graph layout library.** Used in `PlanGraph.tsx` for the DAG layout. Deterministic and stable.

7. **The projection store is a vanilla Zustand store.** Subscribe via `useStore(store)` from `src/store/useStore.ts` (uses `useSyncExternalStore`). Don't use the `zustand` React hooks — they're not wired in.

8. **The mock IPC is the test IPC.** Tests import from `@/ipc/mock`, not `@/ipc`. The mock has the same shape as the real client.

9. **The nav-rail has 13 entries (11 console + Audit + Settings).** The order is fixed: Sessions, Plans in Flight, Agents, Tools & Skills, MCP, Memory, Scope, Watch, Lifecycle, Verifier, Cost, Audit, Settings.

10. **The `g p` shortcut is "Go to Plans in Flight."** The `1`…`9` hotkey for plans only fires when the plans list has focus (per PRD-01 §9, refined by the user).

11. **Tabs in TanStack Router** use `?tab=foo` in the URL. The `validateSearch` for the Tools & Skills route is `{ tab?: 'tools' | 'skills', focus?: string }`. The active tab is read from `?tab`; default to `'tools'`.

12. **The data model gap (see §10).** The proto at v0047 doesn't have Agents, Tools, Skills, MCP, or Scope data. UI-IMPL-21a extends the vendored proto + webview types + mock IPC locally; UI-IMPL-21b (kernel-side) bumps the contract to 0048 and implements the new Tauri commands.

---

## 10. Phase 2 plan — P1 Subsystems Read Views

This is the next phase. 5 tickets. The user (you, the new agent) will execute them one at a time, with sign-off between each.

### Why Phase 1.5 exists

The next 4 UI screens (Agents, Tools & Skills, MCP, Scope) all need data for Agents, Tools, Skills, MCP, and Scope. But the vendored proto (v0047) and the webview's `StateOfRecord` only have Plans, Sessions, Audit, and HITL. So Phase 1.5 (the data model bridge) must land before the UI screens.

**Phase 1.5 is split into a webview-side ticket (in this repo) and a kernel-side ticket (in `cambrian-runtime`).** The webview-side ticket can be done independently — it extends the vendored proto locally and implements the new RPCs in the mock IPC, so the UI can be developed and tested without waiting for the kernel. The kernel-side ticket is a separate coordination item.

### UI-IMPL-21a — Data model extension (webview-side) — **prerequisite for 22…25**

| Aspect | Detail |
|---|---|
| **Scope** | Extend the vendored proto + webview IPC types + mock IPC + projection store with 5 new entity types. |
| **Proto (`proto/operator.proto`)** | Add 10 messages: `AgentSummary`, `AgentDetail`, `ToolSummary`, `ToolDetail`, `SkillSummary`, `SkillDetail`, `MCPServerSummary`, `MCPServerDetail`, `ScopeSummary`, `ScopeDetail`. Add 9 RPCs: `ListAgents`, `GetAgent`, `ListTools`, `GetTool`, `ListSkills`, `GetSkill`, `ListMCPServers`, `GetMCPServer`, `GetScope`. **Add a `// TODO(UI-IMPL-21b): re-vendor from kernel after contract bump to 0048` comment at the top** so the local extension is visible. |
| **Webview IPC types (`src/ipc/types.ts`)** | Mirror the new proto messages. Add new fields to `StateOfRecord`: `agents: AgentSummary[]`, `tools: ToolSummary[]`, `skills: SkillSummary[]`, `mcp_servers: MCPServerSummary[]`, `scope: Record<agent_id, ScopeSummary>`. |
| **Mock IPC (`src/ipc/mock.ts`)** | Implement the 9 new RPCs with seed data. Add `__seedAgents`, `__seedTools`, `__seedSkills`, `__seedMCPServers`, `__seedScope` test helpers. Extend `initialState()` with the new fields (empty arrays / empty record). |
| **Real client (`src/ipc/client.ts`)** | Add 9 new wrappers: `ipc.listAgents()`, `ipc.getAgent(id)`, `ipc.listTools()`, `ipc.getTool(id)`, `ipc.listSkills()`, `ipc.getSkill(id)`, `ipc.listMCPServers()`, `ipc.getMCPServer(id)`, `ipc.getScope(agentId)`. |
| **Rust core stubs (`src-tauri/src/lib.rs`)** | Add the 9 new `#[tauri::command]` stubs that return `Err("not implemented: see UI-IMPL-21b")`. They are not called from the webview until 21b lands. |
| **Tests** | New `src/ipc/mock.test.ts`: seed 2 agents, 3 tools, 2 skills, 1 MCP server, 1 scope; verify `getState()` returns them; verify `listAgents` returns the seeded agents; verify `getAgent('a1')` returns the right one; verify `getScope('a1')` returns the seeded scope. **Target: 5 tests.** |
| **Verification** | typecheck + build + vitest. Expect 29 → 34 tests. Bundle delta: ~3 kB gzip (types only, no UI). |
| **NOT in scope** | Kernel-side proto + Rust core implementation. The webview can develop against the extended types with the mock; the real IPC calls return errors until 21b. |

### UI-IMPL-21b — Data model implementation (kernel-side) — **BLOCKED, lives in `cambrian-runtime`**

| Aspect | Detail |
|---|---|
| **Scope** | Bump the kernel proto to 0048 (add the same 10 messages + 9 RPCs as 21a). Implement the 9 Tauri commands in `src-tauri/src/lib.rs` (replace the 21a stubs). Implement the gRPC client calls in the Rust core's gRPC layer. Fold the new data into the StateOfRecord from the kernel's `StreamEvents` feed. |
| **Where** | `~/Code/cambrian-runtime/` repo. NOT this UI repo. |
| **Coordination** | The UI's vendored proto (from 21a) is a local extension. When 21b is done, re-vendor from the kernel's `api/proto/operator.proto` and remove the TODO comment. Update the kernel's `docs/adr/0047-operator-transport-plane.md` (or its successor) to record the new types. |
| **This ticket is BLOCKED by the user** — it's kernel-side work that lives in a different repo. The user needs to coordinate with the kernel team or do it themselves. The UI work (21a, 22…25) can proceed independently. |

### UI-IMPL-22 — Console — Agents (PRD-06 §6) — **depends on 21a**

| Aspect | Detail |
|---|---|
| **Route** | `/agents` |
| **Layout** | 2-column (same as Sessions): filter bar (top) + list (left, full width) + detail (right, 360px in route-level aside). The Shell's right inspector still shows `PlanWorkSurface` (the agent detail is a route-level component, not a Shell component). |
| **Files to create** | `src/screens/agents/AgentsConsole.tsx`, `AgentListRow.tsx`, `AgentFilters.tsx`, `AgentDetail.tsx`, `AgentTraitPill.tsx`, `useFocusedAgent.ts`, `agents.test.tsx`, `agent-filters.test.tsx` |
| **Files to modify** | `src/routes/agents.tsx` (replace placeholder; add `validateSearch: { focus: agent_id }`) |
| **Row data** (PRD-06 §6) | `id`, `trait` pill (Cognitive/Model/Daemon), `scope_summary`, `TrustScore`, `last_activity`, `last_state` |
| **Detail** | Header (id, trait, manifest_version, last_state) + Tabs: Genotype (manifest, cognitive_fingerprint if Cognitive, scope) + History (TrustScore EWMA, recent verification outcomes, last error, last successful plan) |
| **Filters** | trait (3 toggles), scope (free text), state (free text) |
| **Read-only** | No mutating actions — deferred to P2 (UI-IMPL-30). |
| **Empty state** | "No agents registered." + "Register agent" affordance (disabled with tooltip "Registration is operator-only and ships in P2"). |
| **Tests** | empty state, list rendering, trait filter, click → `?focus`, focus drives detail. **Target: 6 tests.** |
| **Verification** | typecheck + build + vitest. Expect 34 → 40 tests. |

### UI-IMPL-23 — Console — Tools & Skills (PRD-06 §7) — **depends on 21a**

| Aspect | Detail |
|---|---|
| **Route** | `/tools` |
| **Layout** | Tabbed (Tabs component from `@/design-system/components`): "Tools" tab + "Skills" tab. Tab in URL: `?tab=tools` (default) or `?tab=skills`. 2-column inside each tab: list (left) + detail (right, 360px). |
| **Files to create** | `src/screens/tools/ToolsSkillsConsole.tsx`, `ToolsList.tsx`, `ToolsListRow.tsx`, `ToolDetail.tsx`, `SkillsList.tsx`, `SkillsListRow.tsx`, `SkillDetail.tsx`, `useFocusedTool.ts`, `useFocusedSkill.ts`, `tools.test.tsx`, `skills.test.tsx` |
| **Files to modify** | `src/routes/tools.tsx` (replace placeholder; add `validateSearch: { tab?: 'tools'\|'skills', focus?: string }`) |
| **Tools row** | `id`, description (Tier-1 summary, PRD-01 §4.2 mono), danger flag, granted-agent count, recent-invocation count, last cost |
| **Tools detail** | Header (id, manifest_version, danger flag, schema Tier-1) + Tabs: Granted Agents + Recent Invocations (status filter) |
| **Skills row** | `id`, description, scope tags, loaded-in count, last loaded |
| **Skills detail** | Header (id, scope tags) + Tabs: SKILL.md (rendered markdown, mono for code blocks) + Bundled Tool Grants + Where Loaded |
| **Filters** | Per tab: Tools (danger flag toggle, search); Skills (scope-tag placeholder, search) |
| **Read-only** | No "Adjust grants" or "Register" — P2. |
| **Empty states** | Tools: "No tools registered." Skills: "No skills registered." |
| **Tests** | tab switching, tools list + filter, tool detail, skills list + filter, skill detail. **Target: 8 tests.** |
| **Verification** | typecheck + build + vitest. Expect 40 → 48 tests. |

### UI-IMPL-24 — Console — MCP (PRD-06 §8) — **depends on 21a**

| Aspect | Detail |
|---|---|
| **Route** | `/mcp` |
| **Layout** | 2-column (filter bar + list + detail). Detail in route-level aside. |
| **Files to create** | `src/screens/mcp/MCPConsole.tsx`, `MCPListRow.tsx`, `MCPDetail.tsx`, `MCPHealthBadge.tsx`, `useFocusedMCPServer.ts`, `mcp.test.tsx` |
| **Files to modify** | `src/routes/mcp.tsx` (replace placeholder; add `validateSearch: { focus: server_id }`) |
| **Row data** | `id`, connection state pill (Up/Reconnecting/Down), tool count, last health check timestamp, default price |
| **Detail** | Header + Connection State (the `MCPHealthBadge` + recent health-check timestamps + reconnect history + per-server default price) + Discovered Tools (list of `mcp:<server>/<tool>` with Tier-1 summaries, re-syncs on `mcpToolSink` event) |
| **Filters** | connection state (3 toggles), free-text search |
| **Read-only** | No Register/Update/Remove — P2. |
| **Empty state** | "No MCP connections." |
| **Tests** | empty state, list, connection-state filter, click → focus, detail shows discovered tools. **Target: 5 tests.** |
| **Verification** | typecheck + build + vitest. Expect 48 → 53 tests. |

### UI-IMPL-25 — Console — Scope (PRD-06 §10) — **depends on 21a**

| Aspect | Detail |
|---|---|
| **Route** | `/scope` |
| **Layout** | 2-column (filter bar + list + detail). Detail in route-level aside. |
| **Files to create** | `src/screens/scope/ScopeConsole.tsx`, `ScopeListRow.tsx`, `ScopeDetail.tsx`, `EffectiveScopeList.tsx` (the three-set predicate renderer: RequiredTags / AnyOfTags / ForbiddenTags), `scope.test.tsx` |
| **Files to modify** | `src/routes/scope.tsx` (replace placeholder; add `validateSearch: { focus: agent_id }`) |
| **Row data** | `agent_id`, EffectiveScope summary (tag counts), DefaultWriteTags summary (tag list), last scope change timestamp |
| **Detail** | Header (agent_id) + Sections: EffectiveScope (read-only, three-set predicate) + DefaultWriteTags (mutable label, action deferred) + CallerScope (read-only) + k-anonymity floor (read-only, from `KAnonymityFloor`) + Audit History (list of scope changes) |
| **Filters** | free-text search (agent_id + tag names) |
| **Read-only** | No "Adjust scope" or "Adjust write tags" — P2 (blast-radius panel gates these). |
| **Empty state** | "No agents to scope." (rare) |
| **Tests** | empty state, list (one row per agent), click → focus, EffectiveScopeList renders 3 tag sets, audit history renders. **Target: 5 tests.** |
| **Verification** | typecheck + build + vitest. Expect 53 → 58 tests. |

### Phase 2 totals

| | Tickets | New tests | Bundle delta |
|---|---|---|---|
| **Phase 1.5 (21a)** | 1 | 5 | ~3 kB gzip (types only) |
| **Phase 2 (22…25)** | 4 | 24 | ~10 kB gzip (4 new screens, shared components reused) |
| **Total** | **5 tickets** | **+29 tests** | **~13 kB gzip** |

Estimated bundle after Phase 2: **~158 kB gzip** (still under 200 kB budget).

### After Phase 2

| Range | What's next |
|---|---|
| UI-IMPL-26…28 (P2: Watch, Lifecycle, Verifier, Cost) | After P1. Cost needs a new design (UI-014, lightweight + link-out + CSS-only Sparkline). |
| UI-IMPL-29 (kernel blast-radius command) | Blocks P3. Kernel-side work. |
| UI-IMPL-30 (per-resource mutating actions + blast-radius panel) | The five-part form pattern from PRD-07 §4.1. |
| UI-IMPL-31…35 (P3 Memory) | Compare, graph, bulk, advanced filters, cards. |
| UI-IMPL-36…39 (P4 Audit & export) | Deep-link, CSV/JSON export, streaming. |
| UI-IMPL-40…44 (P5 Configuration) | Settings → Runtime/UI/Profiles. |
| UI-IMPL-45…47 (P6 Polish & a11y) | Final pass. |

---

## 11. Files added or modified in this handoff window

**Added (UI-IMPL-20 + cleanup):**
- `src/screens/plans/PlanStatePill.tsx`
- `src/screens/plans/PlanFilters.tsx`
- `src/screens/plans/PlanListRow.tsx`
- `src/screens/plans/PlansInFlight.tsx`
- `src/screens/plans/plan-filters.test.tsx`
- `src/screens/plans/plans.test.tsx`
- `src/lib/useFocusedPlan.ts`
- `src/lib/useFocusedPlan.test.ts`
- `LICENSE` (AGPL-3.0)
- `HANDOFF.md` (this file, updated 2026-07-03 with Phase 2 plan)

**Modified:**
- `src/routes/plans.tsx` (replaced placeholder; added `validateSearch: focus`)
- `src/screens/plan/PlanWorkSurface.tsx` (uses `useFocusedPlan` instead of `plans[0]`)
- `CONTEXT.md` (Implementation Status table updated)

---

## 12. Open paperwork (not blocking, but worth knowing)

These are the 8 todos from `docs/ui-session/10-final-todos.md` that were deferred when the user picked "Only thematic PRDs + ADRs" as the scope. The most consequential for the next session:

1. **Update `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`** after every implementation. (This handoff updates `CONTEXT.md`; `CURRENT_CODEBASE_STATE.md` doesn't exist yet — create it when the project hits its first release, or as part of Phase 2's last ticket.)

2. **Verify the on-disk UX PRD** for the three known drifts from `docs/prd/README.md` §9:
   - The "theme density" shortcut ambiguity
   - The "P6 light mode (if V1)" qualifier
   - The settings V1 scope cut

3. **The "ready to develop" checklist** — the 10 questions for the technical document, per parent UX PRD §14. Mostly answered now by the tech doc itself.

4. **UX PRD edits** — verify each of the 11 locked decisions (LD-1…LD-11) is reflected in the thematic PRDs and the tech doc.

---

## 13. One more thing: the two repos' relationship

The UI repo is `~/Code/cambrian/ui/`. The kernel repo is `~/Code/cambrian-runtime/`. They share:

1. **The contract.** `proto/operator.proto` is vendored into the UI at `~/Code/cambrian/ui/proto/operator.proto` (and also at `src-tauri/proto/`). When the kernel bumps the contract, the UI must re-vendor. Use the `make proto` / `make proto-breaking` workflow in the kernel repo.

2. **The terminology.** Substrate, Handoff, ExecutionPlan, etc. — all from kernel `CONTEXT.md` §7. The UI uses these verbatim.

3. **Nothing else.** No shared code, no shared package, no shared CI. The repos are independent. If you need to look at the kernel, read it in `~/Code/cambrian-runtime/` — don't import from it.

The kernel's `cambrian-cli/` is a separate repo (`~/Code/cambrian/cli/`) and is NOT related to the UI repo. Different scope: CLI vs. desktop GUI.
