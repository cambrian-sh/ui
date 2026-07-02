# UI-014 — Cost Panel vs Metrics Explorer

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-06 ([../prd/06-operator-console.md](../prd/06-operator-console.md)) §14 + the product PRD's "Out of Scope" (§"Out of Scope") + Story 29 frame the Cost & Energy surface:

> A simple, readable view of system health: kernel connection state, LTM connection state, in-flight plans, queue depth, circuit breakers, current spend rate. This is **not** a full observability dashboard; it is a status panel that lives in the operator console and links out to the existing telemetry (Langfuse / OTel) for deep dives.
>
> The status panel must be legible at a glance and **must not become a Grafana clone**.

> Story 29. As an **Operator**, I want a **Cost & Energy** screen that shows per-step, per-session, per-agent, and per-model cost, plus the LLM provider's circuit-breaker state and price ledger, and links out to Langfuse / OTel for deep dives.

The product PRD is explicit: V1 ships the **lightweight dashboard** + the **link-out**. The metrics explorer, the query builder, the trace flame-graph viewer are out of scope for V1. The decision this ADR records is: **what exactly is in V1, and what is deferred, with a clear seam for the follow-on?**

### The two surfaces in question

1. **The status panel** (PRD-02 §6) — the always-visible 32 px strip at the bottom of every screen. Carries: current instance, kernel up, LTM up, in-flight plans (count), queue depth, circuit-breaker state, current spend rate, event backlog.
2. **The Cost & Energy console entry** (PRD-06 §14) — the expanded view. Carries: per-step, per-session, per-agent, per-model cost for the current run + recent history; circuit-breaker state per LLM provider; price ledger; acquire outcome list; link-out to Langfuse / OTel.

### Options

| Option | What's in V1 | What's deferred | Bundle | Notes |
|:-------|:-------------|:----------------|:-------|:------|
| **Lightweight dashboard + link-out** (the spec) | Status panel + Cost & Energy console entry + link-out to Langfuse / OTel. Read-only. | Metrics explorer, query builder, trace flame-graph viewer. | 0 KB (status panel + cost panel are PRD-01 components). | **Recommended.** Matches the product PRD's "must not become a Grafana clone" and the out-of-scope list. |
| **Lightweight + a custom time-series chart** | Status panel + Cost & Energy + a small in-house time-series chart (Sparkline-style) for the cost trend. | Full metrics explorer. | 0 KB (CSS-only chart). | **Also viable.** The "trend over the last 5 minutes" is a small ask; a 60-pixel-tall SVG with no interactivity is enough. |
| **Pull in Grafana / a similar observability frontend** | Embed Grafana as an iframe with a pre-configured dashboard. | The full integration is the deferred work. | ~0 KB (the iframe is the embed) | **Rejected.** The product PRD is explicit: no Grafana clone. |
| **Pull in Tremor / Recharts / Visx** | Status panel + Cost & Energy + a full charting library. | (nothing) | ~50-100 KB gzipped | **Rejected.** The product PRD is explicit: the dashboard is a status panel, not a metrics explorer. A full charting library is overkill. |

## Decision

**Recommended:** **Lightweight dashboard + link-out, with a small CSS-only Sparkline for the cost trend.**

Rationale:

1. **The product PRD is the constraint.** Story 29 + the out-of-scope list + the "must not become a Grafana clone" line are all normative. The decision is bounded by them.
2. **The status panel is already there.** PRD-02 §6 ships the always-visible 32 px strip. The Cost & Energy console entry is the expanded view; the seam between them is "click any field in the status strip → drills into the Cost & Energy console."
3. **The Sparkline is a small ask.** A 60-pixel-tall, 240-pixel-wide SVG with no interactivity, no axes, no tooltips — just the last 5 minutes of spend rate. CSS-only; no charting library. PRD-01 §4.2 motion grammar applies (the line draws on update, ≤250 ms).
4. **The link-out is mandatory.** The "view in Langfuse" / "view in OTel" affordance per field (kernel up, LTM up, circuit-breaker, spend rate) opens the corresponding trace. The webview opens the link in the OS-default browser (Tauri 2 has `tauri-plugin-opener` already in the dependency tree per the explore).
5. **The follow-on is well-defined.** When the metrics explorer ships (a follow-on PRD), it can:
   - Extend the Cost & Energy console entry with a "deep dive" tab.
   - Use Tremor / Visx / Recharts as the charting library.
   - Add a query builder, a trace flame-graph viewer, a custom-time-range picker.
   - The V1 surface is the foundation; the follow-on adds the depth.

The deciding factor against embedding Grafana is the product PRD's explicit "must not become a Grafana clone." The deciding factor against a full charting library in V1 is the out-of-scope list + the bundle cost. The deciding factor against a custom time-series chart in the status panel itself is the "no motion for non-realtime state changes" rule (PRD-01 §4.4) — the strip is not the place for a chart; the console entry is.

## Consequences

**Positive.**

- The Cost & Energy surface is **bounded** by the product PRD. The status panel + console entry + link-out cover Story 29; the follow-on is explicitly scoped.
- Zero new dependencies. The Sparkline is CSS-only (a small SVG component in `src/components/Sparkline.tsx`).
- The link-out uses `tauri-plugin-opener` (already in the dependency tree per the explore). No new plugin.
- The follow-on has a clean seam: extend the Cost & Energy console entry with a "deep dive" tab.

**Negative / risks.**

- The Sparkline is minimal. Operators who want a real chart will hit the link-out. That's the design.
- The status panel's fields are links, but the link-out is a separate affordance in the console entry (not a click on every strip field). PRD-02 §6.1 makes some fields clickable; the deep link is a follow-on refinement if needed.
- The follow-on (metrics explorer) is a real piece of work. The ADR records the deferred scope; a future PRD turns it into work.

**Out of scope here** (handled in PRD-07): the audit log's link to cost records (each audit entry's `cost` field is a deep link to the cost panel's filter-by-target view). The settings surface's "telemetry opt-in" toggle (kernel ADR-0019/0021).

**Reversibility.** High. The V1 surface is the foundation; the follow-on is additive. Swapping the Sparkline for a charting library is mechanical.
