import { useState } from 'react';
import { ipc } from '@/ipc';
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
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';

interface ToolDetailProps {
  toolId: string;
  role: Role | null;
}

type PendingGrant = { agent_id: string; granted: boolean };

const GRANT_META = {
  grant: {
    title: 'Grant tool',
    description:
      'Grant this tool to the agent. The agent will be able to invoke this tool within its effective scope.',
    confirmLabel: 'Grant',
    destructive: false,
  },
  revoke: {
    title: 'Revoke tool',
    description:
      'Revoke this tool from the agent. The agent will no longer be able to invoke this tool. Running plans that depend on this tool may be affected.',
    confirmLabel: 'Revoke',
    destructive: true,
  },
} as const;

export function ToolDetail({ toolId, role }: ToolDetailProps) {
  const tool = useStore(
    projectionStore,
    (s) => s.state?.tools?.find((t) => t.id === toolId) ?? null,
  );
  const isHydrating = useStore(projectionStore, (s) => s.state === null);

  const [pending, setPending] = useState<PendingGrant | null>(null);

  const { mutate, error: mutationError } = useMutation(
    async (args: { agent_id: string; granted: boolean; reason: string }) => {
      return ipc.setToolGrant({
        agent_id: args.agent_id,
        tool_name: toolId,
        granted: args.granted,
        reason: args.reason,
      });
    },
  );

  const isOperator = role === 'operator';

  const handleConfirm = async (reason: string) => {
    if (!pending) return;
    await mutate({
      agent_id: pending.agent_id,
      granted: pending.granted,
      reason,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setPending(null);
    }
  };

  if (isHydrating) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="mt-4 h-32 animate-pulse rounded bg-[var(--bg-elevated)]" />
      </div>
    );
  }

  if (!tool) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load tool" body="Tool not found in the current projection." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {tool.danger && (
                <span className="inline-flex items-center rounded-full bg-[var(--status-warn)]/10 px-2 py-0.5 text-xs font-medium text-[var(--status-warn)]">
                  Danger
                </span>
              )}
              <h2 className="truncate text-sm font-semibold">{tool.id}</h2>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Granted agents</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {tool.granted_agent_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Recent invocations</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {tool.recent_invocation_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last cost</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              ${tool.last_cost.toFixed(2)}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="grants">Granted Agents</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-secondary)]">{tool.description}</p>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Schema</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-muted)]">
                Rich schema (JSON Schema / manifest version) is not projected by the current kernel build.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="grants"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Granted Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-secondary)]">
                Granted to {tool.granted_agent_count} agent(s).
              </p>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                Per-agent grant list is not projected by the current kernel build.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="actions"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          {!isOperator ? (
            <Card>
              <CardHeader>
                <CardTitle>Tool controls</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[var(--fg-muted)]">
                  These actions require the Operator role.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Tool controls</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-[var(--fg-muted)]">
                  Per-agent grant list is not projected by the current kernel build.
                  Grant/revoke controls are unavailable. ({tool.granted_agent_count} agent(s) currently granted.)
                </p>

                {mutationError && <ErrorState reason={mutationError} />}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {pending && (
        <ConfirmMutationDialog
          open
          onOpenChange={handleDialogClose}
          title={(pending.granted ? GRANT_META.grant : GRANT_META.revoke).title}
          description={(pending.granted ? GRANT_META.grant : GRANT_META.revoke).description}
          confirmLabel={(pending.granted ? GRANT_META.grant : GRANT_META.revoke).confirmLabel}
          destructive={(pending.granted ? GRANT_META.grant : GRANT_META.revoke).destructive}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
