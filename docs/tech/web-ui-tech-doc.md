# Cambrian Web UI — Technical Document

**Status:** Draft v0.1 — for review.
**Parents:** [`../prd/web-ui-ux-prd.md`](../prd/web-ui-ux-prd.md) v0.1 (parent UX PRD) · [`../prd/README.md`](../prd/README.md) (thematic PRDs) · [`../adr/`](../adr/) (17 ADRs).
**Scope:** This document is the **bridge from the 7 thematic PRDs + 17 ADRs to actual implementation tickets**. It specifies the Tauri 2 configuration, the webview file layout, the build commands, the kernel-side contract additions, the proto sync process, the mock Tauri IPC layer, the performance budget, and the implementation ticket breakdown. It does **not** re-decide what the PRDs and ADRs have already locked; it operationalises them.

**Audience:** The implementation team. Every section is a ticket, a config, a command, or a contract.

---

## 1. Scope and relationship to the PRDs and ADRs

### 1.1 What this document IS

- The implementation contract for the 7 PRDs and 17 ADRs.
- The Tauri 2 configuration: `tauri.conf.json`, capabilities, bundle, signing, icons.
- The **2 kernel-side contract additions** the implementation needs (the new Tauri commands that the PRDs + ADRs depend on but the existing Rust core does not yet expose).
- The proto file management process (sync, versioning, contract bump).
- The webview file layout: the concrete `./ui/` directory structure.
- The build commands, the dev workflow, the local + CI test stack.
- The **mock Tauri IPC layer** for unit / component / a11y tests.
- The performance budget, the observability story, the runtime config schema.
- The implementation ticket breakdown: the vertical slice + P1–P6 (per the parent UX PRD §13), with concrete tickets per phase.

### 1.2 What this document IS NOT

- **Not** a re-decision of the PRDs. Locked decisions stay locked (LD-1…LD-11, EC-1…EC-5, the 17 ADRs).
- **Not** a replacement for the ADRs. The ADRs are the per-decision record; this document is the operationalisation.
- **Not** a getting-started guide. That's in `ui/README.md` (per the explore's findings).
- **Not** a deployment guide. The deployment is the kernel's territory; the Tauri shell is the artifact the kernel loads.
- **Not** a user guide. The UX is the PRDs' job; this document is engineering.

### 1.3 What's already locked (do not re-decide here)

| Locked by | Decision |
|:---|:---|
| EC-1 | Tauri 2 desktop shell. |
| EC-2 | React 19 + TypeScript + Vite. |
| EC-3 | Bun for JS package management and dev/build. |
| EC-4 | gRPC in Rust core only; webview touches only Tauri IPC. |
| EC-5 | Vendored `ui/proto/operator.proto` at contract 0047. |
| LD-1…LD-11 | The 11 parent UX PRD locked decisions. |
| UI-001 | Tailwind v4 `@theme` + shadcn/ui component library. |
| UI-002 | i18n Externalization (Lingui). |
| UI-003 | Router (TanStack Router). |
| UI-004 | State Management (Zustand + TanStack Query). |
| UI-005 | Realtime Sync (replace-on-event). |
| UI-006 | Motion Library (CSS-only). |
| UI-007 | Keyboard Library (react-hotkeys-hook). |
| UI-008 | Test Stack (Vitest + Playwright + axe). |
| UI-009 | Chat Draft Persistence (localStorage). |
| UI-010 | Embedded Artifact Contract (TS union + Zod). |
| UI-011 | Plan Graph Layout (React Flow + elkjs). |
| UI-012 | Memory Graph Visualisation (React Flow). |
| UI-013 | Blast-Radius Computation (kernel-driven via Tauri command — §3.1 below). |
| UI-014 | Cost Panel (lightweight + link-out + CSS-only Sparkline). |
| UI-015 | Config Schema Contract (JSON Schema + TS codegen — §3.2 below). |
| UI-016 | Audit Export Format (CSV + JSON, streamed). |
| UI-017 | Auth Provider (Operator + Viewer; extensible). |

---

## 2. Tauri 2 configuration

### 2.1 `tauri.conf.json` — the essentials

The existing `ui/src-tauri/tauri.conf.json` is the scaffold. The implementation updates it to the V1 shape. The key fields:

```jsonc
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Cambrian",
  "version": "0.1.0",
  "identifier": "com.cambrian.ui",
  "build": {
    "beforeDevCommand": "cd ../ && bun install && bun dev",
    "beforeBuildCommand": "cd ../ && bun install && bun build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "title": "Cambrian", "width": 1440, "height": 900, "minWidth": 1024, "minHeight": 640, "resizable": true }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["deb", "rpm", "appimage", "dmg", "msi", "app"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "category": "DeveloperTool",
    "shortDescription": "Cambrian Web UI — operator console for the Cambrian agent OS.",
    "longDescription": "Mission-control for the Cambrian runtime. Chat with sessions, watch plans form, inspect the LTM, configure the runtime."
  }
}
```

Notes:
- `identifier` must match the OS-level bundle id (used for auto-updater + signing).
- `devUrl` is the Vite dev server (Bun runs it on port 1420 per the existing `vite.config.ts`).
- `frontendDist` is the Vite production build output (`../dist` relative to `src-tauri/`).
- The CSP locks down script-src / style-src to the Tauri shell; `connect-src` includes `ipc:` and `http://ipc.localhost` for the Tauri IPC channel.

### 2.2 Capabilities (`src-tauri/capabilities/default.json`)

The capability allowlist is the security boundary. The implementation replaces the scaffold's default capability with the V1 shape:

```jsonc
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "V1 capabilities for the Cambrian Web UI.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-set-title",
    "core:window:allow-set-size",
    "core:path:default",
    "opener:default",
    "opener:allow-open-url"
  ]
}
```

The 9 existing Tauri commands + the 2 new ones (§3 below) live in the Rust core's `lib.rs` and are not in the capability allowlist (Tauri commands are gated by the Rust code, not the capability JSON; the capability JSON is for the Tauri plugin surface).

### 2.3 Build target — Tauri 2 desktop only

Per the scope decision, the build target is **Tauri 2 desktop only** (no browser fallback, no static preview). The bundle targets are:

- **Linux**: `.deb`, `.rpm`, `.AppImage`.
- **macOS**: `.dmg`, `.app`.
- **Windows**: `.msi`, `.app` (NSIS).

