# Cambrian UI — Development Rules

**The rules live in [`AGENTS.md`](AGENTS.md) in this directory. Read that file.**

This is a pointer, deliberately with no content of its own.

`AGENTS.md` and `CLAUDE.md` used to be two hand-maintained copies of the same rules.
They drifted, and they drifted on something load-bearing: one carried the
pre-ADR-0073 "only `OperatorConsole`" rule, which forbids the premium planes the UI
is required to render, while the other carried the amended rule plus the
session→TASK naming exception. Whichever file an agent happened to open determined
which set of rules it enforced, and the two sets contradicted each other.

Keeping one file as a stub is what stops that from recurring. Do not restore
content here — change `AGENTS.md` instead.
