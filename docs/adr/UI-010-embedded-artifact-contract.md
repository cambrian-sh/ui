# UI-010 — Embedded Artifact Contract

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-03 ([../prd/03-chat-surface.md](../prd/03-chat-surface.md)) §4 + §12 enumerate **12 embedded interactive artifact types** that the chat surface accepts: `OperatorMessage`, `RuntimeText`, `PlanCard`, `BidPanel`, `AgentOutputStream`, `HITLInline`, `ArtifactCard`, `MemoryReference`, `ToolCall`, `SystemNote`, `ErrorBlock`, and the sub-family `SkillPanel` / `EpisodicMemoryCard` / `ProceduralTemplateCard`.

The runtime emits these blocks via the kernel's `OperatorEvent` stream (EC-4 + EC-5). The webview's job is to render them. The contract this ADR records is: **how does the runtime declare a new artifact type, and how does the webview know which renderer to dispatch to?**

### Constraints

1. **Type-safe at the call site.** A new artifact type added to the kernel should require a corresponding TypeScript type on the webview. A missing renderer is a compile error (or a clear runtime warning, depending on the choice).
2. **No bespoke per-block styles.** PRD-01 §11 forbids. The contract is a TypeScript discriminated union; every block's renderer consumes the design system (PRD-01).
3. **Stable block identity.** Each block has a stable id (the kernel-side event id or a derived id). The webview uses the id as the React key (§4.1 of PRD-03).
4. **Streaming-friendly.** Some blocks stream (AgentOutputStream, PlanCard, BidPanel). The contract must support "block born" + "block updated" + "block settled" lifecycle.
5. **Extensible.** The 12 V1 types are the start. New types (e.g. `MemoryConsolidationCard` from a follow-on) follow the same contract.

### Options

| Option | Type safety | Streaming | Extensibility | Bundle | Notes |
|:-------|:-----------:|:---------:|:-------------:|:-------|:------|
| **TypeScript discriminated union (the `oneof` shape)** | ✅ exhaustive `switch` | ✅ | ✅ (add a variant + a renderer) | 0 KB | Mirrors the proto's `oneof` payload (15 event types). The webview dispatches on the discriminant. |
| **JSON Schema** | ⚠️ runtime validation, not compile-time | ⚠️ | ⚠️ | ~20 KB (ajv) | Loses compile-time type safety; gains runtime validation. Overkill for an internal contract. |
| **Protobuf** | ✅ codegen | ✅ | ✅ | ~50 KB (protobufjs) | Matches the wire format but duplicates the codegen we already have on the Rust side. |
| **TypeScript union + Zod runtime validation** | ✅ + ✅ | ✅ | ✅ | ~20 KB (Zod) | The union gives compile-time safety; Zod gives runtime validation. The combo is the gold standard for "trust the producer, validate the producer." |
| **TypeScript union alone** | ✅ | ✅ | ✅ | 0 KB | The cheapest path. Loses runtime validation; if the kernel ever ships a malformed event, the webview crashes. |

## Decision

**Recommended:** **TypeScript discriminated union + Zod runtime validation at the fold boundary.**

Rationale:

1. **The wire format is already a `oneof`.** The proto's `OperatorEvent` is a `oneof` over 15 payloads. The webview's TypeScript representation is a discriminated union. Codegen from the vendored proto (EC-5) gives us the types; we add the Zod schemas on top.
2. **Compile-time + runtime safety.** The discriminated union gives us exhaustive `switch` in the renderer dispatcher. The Zod schemas give us runtime validation at the fold boundary (UI-005) — if the kernel ever ships a malformed event, the fold logs the error and skips the block; the chat surface does not crash.
3. **The 12 V1 types are the start.** New types follow the same shape: add a variant to the union, add a Zod schema, add a renderer component. The renderer's "missing variant" case is a Zod error, not a render crash.
4. **Streaming-friendly.** The discriminated union's variants can carry `streaming: true` + a partial-payload shape. The renderer handles the partial; the block grows.

The deciding factor against union-only is the kernel-evolves-while-we're-not-looking risk. The deciding factor against full protobuf-on-the-webview is the duplication.

## Consequences

**Positive.**

- Every block type is a typed variant. The renderer dispatcher is an exhaustive `switch`; TypeScript catches missing cases at compile time.
- Zod at the fold boundary (UI-005) means malformed events are caught and logged; the chat surface degrades gracefully (a single block fails to render, the rest continues).
- New artifact types are additive. The protocol: add a variant to the union, add a Zod schema, add a renderer, add a story to PRD-03. The renderer is a PRD-01 component; no new design system work.
- The 12 V1 types are codegen-friendly; the union is hand-maintained but each variant is small.

**Negative / risks.**

- ~20 KB for Zod. Worth it for the runtime safety.
- The renderer dispatcher is a single function; new contributors must learn the dispatch pattern.
- The Zod schema must be kept in sync with the proto. A proto bump (EC-5 re-vendor) triggers a review of the Zod schemas.

**Out of scope here** (handled in PRD-04): the per-artifact renderer's specific component (e.g. `PlanGraph`, `BidPanel`). This ADR records the *contract*; the components live in their owning PRDs.

**Reversibility.** High. The union + Zod is a thin layer; replacing with a different validation library is mechanical.
