# 10 — Final Todos (Never Executed)

These are the **8 todos** the agent wrote into `todowrite` at the end of
the session (line 14614, ~20s of agent time, immediately before the
session was cut off mid-tool-call on the next `read`). None of them
were started. The implementation phase should start here.

## The 8 todos, verbatim from the transcript

1. **Resume UX PRD edits** — `priority: high`
   - Light mode nav-rail footer
   - Density row in §4.7
   - Density in §2.3
   - Theme in component inventory §3.8
   - Theme in keyboard map §10
   - Plan view = both places (§5 + §6)
   - Settings V1 scope cut (§11)
   - Light mode in acceptance gate (§13.4)

2. **Verify all UX PRD edits landed and the document is internally consistent** (no stale references) — `priority: high`

3. **Update product PRD (`docs/prd/web-ui-prd.md`) to mirror the locked decisions** — `priority: high`
   - Config-in-app is in scope
   - Light mode is V1
   - Plan view = both places
   - Multi-plan is in scope

4. **Update requirements doc (`docs/requirements/web-ui-requirements.md`) where it contradicts the locked decisions** — `priority: medium`
   - Config surface
   - Light mode
   - Multi-plan

5. **Update `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md` per the AGENTS.md rule** — `priority: medium`
   - They must always represent the current state of the codebase.

6. **Author a short Index/README in `docs/prd` and `docs/requirements`** — `priority: medium`
   - So the three-document sequence (requirements → product PRD → UX PRD) is discoverable.

7. **Write the lock-in summary at the top of the UX PRD and a one-pager decisions log for the user to sign off** — `priority: high`

8. **Draft a "ready to develop" checklist that the technical document must satisfy before code starts** — `priority: high`
   - So the next step is implementation, not more paperwork.

## What this list tells us

- **The session was not a complete failure.** The agent knew exactly what was left to do. The 8 todos are crisp, specific, and reference exact sections in the documents.
- **The lock-in summary is unfinished.** Todo 7 is the most important one for a future reader: until the lock-in summary lands at the top of the UX PRD and a one-pager decisions log exists, the decisions are "settled in conversation" but not formally signed off.
- **`CONTEXT.md` and `CURRENT_CODEBASE_STATE.md` are out of date.** The AGENTS.md rule says they always represent the current state of the codebase. They have not been updated since the locked decisions were settled.
- **The technical document is the next step.** Once todos 1–7 land, the implementation phase needs a technical document (the "follow-on" that the UX PRD §1 references) that commits to transport, framework, deployment, and auth provider. Todo 8 is the input to that document.

## Suggested order for picking up

In rough order of dependency:

1. **Todo 1 first** — finish the UX PRD edits. Land them, verify, then re-grep the file for stale references.
2. **Todo 2 next** — verify. This is the gate before the other docs can be updated.
3. **Todo 3 and 4 in parallel** — the product PRD and the requirements doc both need to mirror the UX PRD's locked decisions. The product PRD is upstream of the requirements doc in the requirements → product PRD → UX PRD flow, but the UX PRD is now the source of truth for the lock-in, so updates flow downward.
4. **Todo 5** — `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`. Mechanical update; reads off the locked decisions.
5. **Todo 6** — Index files in `docs/prd` and `docs/requirements`.
6. **Todo 7** — the lock-in summary at the top of the UX PRD + a one-pager decisions log. This is the human sign-off artefact.
7. **Todo 8 last** — the "ready to develop" checklist. This is the bridge to the implementation phase.

## Open questions the agent never resolved

These came up in the session but were not in the final 8 todos. Worth
checking before starting the work:

- **The `t` shortcut** was originally "Toggle theme" and became "Toggle theme density" in the late-session edits. The on-disk UX PRD §10 may still say "theme"; the agent was mid-edit. Verify.
- **The P6 acceptance gate** — `13.2 P6` was being updated to remove the "(if V1)" qualifier on light mode. The session referenced "P6. Polish & a11y" with: density toggle polish, shortcut palette refinement, empty/loading/error pass, full screen-reader pass, AAA contrast pass, light mode (if V1). The "(if V1)" was being removed.
- **The settings V1 scope cut** dropped the free-form JSON editor. The UX PRD §11.1 still had a reference to the editor in the lock-in pass; the agent's edit was to remove it. Verify the reference is gone.

## What to NOT redo

- **Do not re-litigate the 11 locked decisions.** They are settled. The 8 todos are *paperwork on top of* the decisions, not new decisions.
- **Do not re-introduce the Wasm sandbox.** It was cancelled (ADR-0004) — see `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`.
- **Do not move light mode back to "follow-on."** It is V1; the sub-decision is locked.
- **Do not re-add a free-form JSON editor to settings V1.** Out of scope.
