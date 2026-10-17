# CONTEXT.md — Webview (`src`)

The **React 19 + TypeScript** webview — the presentation layer. It is a
**projection/cache** of the Rust core's state, never a source of truth,
and it **does not speak gRPC**.

Read `../CONTEXT.md` for the project overview; transport detail is in
`../src-tauri/CONTEXT.md`. For per-ADR status see `cambrian-knowledge/adrs/`.

---

## Scaffold

Vite, React 19, Bun, Tailwind CSS, Radix UI primitives. 830+ vitest tests;
`tsc --noEmit` clean.

---

## Module Map

| Area | Responsibility |
|---|---|
| `ipc/` | Tauri client: `invoke(...)` intents and `listen(...)` projection events. The ONLY way the webview reaches the runtime. |
| `store/` | Zustand projection store hydrated from `kernel://state`. A cache, not the state of record. Re-hydrates via `op_get_state` on mount/reload. |
| `screens/` | One screen per PRD surface. The plan view is the centre of gravity when a plan runs. |
| `design-system/` | Tokens, components, utilities. Dark-mode-first, dense, keyboard-friendly, accessible. |
| `lib/queryClient.ts` | TanStack Query — imperative edges only (mutations + request/response reads not on the feed). Every automatic refetch disabled. Nothing on `kernel://state` may be cached here. |

---

## Data Flow

```
Rust core ──kernel://state──> store ──> React screens
React screens ──invoke('op_*')──> Rust core ──gRPC──> kernel
```

- **Reads are push, writes are intents.** No "click to refresh".
- Every `invoke` mutation requires a **`reason`** (kernel rejects empty).
- `command_id` and token are the Rust core's job.

---

## Themes

`data-theme` on `<html>` selects `light`, `dark` or `nocturne`; the operator's
preference (`system` | `light` | `dark` | `nocturne`) lives in `shellStore`,
is saved to `localStorage` (`cambrian-studio:theme`, `cambrian-studio:density`),
and is applied before React mounts by `public/theme-boot.js`. `system` follows
the OS. Fonts (Inter, Geist Mono) are bundled via `@fontsource-variable/*` — no
remote font fetch. Base styles are in `@layer base` so Tailwind utilities win.

---

## Shell Composition

Full-height sidebar (brand, search, Home, Inbox, then Work / Agents &
automation / Governance / System groups, Settings at the foot), a header in
the main column (breadcrumb, alerts, token rate, connection popover), the
routed main pane, and an **inspector slot**
(`InspectorSlot.tsx`) mounted only while a screen is inspecting something.
No screen renders its own permanent aside. No bottom status strip.

---

## Key Invariants

- The webview holds no kernel state the core didn't give it.
- Role/capability reflection: hide/disable mutating controls for Viewers; hide surfaces the kernel doesn't advertise.
- Plugin surfaces wrap in `PluginSurface.tsx` — skew banner + absent state by construction.
