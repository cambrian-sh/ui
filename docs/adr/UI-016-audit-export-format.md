# UI-016 — Audit Export Format

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-07 ([../prd/07-configuration-and-audit.md](../prd/07-configuration-and-audit.md)) §5.4 + Story 42 require that the operator can **export a slice of the audit log** (CSV / JSON) for external review. The export is filtered to the current list view (the operator's filter set). The export is auditable itself (an `audit_export` action with the filter set as the audit entry's `target`).

The decision this ADR records is: **what are the exact formats, and how does the operator invoke the export?**

### Constraints

1. **CSV and JSON.** The product PRD is explicit: "Operator can **export a slice of the audit log** (CSV / JSON) for external review."
2. **The export is filtered to the current list view.** The operator's filter set (actor, target, type, time range, kind, free text) is preserved in the export.
3. **The export is auditable.** The export action itself produces an audit entry with the filter set as the `target`.
4. **Bun + Vite compatible.** The export is a download in the Tauri webview; the file lands on the operator's filesystem via the OS file dialog (Tauri 2's `tauri-plugin-dialog`).
5. **The export is a snapshot, not a stream.** The export reflects the filter set at the moment of export; new audit entries after the export are not in the file.
6. **The export is large-scale friendly.** A 10,000-entry export should not freeze the UI; the export runs as a background job with a progress indicator.

### Options

| Option | Operator experience | Machine-readable | Filtering | Scale | Notes |
|:-------|:--------------------|:-----------------|:----------|:------|:------|
| **CSV + JSON, both, with a choice dialog** | ✅ clear | ✅ | ✅ | ⚠️ (whole export in memory) | **Recommended.** Matches the product PRD; covers both audiences. |
| **CSV only** | ✅ simple | ⚠️ (CSVs are lossy for nested structures) | ✅ | ⚠️ | Loses the structured data. The audit entry's `before` / `after` are not first-class. |
| **JSON only** | ⚠️ (less familiar to non-engineers) | ✅ | ✅ | ⚠️ | Better for machine consumption, worse for human review. |
| **CSV + JSON, both, streamed** | ✅ | ✅ | ✅ | ✅ (no whole-file in memory) | Best for very large exports. Adds streaming complexity. |

## Decision

**Recommended:** **CSV + JSON, both, with a choice dialog. CSV for the simple case, JSON for the structured case. Stream the export for large result sets.**

Rationale:

1. **The product PRD is explicit.** CSV and JSON are both required.
2. **CSV is for human review.** A spreadsheet-friendly export for the operator's auditor. The `before` / `after` fields are serialised as a single string (JSON-encoded within the CSV cell, escaped per RFC 4180).
3. **JSON is for machine consumption.** A structured export for downstream tooling (a SIEM, a log aggregator, a custom dashboard). The JSON is a JSON array of audit entries; each entry is the full structured shape.
4. **The choice dialog is part of the form.** The export is invoked from the audit list's toolbar (a "Export" button); the button opens a small dialog with format choice (CSV / JSON) and a preview of the row count.
5. **Streaming for large exports.** A 10,000-entry export runs as a background job; the UI shows a progress indicator (the PRD-01 §10.2 skeleton + a status pill). The export writes to a file in the operator's chosen location; the file lands when the export is complete.

### CSV schema

| Column | Type | Source |
|:-------|:-----|:-------|
| `timestamp` | ISO 8601 | `entry.timestamp` |
| `actor_id` | string | `entry.actor.id` |
| `actor_role` | string | `entry.actor.role` |
| `target_kind` | string | `entry.target.kind` (`agent`, `tool`, `skill`, `mcp`, `memory`, `session`, `plan`, `config`, …) |
| `target_id` | string | `entry.target.id` |
| `action_type` | string | `entry.action_type` (scope change, write-tag change, tool grant, memory tag, etc.) |
| `status` | string | `entry.status` (`applied`, `failed`, `denied`) |
| `before` | JSON string | `entry.before` (RFC 4180-escaped) |
| `after` | JSON string | `entry.after` (RFC 4180-escaped) |
| `reason` | string | `entry.reason` (RFC 4180-escaped) |
| `kind` | string | `entry.kind` (`config`, `data`, `runtime`) |
| `entry_id` | string | `entry.id` (the audit entry's stable id) |

### JSON schema

The JSON export is a JSON array of audit entries; each entry is the full structured shape (matching the vendored proto's `AuditEvent`, EC-5). The JSON is pretty-printed (2-space indent) for human review; a `jq` or similar tool can flatten it.

## Consequences

**Positive.**

- The export covers both audiences: humans (CSV) and machines (JSON).
- The export is filtered to the current list view; the operator's filter set is preserved.
- The export is auditable; the export action itself produces an audit entry.
- Large exports stream; the UI does not freeze.
- The export uses the OS file dialog (Tauri 2's `tauri-plugin-dialog`); the file lands on the operator's filesystem.

**Negative / risks.**

- The streaming path is a small additional code path; the non-streaming path is the V1 default.
- The CSV's `before` / `after` columns are JSON-encoded strings within a CSV cell; an operator opening the CSV in a spreadsheet may need to "expand" the cell to see the diff. This is acceptable; the JSON export is for the structured case.
- The export's filter set is recorded in the audit entry's `target`; the audit entry grows by ~200 bytes per export. Acceptable.

**Out of scope here** (handled in PRD-07): the audit log's realtime stream, the audit deep-links (PRD-07 §5.5), the audit's role-gating (Viewer is read-only).

**Reversibility.** High. The CSV and JSON schemas are documented above; changing them is a kernel change (the export reads from the vendored proto) and a UI change (the renderer).
