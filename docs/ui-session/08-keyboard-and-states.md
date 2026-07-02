# 08 — Keyboard and States

**Bound by decision log 8 (states) and decision log 9 (keyboard).**

The keyboard is the primary input for an operator who is doing real work.
States are the visual contract for every screen and every component.

## Keyboard (decision log 9)

The V1 keyboard map has **17 shortcuts**, refined after first real use. A
**command palette** (`Cmd/Ctrl-K`) is the discoverability layer for
everything not on the keyboard map.

### The 17 V1 shortcuts (canonical map from the session)

The session referenced these as the locked V1 map. The agent was working
through the P6 acceptance gate (UX PRD §13.2) which lists "shortcut
palette refinement" as part of P6; refinement happens after first real
use, not before.

| Key | Action | Scope |
|:----|:-------|:------|
| `Cmd/Ctrl-K` | Open command palette | global |
| `Cmd/Ctrl-Enter` | Submit the focused input (chat input, inject input, or focused form) | global |
| `Cmd/Ctrl-.` | Open the global instance switcher | global |
| `Cmd/Ctrl-/` | Open the global search (sessions, plans, memory, audit) | global |
| `Cmd/Ctrl-B` | Toggle the left navigation rail | global |
| `Cmd/Ctrl-J` | Toggle the right inspector | global |
| `g s` | Go to Sessions | global (when palette is open or nav rail is focused) |
| `g p` | Go to Plans in Flight | global |
| `g a` | Go to Audit | global |
| `g m` | Go to Memory explorer | global |
| `g ,` | Open Settings | global |
| `1`–`9` | Jump to the nth in-flight plan (in the Plans in Flight view) | per-screen |
| `j` / `k` | Move down / up in a list | per-screen |
| `Enter` | Open the focused row | per-screen |
| `e` | Edit the focused resource (Operator only; Viewer has no edit) | per-screen |
| `n` | New (session / memory / plan — context-dependent) | per-screen |
| `t` | Toggle theme density (compact / default / spacious) | global |

Two notes on the map:

- **`t` was originally "Toggle theme"**; in the late-session edits it became **"Toggle theme density"** (theme moved to a separate control, density stayed on `t`). Verify the on-disk UX PRD §10 reflects this — the agent was mid-edit.
- **`n` for "new" is context-dependent** (new session on the Sessions screen, new memory in the Memory explorer, etc.). The command palette resolves ambiguity.

## The command palette (Cmd/Ctrl-K)

The discoverability layer for **everything not on the keyboard map**. A
fuzzy-search palette that:

- Lists every navigable screen.
- Lists every action (mutating and read).
- Lists every resource (sessions, plans, agents, memory, audit entries).
- Fuzzy-matches the operator's input.
- Surfaces a "Recent" section above the results.

The palette does not duplicate the keyboard map; it complements it. The
keyboard map is for known actions; the palette is for everything else.

## States (decision log 8)

Every screen and every component has a contract for four states. The contract is the same in every screen.

### Empty

- Small dark illustration using brand motifs.
- One sentence.
- One primary action.

The empty state is not a sad face. It is a calm signal that there is
nothing here yet, and a clear primary action to fill the space.

### Loading

- **Skeleton** (Linear-style), never a spinner.
- Max skeleton time: **5 s**, then the empty state takes over.

A spinner says "wait." A skeleton says "this is what will appear." The
operator can see the layout forming; the empty state at 5 s is a
circuit-breaker against the skeleton running forever.

### Error

- The **kernel's reason verbatim**, surfaced in the operator's language.
- One-line "what to do" (e.g. "Retry," "Check the connection," "Open the audit log").
- Deep link to the relevant console screen (e.g. if a verifier pool entry errored, link to Console — Verifier Pool).

The error state is not apologetic. It tells the operator what went wrong
and what to do next, in that order.

### Success (for destructive mutations)

- The **audit-log entry appearing in real time** is the success state.
- The operator sees the change land before they have a chance to navigate away.
- Toast is for mutating-action confirmation only; never for reads.

The success state is the audit trail. If the operator navigates away
before the entry appears, they can find it in the Audit screen.

## State application rules

- **Empty / loading / error / success are exhaustive.** Every screen is in one of these states (or a hybrid — e.g. an error inside an empty container).
- **Empty takes over from loading at 5 s.** A skeleton that runs longer than 5 s is worse than a clear empty state.
- **Errors carry the kernel's reason verbatim.** The UI does not paraphrase or hide it. The "what to do" line is the only UI-authored text.
- **Success for a destructive mutation is the audit entry.** A toast is for confirmation, not for state.
- **A skeleton is announced to screen readers** as "Loading." An error is announced with the kernel's reason.
- **Status pill colour changes are instantaneous** (see `03-design-system.md` §Motion). No motion for state changes that are not realtime.

## What this means for implementation

- A skeleton component (`LoadingSkeleton`) is shared across every screen; it takes the layout's shape as a prop.
- An error state component (`ErrorState`) is shared across every screen; it takes the kernel's reason, the "what to do" line, and the deep link as props.
- An empty state component (`EmptyState`) is shared across every screen; it takes the illustration slot, the sentence, and the primary action.
- These are not bespoke per-screen; they are the design system's contract for every stateful surface.
