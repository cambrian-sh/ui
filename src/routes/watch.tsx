/* Watch & Reactive route.
 *
 * Watches are long-running reactive triggers. The Daemon emits a stream; a
 * Watch configures a predicate; on a match, the Watch fires a target action
 * (e.g. notify, inject, pause). Premium feature — surfaced only when the
 * kernel advertises the "watch" capability.
 *
 * Surfaces here:
 *  - Per-watch card: stream, predicate, target action, last-fired timestamp
 *  - Create / edit / disable
 *  - Live firing log (watch_triggered events from the feed)
 *
 * Per PRD story 31: "As an operator, I can configure a Watch that fires an
 * action when a stream matches a predicate."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Watch() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Watch & Reactive</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Reactive triggers on Daemon streams. Premium feature — this surface
          only appears when the kernel advertises the <code className="font-mono text-xs">watch</code>{" "}
          capability in the Snapshot handshake.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Watches</CardTitle>
          <CardDescription>
            Stream + predicate + target action. Firing is logged as an
            <code className="font-mono text-xs"> audit</code> entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
            Capability not advertised — surface hidden
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-15 (premium).
      </p>
    </div>
  );
}
export default Watch;

export const Route = createFileRoute('/watch')({
  component: Watch,
});
