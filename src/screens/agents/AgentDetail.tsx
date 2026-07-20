import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import type { Role } from '@/ipc/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { relativeTime } from '@/lib/relativeTime';
import { AgentTraitPill } from './AgentTraitPill';

interface AgentDetailProps {
  agentId: string;
  role: Role | null;
}

export function AgentDetail({ agentId, role }: AgentDetailProps) {
  const agent = useStore(
    projectionStore,
    (s) => s.state?.agents?.find((a) => a.id === agentId) ?? null,
  );
  const isHydrating = useStore(projectionStore, (s) => s.state === null);

  const isOperator = role === 'operator';

  if (isHydrating) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-4 h-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    );
  }

  if (!agent) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load agent" body="Agent not found in the current projection." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <AgentTraitPill trait={agent.trait} />
              <h2 className="truncate text-sm font-semibold">{agent.id}</h2>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Last state</dt>
            <dd className="text-[var(--fg-secondary)]">{agent.last_state}</dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last activity</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(agent.last_activity_at)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Scope</dt>
            <dd className="truncate text-[var(--fg-secondary)]">
              {agent.scope_summary}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">TrustScore</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {(agent.trust_score * 100).toFixed(0)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="genotype" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="genotype">Genotype</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        {/* Genotype tab */}
        <TabsContent
          value="genotype"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-[var(--fg-muted)]">Trait</dt>
                  <dd className="text-[var(--fg-secondary)]">{agent.trait}</dd>
                </div>
                <div>
                  <dt className="text-[var(--fg-muted)]">Scope</dt>
                  <dd className="text-[var(--fg-secondary)]">{agent.scope_summary}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Manifest & Fingerprint</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-muted)]">
                Rich agent details (manifest, cognitive fingerprint, scope config) are not projected by the current kernel build.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History tab */}
        <TabsContent
          value="history"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>TrustScore history</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Current</dt>
                  <dd className="tabular-nums text-[var(--fg-secondary)]">
                    {(agent.trust_score * 100).toFixed(0)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Activity & History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-muted)]">
                TrustScore EWMA, verification outcomes, last error, and last successful plan are not projected by the current kernel build.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions tab */}
        <TabsContent
          value="actions"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Agent controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!isOperator && (
                <p className="mt-2 text-xs text-[var(--fg-muted)]">
                  These actions require the Operator role.
                </p>
              )}
              {isOperator && (
                <p className="mt-2 text-xs text-[var(--fg-muted)]">
                  Mutations are gated behind the Blast-Radius panel (PRD-07).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
