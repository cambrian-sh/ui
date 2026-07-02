# UI-003 — Router

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-02 ([../prd/02-shell-and-layout.md](../prd/02-shell-and-layout.md)) requires a router to map the keyboard `g s` / `g p` / `g a` / `g t` / `g m` / `g y` / `g o` / `g w` / `g l` / `g v` / `g c` / `g u` / `g x` shortcuts to console entries (PRD-06), to the Plans in Flight list (PRD-06 §7.2), and to deep-linkable audit / config / memory targets (PRD-05 / 06 / 07). The router must also handle deep links from the status strip (Story 51 — audit deep-link to target) and the `Cmd/Ctrl-K` command palette (PRD-02 §8.2).

EC-2 (PRD-01 §2.5) locks the framework: **React 19 + TypeScript + Vite**. The router must be idiomatic React 19, type-safe end-to-end, file-based for ergonomics, and SSR-incompatible (this is a Tauri webview, not a server-rendered app — but the router must not pull a runtime that assumes SSR).

### Options

| Option | Type safety | File-based | Bundle size | React 19 idioms | Tauri fit | Notes |
|:-------|:-----------:|:----------:|:-----------:|:---------------:|:---------:|:------|
| **TanStack Router** | ✅ end-to-end (route params, search params, loaders) | ✅ | medium | ✅ (built for React 19 + Suspense) | ✅ | Type-safe at the call site; `useNavigate({ to: '/sessions/$id', params: { id } })` is type-checked. File-based or code-based routes. Built-in search-param validation. |
| **React Router v7 (framework mode)** | ⚠️ partial; `useParams` is `Record<string, string \| undefined>` | ⚠️ (data router, not file-based by default) | medium | ✅ | ⚠️ (framework mode assumes SSR) | Solid, mature, but the framework-mode ergonomics are designed for Remix-style SSR; in a Tauri webview you end up fighting the model. |
| **Wouter** | ⚠️ minimal types | ❌ | tiny | ✅ (React-idiomatic) | ✅ | Minimal router. Lacks type safety and file-based routes. Workable for ~20 routes, painful at the scale this PRD needs. |
| **No router (state-based navigation)** | ✅ | ❌ | n/a | ✅ | ✅ | Just a Zustand "current route" slice. Cheap; loses URL persistence, browser-back, deep-link support. Incompatible with Story 51 (audit deep-link). |
| **React Router v7 (library mode)** | ⚠️ partial | ❌ | medium | ✅ | ✅ | What we used to call "React Router v6." Still requires manual type augmentation for `useParams`. |

## Decision

**Recommended:** **TanStack Router**.

Rationale:

1. **End-to-end type safety.** Route parameters and search parameters are typed at the call site. The 11 nav entries (PRD-02 §4.1) plus the per-resource deep links (memory doc, agent, tool, audit entry) all benefit. A typo in a param is a compile error.
2. **File-based routes.** Routes live in `src/routes/`. Each console entry (PRD-06) is one file; the keyboard map (PRD-01 §9) references them by typed path. File-based is the lowest-ceremony way to keep route ↔ component parity.
3. **React 19 + Suspense native.** TanStack Router is built around the React 19 Suspense model; loaders can stream. The webview's hydration contract (PRD-02 §5.1) maps cleanly: the loader waits on `op_get_state` once; the route component renders.
4. **Tauri fit.** No SSR assumptions. Routes are pure client-side; deep links from the kernel's audit entries land via Tauri IPC, not HTTP routing.
5. **Search params validated.** The shell's panel widths and density are persisted per operator; search-param validation gives us a typed contract for `?density=compact` etc.

The deciding factor against React Router v7 is the type-safety story. v7's library mode is what we want, but the manual `useParams<T>()` typing is friction at the scale of 11 nav entries + deep links. The deciding factor against no-router is Story 51 (audit deep-link) — the audit entry is a stable URL target.

## Consequences

**Positive.**

- Every `g s` / `g p` keyboard handler becomes `navigate({ to: '/sessions' })` — type-checked.
- Memory explorer deep links (`/memory/$docId?type=mnemonic_fact`) are typed; the URL is the contract.
- Code-splitting per route is built in; the bundle splits on the 11 console entries naturally.
- Search-param validation gives a typed `useSearch({ from: '/sessions' })` hook.

**Negative / risks.**

- TanStack Router is younger than React Router. Some edge cases (rare) may have workarounds.
- The file-based route tree is a separate concept from the component tree; new contributors must learn it.
- Two build steps (Vite + TanStack Router's CLI for type generation) — managed by `@tanstack/router-plugin` for Vite, but it's another moving part.

**Out of scope here** (handled in UI-005): the URL persistence policy (which search params survive reload, which are session-only), the history-replace-vs-push policy, the kernel's `RESYNC_REQUIRED` interaction.

**Reversibility.** Medium. Swapping TanStack Router for React Router later is mostly mechanical (route definitions, navigate calls), but the typed-search-params benefits are lost.
