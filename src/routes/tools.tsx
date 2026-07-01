/* Tools & Skills route.
 *
 * Tools are deterministic capability declarations (TraitTool agents). Skills
 * are named instruction bundles the LLM may invoke. Both carry an explicit
 * Scope (required / any-of / forbidden tags) and a k-anonymity floor.
 *
 * Surfaces here:
 *  - Per-tool card: name, scope, grant state (operator-only toggle)
 *  - Per-skill card: name, instructions, tool grants
 *  - "Used by" backlink: which Cognitive/Model agents reference this tool
 *  - Blast-radius preview before any grant/revoke mutation
 *
 * Per PRD story 19: "As an operator, I can grant or revoke a tool for an
 * agent and see the blast radius before I commit."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Tools() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Tools & Skills</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Deterministic capabilities (Tools) and named instruction bundles
          (Skills). Every grant is a Tier-1 mutation — it requires a
          confirmation naming the consequence and a mandatory reason.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>
              Auto-discovered binaries/scripts with a sidecar
              <code className="font-mono text-xs"> .manifest.json</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <div className="h-9 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
              <div className="h-9 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>
              Registered via <code className="font-mono text-xs">op_register_skill</code>;
              the Planner sees them in the LLM context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <div className="h-9 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
              <div className="h-9 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-14.
      </p>
    </div>
  );
}
export default Tools;

export const Route = createFileRoute('/tools')({
  component: Tools,
});
