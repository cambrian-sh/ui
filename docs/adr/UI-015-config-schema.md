# UI-015 — Config Schema Contract

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-07 ([../prd/07-configuration-and-audit.md](../prd/07-configuration-and-audit.md)) §3.1 + LD-11 + the V1 settings scope cut (sub-decision from the session index) require that the **kernel publishes a schema of editable config keys**; the UI is a form over that schema, with description, default, current value, reset-to-default, and "what this does" tooltip. **No free-form JSON editor in V1.**

The contract this ADR records is: **what is the format of the published schema, and how does the UI consume it?**

### Constraints

1. **The kernel is the source of truth.** The UI is a controller (product PRD ID-3 + ID-9). The kernel decides which keys are operator-editable, what the description is, what the default is, what the valid values are, what the side effects are.
2. **The UI must be a form, not a JSON editor.** LD-11 + the V1 settings scope cut. Every field is a typed input (text, number, boolean, enum, multi-select, date range, etc.).
3. **Type-safe at the call site.** A schema mismatch (the kernel publishes a key the UI doesn't know how to render) must be a visible error, not a silent failure.
4. **The schema must evolve.** The kernel's config keys change; the schema must support additive changes without breaking the UI.
5. **The schema must be auditable.** Every key has a `description`, a `default`, a `current_value`, a `side_effects` field. The UI renders these; the audit log records the change.
6. **Bun + Vite compatible.** The schema is consumed at runtime in the webview (UI-005's fold carries the schema in the snapshot, or the UI fetches it once on mount). The schema format must not require a build step.

### Options

| Option | Type safety | Schema evolution | Tooling | Bun + Vite fit | Notes |
|:-------|:-----------:|:-----------------|:--------|:---------------|:------|
| **JSON Schema** (Draft 2020-12) | ✅ runtime validation (ajv) | ✅ additive (new keys are non-breaking) | ✅ mature (vscode-jsonchema, ajv, etc.) | ✅ | **Recommended.** Well-established, widely supported, ecosystem-friendly. |
| **Protobuf reflection** | ✅ codegen | ✅ | ✅ | ⚠️ (the proto is already vendored, EC-5; this would re-use the codegen) | The vendored proto is the gRPC surface, not the config schema. Re-using it would conflate two concerns. |
| **Custom JSON format** (the kernel's own schema) | ⚠️ hand-rolled | ⚠️ | ❌ | ✅ | Most flexible; most maintenance. Reinvents JSON Schema. |
| **OpenAPI 3.1** (a superset of JSON Schema) | ✅ | ✅ | ✅ | ✅ | The web-service-oriented version of JSON Schema. Overkill for an internal kernel-side config schema. |
| **TypeScript types** (codegen from the kernel) | ✅ compile-time | ✅ codegen | ✅ | ✅ | The types are at build time; the runtime schema is a separate concern. Best used alongside JSON Schema, not as a replacement. |

## Decision

**Recommended:** **JSON Schema (Draft 2020-12)** for the published config schema, with **TypeScript types codegen'd from the JSON Schema** for compile-time safety in the webview.

Rationale:

1. **Well-established and widely supported.** JSON Schema is the de-facto standard for "describe a JSON document's shape." Ajv, the canonical validator, is fast and Bun-compatible. VS Code's JSON Schema integration is built in.
2. **The UI is a form, not a JSON editor.** JSON Schema describes a JSON document; the UI's job is to render each field as a typed input. The schema's `description`, `default`, `enum`, `minimum`, `maximum`, `pattern`, `format` properties map directly to the PRD-01 §6 form primitives (`Input`, `NumberInput`, `Select`, `Combobox`, `DateRange`).
3. **Schema evolution is additive.** A new key is non-breaking; the UI sees the new key and renders it. A changed `default` is non-breaking; the UI re-renders the form. A removed key is a breaking change; the UI logs a warning ("this key is no longer editable") and the form skips it.
4. **TypeScript codegen is a thin layer.** `json-schema-to-typescript` (or a hand-rolled equivalent) produces `interface RuntimeConfig { ... }` from the JSON Schema. The webview's `RuntimeSettingsForm` is typed end-to-end.
5. **Bun + Vite fit.** No build step required; the schema is consumed at runtime. The codegen runs at the kernel-side release time, not in the webview's build.

The deciding factor against Protobuf reflection is the conflation of the gRPC surface and the config schema. The deciding factor against a custom format is the maintenance burden. The deciding factor against TypeScript types alone is the build-time / runtime split.

## Consequences

**Positive.**

- The published schema is **declarative** (a JSON document). The kernel owns it; the UI consumes it.
- The UI renders a form, not a JSON editor. The PRD-07 §3.1 "form over the published schema" promise is satisfied.
- Schema evolution is additive. New keys land; old keys are deprecated gracefully.
- TypeScript types are codegen'd; the webview's `RuntimeSettingsForm` is typed end-to-end.
- The schema is human-readable; an operator can `cat` the schema file and understand the structure.

**Negative / risks.**

- The kernel must publish the schema. This is a small addition to the kernel's `OperatorConsole` service (a `GetConfigSchema` RPC, or include the schema in the existing `Snapshot` response).
- The webview must handle schema mismatches gracefully. The "this key is no longer editable" warning is a UX consideration.
- The codegen step must be integrated with the kernel's release process. If the codegen is forgotten, the webview's types drift from the kernel's schema. Mitigation: the codegen runs in CI on every kernel release; the webview's types are re-generated and committed.

**Out of scope here** (handled in PRD-07): the runtime settings' per-field UX (description, default, current value, reset-to-default, "what this does" tooltip), the destructive-change flow (the five-part form), the audit log.

**Reversibility.** Medium. Swapping JSON Schema for a custom format is mechanical (the form renders the same way); swapping for Protobuf reflection is a larger change.
