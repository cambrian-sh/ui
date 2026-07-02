# Cambrian Web UI — Documentation

This directory holds the normative spec for the Cambrian Web UI: the
thematic PRDs, the engineering ADRs, the technical document, the
requirements, and the design-session transcript. The implementation
lives at the repo root (`src/`, `src-tauri/`).

## Structure

| Path | Contents |
|------|----------|
| `prd/` | The 7 thematic PRDs (Frozen v1.0) + the parent UX PRD + the product PRD. `prd/README.md` is the traceability index. |
| `adr/` | The 17 engineering ADRs (Nygard, Accepted). Each cites its parent PRD. |
| `tech/` | The technical document — the implementation contract: stack, IPC, token system, ticket breakdown (UI-IMPL-01…37). |
| `requirements/` | The source requirements (UC-1…UC-24, 53 user stories). |
| `ui-session/` | The 12 themed files from the 8-day UI design session (decisions, design system, shell, chat, plan, memory, keyboard, config). Reference for the "why" behind the locked decisions. |

## Read order

1. `prd/README.md` — the index: traceability matrices, locked decisions, build order.
2. `prd/01-foundation.md` … `prd/07-configuration-and-audit.md` — the 7 thematic PRDs.
3. `prd/web-ui-ux-prd.md` — the parent UX PRD (locked decisions LD-1…LD-11).
4. `prd/web-ui-prd.md` — the product PRD (53 stories, 24 use cases).
5. `adr/UI-001…UI-017` — the engineering decisions, alongside the PRD that surfaces the open question.
6. `tech/web-ui-tech-doc.md` — the implementation contract (the ticket breakdown is §12).
7. `requirements/web-ui-requirements.md` — the source requirements.
8. `ui-session/` — the design session transcript (reference for the "why").

## Build order (from the parent UX PRD §13)

- **Vertical slice** (UI-IMPL-01…18) — done. The demo path end-to-end.
- **P1.** Subsystems read views (UI-IMPL-19…24) — UI-IMPL-19 done; 20–24 next.
- **P2.** Subsystems read + mutate (UI-IMPL-25…28).
- **P3.** Memory explorer (UI-IMPL-31…35).
- **P4.** Audit & export (UI-IMPL-36…37).
