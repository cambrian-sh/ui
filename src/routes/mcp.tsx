/* MCP route — Model Context Protocol server registry.
 *
 * MCP servers are external tool providers (stdio command OR streamable-http
 * URL). The kernel registers them; the OperatorConsole surfaces them as
 * tool grants per agent.
 *
 * Surfaces here:
 *  - Per-server card: name, transport, command/url, grant state
 *  - Add new server (operator-only)
 *  - Test connection (best-effort)
 *
 * Per PRD story 25: "As an operator, I can register an MCP server and
 * grant its tools to specific agents."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Mcp() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">MCP</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Model Context Protocol servers. External tool providers the Substrate
          can reach over stdio or streamable-http. Each server exposes a tool
          surface the kernel treats like any other TraitTool capability.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Registered servers</CardTitle>
          <CardDescription>
            Stdio commands and streamable-http URLs. Grant state per agent
            lives on the Tools surface.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <div className="h-10 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
            <div className="h-10 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] opacity-60" />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-14.
      </p>
    </div>
  );
}
export default Mcp;

export const Route = createFileRoute('/mcp')({
  component: Mcp,
});