The 3-platform matrix is the CI build matrix (§7).

### 2.4 Bundle + signing

- **Linux**: GPG signing of `.deb` / `.rpm` packages. The key is in the CI secret store.
- **macOS**: Apple Developer ID signing + notarization. The cert is in the CI keychain (transient). The `tauri.conf.json` carries the team ID.
- **Windows**: Authenticode signing. The cert is in the CI secret store.

The signing configuration lives in `tauri.conf.json` under `bundle.macOS.signingIdentity` and `bundle.windows.certificateThumbprint`. **Implementation ticket:** the platform-specific signing tickets are scoped to a follow-on iteration; V1 ships unsigned bundles in dev, signed in release.

### 2.5 Auto-updater (V1 = no, V2 = yes)

The Tauri auto-updater is **out of scope for V1**. V1 ships with manual updates (the operator pulls a new bundle). The auto-updater is a V2 follow-on. The `tauri.conf.json` does not include the updater config.

---

## 3. Kernel-side contract additions

The existing Rust core exposes 9 Tauri commands (per the explore's `ui/src-tauri/src/lib.rs`):

1. `op_login(endpoint, username, password) → { role: string }`
2. `op_get_state() → StateOfRecord`
3. `op_create_session(goal, reason) → { session_id: string }`
4. `op_send_message(session_id, text, reason) → { deduped: bool }`
5. `op_inject_correction(session_id, instruction, reason) → { deduped: bool }`
6. `op_pause_session(session_id, reason) → { deduped: bool }`
7. `op_resume_session(session_id, reason) → { deduped: bool }`
8. `op_resolve_hitl(intervention_id, approve, reason) → { deduped: bool }`
9. `op_set_tool_grant(agent_id, tool_name, granted, reason) → { deduped: bool }`

And 2 event channels: `kernel://state` (full `StateOfRecord` snapshots) + `kernel://token` (live-only token chunks).

**The 7 PRDs + 17 ADRs depend on 2 more Tauri commands + 1 RPC addition that the existing Rust core does not yet expose.** These are the kernel-side contract additions the implementation needs.

### 3.1 New Tauri command: `op_blast_radius_preview` (UI-013's prerequisite)

**Signature (TypeScript-side, the type the webview imports):**

```typescript
interface BlastRadiusPreviewRequest {
  mutation: BlastRadiusMutation;
}

type BlastRadiusMutation =
  | { kind: 'tag_memory'; doc_id: string; tag: string; add: boolean }
  | { kind: 'set_scope'; agent_id: string; scope: ScopeConfig; mode: 'widen' | 'narrow' }
  | { kind: 'set_write_tags'; agent_id: string; tags: string[]; mode: 'widen' | 'narrow' }
  | { kind: 'set_tool_grant'; agent_id: string; tool_name: string; granted: boolean };

interface BlastRadiusPreviewResponse {
  affected_agents: AgentImpact[];
  affected_plans: PlanImpact[];
  computed_at: string; // ISO 8601
  cache_ttl_ms: number; // 5_000 default
}

interface AgentImpact {
  agent_id: string;
  before_effective_scope: EffectiveScope;
  after_effective_scope: EffectiveScope;
  before_default_write_tags: string[];
  after_default_write_tags: string[];
  impact: 'widened' | 'narrowed' | 'unchanged';
}

interface PlanImpact {
  plan_id: string;
  re_evaluation_required: boolean;
  reason: string;
}
```

**Rust-side (the addition to `ui/src-tauri/src/lib.rs`):**

```rust
#[tauri::command]
async fn op_blast_radius_preview(
    state: tauri::State<'_, Transport>,
    mutation: BlastRadiusMutation,
) -> Result<BlastRadiusPreviewResponse, String> {
    state.blast_radius_preview(mutation).await.map_err(|e| e.to_string())
}
```

The implementation calls the kernel's gRPC `BlastRadiusPreview` (added to the `OperatorConsole` service in the vendored proto at the next contract bump). The webview calls the Tauri command via `@tauri-apps/api/core::invoke`. **The implementation ticket:** add the gRPC method to the kernel, the Tauri command to the Rust core, the codegen to the proto, the TS types to the webview.

### 3.2 New gRPC method + Tauri command: `GetConfigSchema` (UI-015's prerequisite)

The runtime settings form (PRD-07 §3.1, per LD-11) is a form over the kernel's published schema of operator-editable config keys. The schema is the source of truth (UI-015 — JSON Schema + TS codegen). The kernel must publish it.

**Kernel-side (the addition to the `OperatorConsole` proto + service):**

```protobuf
message GetConfigSchemaRequest {}

message ConfigSchemaResponse {
  string schema_version = 1;
  // JSON Schema (Draft 2020-12) as a string.
  string schema_json = 2;
  // Optional: a hash of the schema for cache invalidation.
  string schema_hash = 3;
  // Optional: which keys are operator-editable vs kernel-only.
  repeated string editable_keys = 4;
  repeated string kernel_only_keys = 5;
}

service OperatorConsole {
  // ... existing 13 RPCs ...
  rpc GetConfigSchema(GetConfigSchemaRequest) returns (ConfigSchemaResponse);
}
```

**Tauri command (the addition to `ui/src-tauri/src/lib.rs`):**

```rust
#[tauri::command]
async fn op_get_config_schema(
    state: tauri::State<'_, Transport>,
) -> Result<ConfigSchemaResponse, String> {
    state.get_config_schema().await.map_err(|e| e.to_string())
}
```

**TypeScript-side (the type the webview imports):**

```typescript
interface ConfigSchema {
  schema_version: string;
  schema_json: string; // parsed to JSONSchema at runtime
  schema_hash: string;
  editable_keys: string[];
  kernel_only_keys: string[];
}
```

The webview calls `op_get_config_schema()` once on shell mount, caches the schema in the projection store (UI-004), and the `RuntimeSettingsForm` renders the form from the schema. **The implementation ticket:** add the gRPC method to the kernel, the Tauri command to the Rust core, the codegen to the proto, the JSON Schema to the kernel's config, the TS types to the webview.

### 3.3 The webview's Tauri IPC contract (the surface the webview sees)

The complete Tauri IPC surface the webview imports:

```typescript
// 9 existing commands (per ui/src-tauri/src/lib.rs)
invoke<T>('op_login', { endpoint, username, password })
invoke<T>('op_get_state')
invoke<T>('op_create_session', { goal, reason })
invoke<T>('op_send_message', { session_id, text, reason })
invoke<T>('op_inject_correction', { session_id, instruction, reason })
invoke<T>('op_pause_session', { session_id, reason })
invoke<T>('op_resume_session', { session_id, reason })
invoke<T>('op_resolve_hitl', { intervention_id, approve, reason })
invoke<T>('op_set_tool_grant', { agent_id, tool_name, granted, reason })

// 2 new commands (this document's additions)
invoke<BlastRadiusPreviewResponse>('op_blast_radius_preview', { mutation })
invoke<ConfigSchema>('op_get_config_schema')

// 2 event channels (existing)
listen<StateOfRecord>('kernel://state')
listen<TokenChunk>('kernel://token')
```

This contract is the **single source of truth** for the webview ↔ Tauri shell boundary. The implementation wraps it in a typed `src/ipc/` module (see §5.2).

---

## 4. Proto file management

### 4.1 The contract

`ui/proto/operator.proto` is vendored from the kernel at `api/proto/operator.proto`. The vendored copy is the **implementation source** for the Rust core's gRPC client. The kernel's `api/proto/` is the **authoritative source**.

The proto is pinned to a specific contract version (currently `0047` per the explore's `ui/src-tauri/src/pb.rs::PINNED_CONTRACT_VERSION`). The vendor comment is `// DO NOT EDIT BY HAND`.

### 4.2 The sync process

The sync is a **manual process tied to a kernel release**, not an automated cron:

1. The kernel team releases a new version (`api/proto/operator.proto` changes).
2. The kernel team updates the `CONTRACT_VERSION` constant in `api/proto/operator.proto` (or a sibling file).
3. The webview's release process copies `api/proto/operator.proto` to `ui/proto/operator.proto`.
4. The Rust core's `pb.rs` updates `PINNED_CONTRACT_VERSION` to match.
5. The webview's `pnpm build` regenerates the TS types from the vendored proto (via the Tauri IPC codegen).
6. The contract skew check at runtime: if the webview's vendored version != the kernel's runtime version, the shell surfaces a warning ("this kernel is on a different contract; some features may be unavailable").

**The implementation ticket:** the manual sync process is documented in `ui/proto/README.md`; the runtime skew check is a Rust core addition.

### 4.3 What the implementation does NOT do

- **Not** a git submodule. The vendored copy is a normal file in the `ui/proto/` directory; the sync is a deliberate copy on a release.
- **Not** an automated cron. The sync is tied to a kernel release; the cadence is the kernel's release cadence.
- **Not** a runtime fetch. The vendored proto is the implementation source; the runtime skew check is a warning, not a blocker.

---

## 5. Webview file layout

### 5.1 The target structure (the V1 shape)

The `ui/src/` directory (per the explore's `src/CONTEXT.md` target map) becomes:

```
ui/
├── src/
│   ├── main.tsx                      # entry; renders <App />
│   ├── App.tsx                       # top-level layout; the shell (PRD-02)
│   ├── index.css                     # the Tailwind v4 entry + tokens.css
│   ├── design-system/                # the shadcn/ui component library (PRD-01 §3.2)
│   │   ├── tokens.css                # the 4-layer tokens via @theme (PRD-01 §3.1)
│   │   ├── tokens.ts                 # the typed mirror (no CSS-in-JS)
│   │   ├── components/               # the customised shadcn/ui components
│   │   │   ├── ui/                   # the shadcn/ui primitives (button, card, dialog, …)
│   │   │   └── cambrian/             # the Cambrian-specific components (PlanCard, MemoryListRow, …)
│   │   ├── styles/                   # the design-system stylesheets
│   │   │   ├── globals.css           # global resets, fonts, density defaults
│   │   │   ├── motion.css           # the motion tokens + pulse/trail/skeleton keyframes
│   │   │   └── a11y.css              # focus rings, reduced-motion, screen-reader-only
│   │   └── index.ts                  # the library entry; re-exports components + tokens
│   ├── ipc/                          # the Tauri IPC wrapper (PRD-02 §5.1)
│   │   ├── client.ts                 # the typed @tauri-apps/api wrapper (the 11 commands + 2 events)
│   │   ├── types.ts                  # the types from §3.3
│   │   ├── events.ts                 # the kernel://state and kernel://token listeners
│   │   └── mock.ts                   # the mock IPC for unit/component tests (§8)
│   ├── store/                        # the projection store (PRD-02 §5.1; UI-004)
│   │   ├── projection.ts             # the Zustand vanilla store (StateOfRecord mirror)
│   │   ├── shell.ts                  # the shell chrome slice (panel widths, density, theme)
│   │   ├── chat.ts                   # the chat surface slice
│   │   ├── plan.ts                   # the plan work surface slice
│   │   ├── memory.ts                 # the memory explorer slice
│   │   ├── audit.ts                  # the audit list slice
│   │   └── queries.ts                # the TanStack Query client (audit export, schema fetch)
│   ├── routes/                       # the TanStack Router file-based routes (UI-003)
│   │   ├── __root.tsx                # the root route; the shell
│   │   ├── index.tsx                 # the default landing (Sessions or Pinned)
│   │   ├── sessions/
│   │   │   ├── index.tsx             # Sessions list
│   │   │   └── $sessionId.tsx        # Session detail (chat surface)
│   │   ├── plans/
│   │   │   ├── index.tsx             # Plans in Flight
│   │   │   └── $planId.tsx           # Plan work surface
│   │   ├── memory/
│   │   │   ├── index.tsx             # Memory list
│   │   │   └── $docId.tsx            # Memory detail
│   │   ├── agents/                   # Console — Agents
│   │   ├── tools/                    # Console — Tools & Skills
│   │   ├── mcp/                      # Console — MCP
│   │   ├── scope/                    # Console — Scope
│   │   ├── watch/                    # Console — Watch & Reactive
│   │   ├── lifecycle/                # Console — Lifecycle
│   │   ├── verifier/                 # Console — Verifier Pool
│   │   ├── cost/                     # Console — Cost & Energy
│   │   ├── audit/                    # Audit
│   │   └── settings/                 # Settings
│   ├── screens/                      # the screen-level compositions (per PRD)
│   │   ├── chat/                     # PRD-03 — the chat surface
│   │   ├── plan/                     # PRD-04 — the plan work surface
│   │   ├── memory/                   # PRD-05 — the memory explorer
│   │   ├── console/                  # PRD-06 — the 11 console entries
│   │   ├── settings/                 # PRD-07 — the settings surface
│   │   └── audit/                    # PRD-07 — the audit list
│   ├── primitives/                    # small composable primitives (not in the design-system library)
│   ├── i18n/                         # the Lingui setup (UI-002)
│   │   ├── catalog.ts                # the Lingui catalog config
│   │   └── locales/
│   │       └── en/
│   │           └── messages.ts       # the V1 English catalogue (no translations yet)
│   ├── lib/                          # shared utilities
│   │   ├── a11y.ts                   # a11y helpers (focus trap, live regions, etc.)
│   │   ├── format.ts                 # formatters (date, number, duration)
│   │   └── env.ts                    # the runtime flags (is-tauri, contract-version, etc.)
│   └── test/                         # test infrastructure
│       ├── setup.ts                  # Vitest + RTL + axe setup
│       └── mocks/                    # shared mocks (operators, plans, sessions, etc.)
├── src-tauri/                       # the Rust core (mostly built; 2 additions per §3)
├── proto/                            # the vendored gRPC surface (EC-5)
├── public/                           # static assets
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── bun.lock
├── components.json                  # the shadcn/ui CLI state
├── AGENTS.md                         # the webview dev rules
├── CLAUDE.md
├── CONTEXT.md
└── README.md
```

### 5.2 The IPC wrapper (the single source of truth for the webview ↔ Tauri shell boundary)

`src/ipc/client.ts` is the typed wrapper. Every component imports from `src/ipc/`, never from `@tauri-apps/api/core` directly. This is the EC-4 boundary in the webview code.

```typescript
// src/ipc/client.ts
import { invoke } from '@tauri-apps/api/core';
import * as t from './types';

export const ipc = {
  // 9 existing commands
  login: (endpoint: string, username: string, password: string) =>
    invoke<t.LoginResponse>('op_login', { endpoint, username, password }),
  getState: () =>
    invoke<t.StateOfRecord>('op_get_state'),
  createSession: (goal: string, reason: string) =>
    invoke<t.CreateSessionResponse>('op_create_session', { goal, reason }),
  sendMessage: (session_id: string, text: string, reason: string) =>
    invoke<t.CommandAck>('op_send_message', { session_id, text, reason }),
  injectCorrection: (session_id: string, instruction: string, reason: string) =>
    invoke<t.CommandAck>('op_inject_correction', { session_id, instruction, reason }),
  pauseSession: (session_id: string, reason: string) =>
    invoke<t.CommandAck>('op_pause_session', { session_id, reason }),
  resumeSession: (session_id: string, reason: string) =>
    invoke<t.CommandAck>('op_resume_session', { session_id, reason }),
  resolveHitl: (intervention_id: string, approve: boolean, reason: string) =>
    invoke<t.CommandAck>('op_resolve_hitl', { intervention_id, approve, reason }),
  setToolGrant: (agent_id: string, tool_name: string, granted: boolean, reason: string) =>
    invoke<t.CommandAck>('op_set_tool_grant', { agent_id, tool_name, granted, reason }),

  // 2 new commands (this document's additions)
  getBlastRadiusPreview: (mutation: t.BlastRadiusMutation) =>
    invoke<t.BlastRadiusPreviewResponse>('op_blast_radius_preview', { mutation }),
  getConfigSchema: () =>
    invoke<t.ConfigSchema>('op_get_config_schema'),
} as const;
```

### 5.3 The component library location

The component library lives at **`ui/src/design-system/`** (not at the root of the workspace, not in a separate package). This is the same package the webview imports from. **For V1, the library is not published as a separate workspace package** — that's a follow-on (per UI-001's reversibility note). The cross-frontend composability (per the user's clarification) is achieved by **copying the library's source into each frontend's design-system directory** (the shadcn pattern: copy + edit). The library is the source of truth; each frontend's design-system is a curated snapshot.

This is a deliberate trade-off: V1 ships the library in the same package (faster inner loop, simpler versioning); the workspace-package split is a V2 follow-on (cleaner cross-frontend distribution, but more ceremony).

---

## 6. Build commands + dev workflow

### 6.1 Local commands (the canonical list)

```bash
# Install JS deps
bun install

# Run the webview dev server (port 1420)
bun dev

# Run the webview dev server with the mock IPC (no Tauri shell)
VITE_USE_MOCK_IPC=1 bun dev

# Build the webview for production
bun build

# Run the Rust core in dev mode (Tauri shell + webview)
cargo tauri dev

# Build the Tauri shell + bundle
cargo tauri build

# Lint + typecheck
bun lint
bun typecheck

# Unit + component tests
bun test

# E2E tests (Playwright, against a real kernel)
bun test:e2e

# Lint the design-system stylesheets + the Rust code
bun lint:all

# A11y sweep
bun test:a11y
```

### 6.2 The dev workflow

The inner loop is:

1. `bun dev` starts the Vite dev server on port 1420.
2. The webview loads in the browser (or the Tauri shell via `cargo tauri dev`).
3. With `VITE_USE_MOCK_IPC=1`, the webview uses the mock IPC (§8) — no Tauri shell, no kernel.
4. Without it, the webview talks to the Tauri shell (which talks to the kernel).
5. Hot module reload via Vite.

The implementation supports **two dev modes**:
- **Mock mode** (`VITE_USE_MOCK_IPC=1`): webview + mock IPC. Fast, no kernel dependency. The inner loop for component development.
- **Tauri mode** (default): webview + Tauri shell + kernel. The inner loop for IPC + gRPC integration.

### 6.3 The build workflow

`bun build` produces the static webview output at `ui/dist/`. `cargo tauri build` produces the platform bundle (`.deb`, `.dmg`, `.msi`, etc.) at `ui/src-tauri/target/release/bundle/`. The bundle is the release artifact.

### 6.4 The contract skew check

On Tauri shell mount, the Rust core compares the vendored `PINNED_CONTRACT_VERSION` (from `pb.rs`) with the kernel's runtime version (returned in `Login` / `Snapshot`). If they mismatch, the shell surfaces a warning via the role pill area:

> "This kernel is on contract 0048; the UI is on 0047. Some features may be unavailable."

The warning is non-blocking; the UI continues to work with whatever subset of features the two contracts share. The contract bump (§4) is the recovery path.

---

## 7. CI/CD — local commands + CI stub

### 7.1 Local commands (the canonical list, re-stated)

The local commands in §6.1 are the **CI gate**. Every PR must pass:
- `bun lint`
- `bun typecheck`
- `bun test` (Vitest unit + component + a11y)
- `bun build` (production build succeeds)

### 7.2 CI stub (the workflow file)

The CI workflow file lives at `.github/workflows/ui-ci.yml`. The V1 implementation ships a **stub** that runs the local commands on every PR:

```yaml
name: UI CI
on:
  pull_request:
    paths:
      - 'ui/**'
      - '.github/workflows/ui-ci.yml'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: cd ui && bun install --frozen-lockfile
      - run: cd ui && bun lint
      - run: cd ui && bun typecheck
      - run: cd ui && bun test
      - run: cd ui && bun build
```

The **CI matrix** (Linux + macOS + Windows Tauri builds, signed release pipeline, e2e tests against a real kernel) is a follow-on ticket after the slice ships. The V1 stub is the minimum viable gate.

---

## 8. Mock Tauri IPC layer (for unit + component + a11y tests)

### 8.1 Purpose

The webview tests (Vitest unit + RTL component + vitest-axe a11y) run **without a Tauri shell + without a kernel**. The mock IPC simulates the 11 Tauri commands (§3.3) + the 2 event channels (`kernel://state`, `kernel://token`) with an in-memory state machine that mirrors the kernel's `StateOfRecord` contract.

### 8.2 Design

`src/ipc/mock.ts` exposes the same `ipc` interface as `src/ipc/client.ts` (the real client). The mock is a drop-in replacement; tests `import { ipc } from '@/ipc/mock'` instead of `@/ipc/client`. The mock:

- Holds an in-memory `StateOfRecord` (a typed `Map<string, unknown>` keyed by entity).
- The mock `op_get_state` returns the current state.
- The mock mutation commands (`op_send_message`, `op_pause_session`, etc.) update the state + emit a new `kernel://state` event.
- The mock `op_blast_radius_preview` computes a deterministic blast radius from the in-memory state (no real kernel; the test asserts the UI's rendering of the response).
- The mock `op_get_config_schema` returns a fixture JSON Schema (per the runtime config schema in §11).

```typescript
// src/ipc/mock.ts
import { EventEmitter } from 'node:events';

class MockIPC {
  private state: StateOfRecord = initialState();
  private emitter = new EventEmitter();

  // The 11 commands
  async login(endpoint, username, password) { /* returns { role: 'operator' } */ }
  async getState() { return this.state; }
  async createSession(goal, reason) { /* updates state, emits kernel://state */ }
  async sendMessage(session_id, text, reason) { /* updates state, emits kernel://state */ }
  // ... etc.

  // The event channels
  onState(fn: (s: StateOfRecord) => void) {
    this.emitter.on('kernel://state', fn);
  }
  onToken(fn: (t: TokenChunk) => void) {
    this.emitter.on('kernel://token', fn);
  }

  // Test-only helpers
  __seed(state: StateOfRecord) { this.state = state; }
  __emitToken(chunk: TokenChunk) { this.emitter.emit('kernel://token', chunk); }
}

export const ipc = new MockIPC();
```

### 8.3 Test setup

`src/test/setup.ts` is the Vitest setup file. It sets `VITE_USE_MOCK_IPC=1` and seeds the mock with a fixture state. The component tests import from `@/ipc/mock` (the test alias), not `@/ipc/client`.

### 8.4 Real-kernel e2e (Playwright)

The e2e suite (Playwright) runs against a **real Tauri shell + a real kernel**. The implementation spins up the kernel in a Docker container (per the existing `make contract-real` target per the explore) and the Tauri shell in headless mode (per the existing Tauri + Playwright integration). The V1 implementation ships the e2e test stack; the CI matrix that runs it on every PR is a follow-on.

---

## 9. Performance budget

### 9.1 Render budget

- **First contentful paint** (Tauri shell mount → webview first render): < 200 ms (PRD-01 §10.2 skeleton max is 5 s; first paint is much faster).
- **Time to interactive** (Tauri shell mount → webview can accept user input): < 500 ms.
- **Per-event render** (kernel event → webview re-render): < 16 ms (60 fps; PRD-01 §4.4 motion budget).
- **Block transition** (chat block slides in): ≤ 250 ms in, ≤ 600 ms out (PRD-01 §4.4).
- **Skeleton shimmer**: 1.5 s loop (PRD-01 §4.4).

### 9.2 Bundle size budget

- **Initial JS bundle** (the webview's main chunk, gzipped): < 200 KB. React 19 + Vite + the core libraries (TanStack Router, Zustand, TanStack Query, react-hotkeys-hook, Zod) fit comfortably.
- **Total JS bundle** (all chunks, gzipped): < 500 KB. React Flow (~50 KB) + the component library + the app code.
- **CSS bundle** (Tailwind v4 + tokens, gzipped): < 50 KB. Tailwind's tree-shaking + the 4-layer token system.
- **No CSS-in-JS runtime** (per UI-001 v0.2).

The CI gate asserts the bundle size on every PR. A regression that pushes the initial JS bundle > 200 KB fails the build.

### 9.3 Memory budget

- **Tauri shell process**: < 500 MB RSS at idle. < 1 GB RSS under load (a busy session with 5 plans running).
- **Webview memory**: < 200 MB at idle. < 500 MB under load.
- **No memory leaks across hot-reload cycles** (Vite's HMR can leak if state isn't cleaned up; the projection store is a vanilla Zustand store that survives HMR correctly).

---

## 10. Observability

### 10.1 OTel + Langfuse (kernel-side; webview is a consumer)

The OTel Bridge (kernel ADR-0019) and Langfuse (kernel ADR-0021) are kernel-side concerns. The webview is a **consumer** of the kernel's observability — the link-out from the Cost & Energy console entry (PRD-06 §14 + UI-014) opens the corresponding Langfuse trace in the OS-default browser (via `tauri-plugin-opener`, already in the dep tree per the explore).

### 10.2 UI health (webview-side)

The webview's own health is a first-class concern (per the product PRD: "the UI's own health (its connection to the kernel, its event backlog, its render budget) is a product concern"). The status strip (PRD-02 §6) is the at-a-glance read:

- **Connection**: live / reconnecting / down (from the Tauri event channel state).
- **Event backlog**: the count of `kernel://state` events received but not yet folded (PRD-02 §6.1).
- **Render budget**: per-event render time, tracked in dev mode via the React DevTools profiler.

The webview does not emit its own OTel spans; the link-out to Langfuse is the operator's deep-dive path. The status strip is the operator's at-a-glance path.

### 10.3 Error reporting (V1 = in-app only)

V1 reports errors **in-app only** (the kernel's reason verbatim per PRD-01 §10.3). External error reporting (Sentry, etc.) is a V2 follow-on.

---

## 11. Runtime config schema (V1)

### 11.1 The operator-editable keys (V1)

The kernel publishes a JSON Schema (Draft 2020-12) of the operator-editable config keys. The V1 set is the subset of the existing `config.json` that the operator can change through the UI. The kernel owns this set; the UI is a form over the published schema (per LD-11 + UI-015).

The V1 set is **deliberately small**. It covers the keys an operator changes during the demo path (Story 31, 32, 33, 34, 35):

| Key | Type | Default | Description | Source ADR |
|:----|:-----|:--------|:------------|:-----------|
| `gatekeeper_max_candidates` | integer (1–10) | 5 | Max agents passed from Gatekeeper to Auction. | kernel ADR-0002 |
| `gatekeeper_w1` | number (0–1) | 0.4 | SuccessRate weight in GatekeeperScore. | kernel ADR-0002 |
| `gatekeeper_w2` | number (0–1) | 0.4 | TrustScore weight. | kernel ADR-0002 |
| `gatekeeper_w3` | number (0–1) | 0.2 | (1 / NormalisedLatency) weight. | kernel ADR-0002 |
| `min_auction_confidence` | number (0–1) | 0.3 | Bid confidence floor. | kernel ADR-0002 |
| `ewma_alpha` | number (0–1) | 0.5 | TrustScore EWMA smoothing factor. | kernel ADR-0001 |
| `verifier_pool_threshold` | number (0–1) | 0.8 | Min GatekeeperScore to enter VerifierPool. | kernel ADR-0001 |
| `cross_verify_rate` | number (0–1) | 0.05 | Fraction of verifier outputs re-verified. | kernel ADR-0001 |
| `step_timeout_multiplier` | number (≥ 0) | 2.0 | Scales winning bid's latency estimate. | kernel ADR-0001 |
| `plan_timeout_ms` | integer (≥ 0) | 120000 | Hard ceiling over entire plan execution. | kernel ADR-0001 |
| `context_growth_k` | number (≥ 0) | 0.001 | Context inflation penalty coefficient. | kernel ADR-0001 |
| `audit_log_enabled` | boolean | true | Whether the audit log is enabled. (Destructive change; confirm-with-consequence bar + mandatory reason.) | kernel ADR-0047 |
| `telemetry_opt_in` | boolean | false | Whether the operator opts in to kernel-side telemetry. (Destructive change from the operator's privacy perspective.) | kernel ADR-0019/0021 |
| `recall_similarity_floor` | number (0–1) | 0.25 | Per kernel ADR-0048. | kernel ADR-0048 |
| `recency_lambda` | number (≥ 0) | 0.01 | Temporal decay coefficient. | kernel ADR-0015 |
| `retrieval_floor` | number (0–1) | 0.2 | Floor-multiplier re-rank. | kernel ADR-0015 |
| `activation_strength_increment` | number (0–1) | 0.05 | Per-retrieval increment. | kernel ADR-0015 |
| `activation_strength_max` | number (0–1) | 0.8 | Max activation_strength. | kernel ADR-0015 |

This is the V1 set. The full kernel config has more keys; they are `kernel_only` (not in `editable_keys` per §3.2). The kernel decides.

### 11.2 The schema (the JSON Schema shape)

The schema follows the PRD-01 §3.1 four-layer token model (the schema is a JSON Schema, not a token; but the structure mirrors):

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Cambrian Operator-Editable Config (V1)",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "gatekeeper_max_candidates": {
      "type": "integer", "minimum": 1, "maximum": 10, "default": 5,
      "description": "Max agents passed from Gatekeeper to Auction."
    },
    "gatekeeper_w1": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.4, "description": "SuccessRate weight." },
    // ... etc.
    "audit_log_enabled": {
      "type": "boolean", "default": true,
      "description": "Whether the audit log is enabled. (Destructive change; confirm-with-consequence bar + mandatory reason.)"
    }
  }
}
```

The webview renders this schema as a form via `RuntimeSettingsForm` (PRD-07 §3.1). The TS types are codegen'd from the JSON Schema via `json-schema-to-typescript` (per UI-015).

### 11.3 The kernel's role

The kernel:
- Owns the schema (the source of truth).
- Validates mutations against the schema.
- Audits every mutation.
- Refuses unknown keys (the `additionalProperties: false` + the `editable_keys` list).

The webview is a renderer + a typed form. It does not validate; the kernel validates. The webview does not decide which keys are editable; the kernel decides.

---

## 12. Implementation ticket breakdown (the vertical slice + P1–P6)

The parent UX PRD §13 proposes a vertical slice first, then parallel packages. The 7 thematic PRDs are the **what**; the tickets are the **how**. The ticket list below is the **actionable breakdown** of the slice + P1–P6 into concrete engineering tickets. Each ticket is a small, shippable unit.

### 12.0 Ticket numbering convention

`UI-IMPL-NN` where NN is a zero-padded sequence number within the slice / package. The full ticket list lives in the issue tracker (per AGENTS.md). The breakdown below is the **what**; the issue tracker is the **when**.

### 12.1 Vertical slice (P0) — the demo path

The slice ships the demo path end-to-end (UX PRD §13.1): **Operator authenticates → creates a session → types a prompt → watches the plan form, sees bids, sees output → injects a mid-plan correction → resolves a HITL intervention → opens the memory explorer and tags a document → opens the audit log and sees every mutation.**

| # | Ticket | Depends on | Notes |
|:--|:-------|:-----------|:------|
| UI-IMPL-01 | Bootstrap the `ui/` directory: `package.json`, `tsconfig.json`, `vite.config.ts`, `bun.lock` | — | Per the explore; mostly in place. |
| UI-IMPL-02 | Install Tailwind v4 + shadcn/ui (via `bunx shadcn@latest`); set up the 4-layer token system | UI-IMPL-01 | UI-001 v0.2. |
| UI-IMPL-03 | Generate the design-system component library: install shadcn primitives (`button`, `card`, `dialog`, `popover`, `tooltip`, `input`, `select`, `tabs`, `scroll-area`, `separator`), customise them to consume our tokens | UI-IMPL-02 | Per the PRD-01 §6 inventory. |
| UI-IMPL-04 | Add the Cambrian-specific design-system components: `NavRail`, `StatusStrip`, `ChatMessage`, `ChatInput`, `InjectInput`, `PlanCard`, `BidPanel`, `AgentOutputStream`, `HITLInline`, `MemoryList`, `MemoryListRow`, `AuditList`, `AuditEntry`, `Skeleton`, `EmptyState`, `ErrorState` | UI-IMPL-03 | Per the PRD-01 §6 inventory. |
| UI-IMPL-05 | Wire the IPC client + the mock IPC (the 9 existing commands + the 2 event channels) | UI-IMPL-01 | Per §3.3 + §5.2 + §8. |
| UI-IMPL-06 | Wire the projection store (Zustand vanilla store; replace-on-event fold) | UI-IMPL-05 | UI-004 + UI-005. |
| UI-IMPL-07 | Wire the TanStack Router file-based routes; the root route is the shell | UI-IMPL-05 | UI-003. |
| UI-IMPL-08 | Build the shell (PRD-02): the 3-column layout, the nav rail, the status strip, the role pill, the density + theme toggles, the panel collapse/expand | UI-IMPL-04, UI-IMPL-06, UI-IMPL-07 | Per PRD-02. |
| UI-IMPL-09 | Build the chat surface (PRD-03): the chat input, the inject input, the 12-block taxonomy, the PlanCard, the draft recovery (localStorage) | UI-IMPL-04, UI-IMPL-06, UI-IMPL-07 | Per PRD-03 + UI-009 + UI-010. |
| UI-IMPL-10 | Build the plan work surface (PRD-04): the DAG-as-graph (React Flow) + step-list modes, the per-step detail, the BidOverlay, the AgentOutputStream work surface | UI-IMPL-04, UI-IMPL-06, UI-IMPL-07 | Per PRD-04 + UI-011. |
| UI-IMPL-11 | Build the memory explorer minimal (PRD-05 §slice): the filter bar, the list, the detail (FACT + SCENE), the inline graph view, the tag action with the blast-radius panel | UI-IMPL-04, UI-IMPL-06, UI-IMPL-07 | Per PRD-05 §slice + UI-012. |
| UI-IMPL-12 | Build the Settings → Connection sub-screen (PRD-07 §slice): the instance list, the instance add, the current instance, the first-run flow | UI-IMPL-04, UI-IMPL-08 | Per PRD-07 §slice. |
| UI-IMPL-13 | Build the Audit read-only list (PRD-07 §slice): the list, the filter, the detail | UI-IMPL-04, UI-IMPL-06, UI-IMPL-07 | Per PRD-07 §slice + UI-016. |
| UI-IMPL-14 | Wire the keyboard map (PRD-01 §9): the 17 V1 shortcuts + the command palette (`Cmd/Ctrl-K`) + the shortcut palette (`?`) | UI-IMPL-08, UI-IMPL-09 | UI-007. |
| UI-IMPL-15 | Wire the test stack: Vitest setup + the mock IPC + 3 a11y sweep tests + the first 10 component tests | UI-IMPL-04 | UI-008. |
| UI-IMPL-16 | Wire the CI stub (`.github/workflows/ui-ci.yml`): `bun install && bun lint && bun typecheck && bun test && bun build` | UI-IMPL-15 | Per §7.2. |
| UI-IMPL-17 | The accessibility pass for the slice: keyboard, focus, contrast, motion-reduce | UI-IMPL-08, UI-IMPL-09, UI-IMPL-10, UI-IMPL-11 | Per PRD-01 §8. |
| UI-IMPL-18 | The Tauri config + bundle: `tauri.conf.json` per §2.1; `cargo tauri build` produces the 3-platform bundle | UI-IMPL-04, UI-IMPL-08 | Per §2. |

The slice is **done** when UI-IMPL-01…18 are green, the demo path passes end-to-end, the test stack is wired, and the CI stub runs on every PR. The slice is the canary; if the demo path works, the rest of the console is a composition of the same primitives.

### 12.2 P1 — Subsystems read views (PRD-06 §4–§8, §10)

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-19 | Console — Sessions (PRD-06 §4) | The list + the detail (chat surface is PRD-03). |
| UI-IMPL-20 | Console — Plans in Flight (PRD-06 §5) | The global view; the per-session plan stack is PRD-03. |
| UI-IMPL-21 | Console — Agents (PRD-06 §6) | Read-only; the mutating actions are P2. |
| UI-IMPL-22 | Console — Tools & Skills (PRD-06 §7) | Read-only; the mutating actions are P2. |
| UI-IMPL-23 | Console — MCP (PRD-06 §8) | Read-only; the mutating actions are P2. |
| UI-IMPL-24 | Console — Scope (PRD-06 §10) | Read-only; the mutating actions are P2. |

### 12.3 P2 — Subsystems read + mutate (PRD-06 §11, §12, §13, §14)

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-25 | Console — Watch & Reactive (PRD-06 §11) | List + detail + mutating actions (create / update / delete a WatchConfig). |
| UI-IMPL-26 | Console — Lifecycle (PRD-06 §12) | Dashboard + the manual-consolidation mutating action. |
| UI-IMPL-27 | Console — Verifier Pool (PRD-06 §13) | Dashboard (read-only; the verifier loop is kernel-side). |
| UI-IMPL-28 | Console — Cost & Energy (PRD-06 §14) | Dashboard + the link-out to Langfuse / OTel (UI-014). |
| UI-IMPL-29 | Add the kernel-side `op_blast_radius_preview` Tauri command (per §3.1) + the gRPC method to the proto | Blocks P3's blast-radius panel; UI-013's prerequisite. |
| UI-IMPL-30 | Add the per-resource mutating actions across the console (scope, write tags, tool grants) with the five-part form (form + diff + reason + blast-radius + confirm-with-consequence) | The contract from PRD-07 §4.1. |

### 12.4 P3 — Memory explorer (PRD-05 §6, §7, §8, §9)

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-31 | Memory — Compare view (side-by-side) | PRD-05 §6. |
| UI-IMPL-32 | Memory — Graph view (the 1-hop default + 2-hop per operator preference) | PRD-05 §8 + UI-012. |
| UI-IMPL-33 | Memory — Bulk select + bulk tag + bulk supersede | PRD-05 §4.2. |
| UI-IMPL-34 | Memory — Advanced filters + the "more filters" popover | PRD-05 §3. |
| UI-IMPL-35 | Memory — EpisodicMemory cards + ProceduralTemplate cards | PRD-05 §9. |

### 12.5 P4 — Audit & export (PRD-07 §5.3, §5.4)

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-36 | Audit — deep-link to the target (the agent, the tool grant, the memory document, etc.) | PRD-07 §5.5. |
| UI-IMPL-37 | Audit — CSV export | UI-016. |
| UI-IMPL-38 | Audit — JSON export | UI-016. |
| UI-IMPL-39 | Audit — Streamed export for large result sets | UI-016. |

### 12.6 P5 — Configuration (PRD-07 §3, §6, §8, §9)

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-40 | Add the kernel-side `GetConfigSchema` gRPC method (per §3.2) + the Tauri command + the JSON Schema for the V1 config keys | UI-015's prerequisite. |
| UI-IMPL-41 | Settings → Runtime (form over the published JSON Schema) | PRD-07 §3.1 + UI-015. |
| UI-IMPL-42 | Settings → UI control plane (density, theme, shortcut map, default landing, panel sizes, telemetry opt-in) | PRD-07 §3.1. |
| UI-IMPL-43 | Settings → Profiles (instance profile save / load / export / import) | PRD-07 §3.1. |
| UI-IMPL-44 | Settings drill-downs from the per-resource mutating actions | PRD-07 §3.3. |

### 12.7 P6 — Polish & a11y

| # | Ticket | Notes |
|:--|:-------|:------|
| UI-IMPL-45 | Density toggle polish (the click target in the nav-rail footer is responsive across the 3 modes). | Per PRD-01 §4.3. |
| UI-IMPL-46 | Shortcut palette refinement (`?` modal). | Per PRD-02 §8.1. |
| UI-IMPL-47 | Full screen-reader pass (the plan graph is decorative; the step-list is the canonical accessible representation; `aria-live` regions are tuned). | Per PRD-01 §8 + PRD-04 §5.2. |
| UI-IMPL-48 | AAA contrast pass (status colours tuned per mode to meet AAA where possible). | Per PRD-01 §4.1. |
| UI-IMPL-49 | Add the CI matrix (3-platform Tauri builds + signed release pipeline + e2e tests against a real kernel). | Per §7.2. |
| UI-IMPL-50 | Add the Tauri auto-updater. | Per §2.5. |

The P6 tickets ship after the slice + P1–P5. The CI matrix + auto-updater are the gate to a v1.0 release.

### 12.8 Total ticket count

| Phase | Tickets |
|:------|:--------|
| Vertical slice (P0) | 18 |
| P1 — Subsystems read views | 6 |
| P2 — Subsystems read + mutate | 6 |
| P3 — Memory explorer | 5 |
| P4 — Audit & export | 4 |
| P5 — Configuration | 5 |
| P6 — Polish & a11y | 6 |
| **Total** | **50** |

50 tickets. The slice (18) is the canary. P1–P5 fill out the console. P6 ships the release.

---

## 13. Open questions

These are the remaining open questions after this document. Each is a ticket in a follow-on iteration:

1. **Tauri signing configuration** (§2.4). The platform-specific signing tickets are scoped to a follow-on. V1 ships unsigned bundles in dev, signed in release.
2. **Tauri auto-updater** (§2.5). V2 follow-on.
3. **The cross-frontend distribution of the design-system library** (§5.3). V1 keeps the library in the same package; the workspace-package split is a V2 follow-on. The user's clarification was that "we must have a component library, by installing, customizing, extending official shadcn ui ones" — the current shadcn pattern (copy + edit) handles the cross-frontend case.
4. **The CI matrix + e2e against a real kernel** (§7.2, UI-IMPL-49). V1 ships the CI stub; the full matrix is P6.
5. **External error reporting** (§10.3). V1 is in-app only; Sentry etc. is V2.
6. **The Observability story for the webview itself** (§10.2). V1 is the status strip + the link-out to Langfuse; richer webview-side observability (e.g. per-render timing, error rates) is V2.
7. **The runtime config schema's full set of keys** (§11.1). The V1 set is small and deliberate. The kernel team owns the full set; the V1 set is the subset the operator changes during the demo path.
8. **The role model extensions** (Auditor, Admin per UI-017). V2 follow-on ADRs.
9. **The follow-on metrics explorer** (per UI-014). V2; the Sparkline in V1 is the placeholder.

These are the **gaps between this document and a full v1.0 release**. They are explicit, scoped, and don't block the slice.

---

## 14. How to use this document

- **Starting a new ticket?** Read §12 (the ticket breakdown) to find your ticket; the ticket's "Notes" column points to the relevant PRD + ADR. Read those first.
- **Adding a new ticket?** Update §12.8 (the total count) + add the row to the right package. Update §13 if it's a follow-on.
- **Changing a Tauri config?** Update §2 + the corresponding `tauri.conf.json` field. The Rust core is the source of truth; the webview mirrors it via `tauri-plugin-opener` (for URL opening) + the Tauri IPC (for the 11 commands).
- **Adding a new Tauri command?** Update §3.3 + the Rust core's `lib.rs` + the webview's `src/ipc/client.ts` + the mock in `src/ipc/mock.ts`. The kernel-side gRPC method is added to the proto at the next contract bump (§4).
- **Changing the runtime config schema?** Update §11 + the kernel's `config.json` schema + the JSON Schema published via `GetConfigSchema`. The kernel owns; the webview consumes.
- **The implementation phase starts with §12.1 (the vertical slice).** UI-IMPL-01 is the first ticket. The slice is the canary.
