import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import type {
  ToolDetail as ToolDetailType,
  Role,
  BlastRadiusPreviewResponse,
} from '@/ipc/types';
import {
  Button,
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
  const [detail, setDetail] = useState<ToolDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [preview, setPreview] = useState<BlastRadiusPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const agents = useStore(projectionStore, (s) => s.state?.agents ?? []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getTool(toolId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  const { mutate, isLoading, error: mutationError } = useMutation(
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

  const handleOpenGrant = async (agent_id: string, granted: boolean) => {
    setPending({ agent_id, granted });
    setPreview(null);
    setPreviewLoading(true);
    try {
      const resp = await ipc.getBlastRadiusPreview({
        kind: 'set_tool_grant',
        agent_id,
        tool_name: toolId,
        granted,
      });
      setPreview(resp);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

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
      setPreview(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="mt-4 h-32 animate-pulse rounded bg-[var(--bg-elevated)]" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load tool" body={error ?? 'Tool not found.'} />
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
              {detail.danger && (
                <span className="inline-flex items-center rounded-full bg-[var(--status-warn)]/10 px-2 py-0.5 text-xs font-medium text-[var(--status-warn)]">
                  Danger
                </span>
              )}
              <h2 className="truncate text-sm font-semibold">{detail.id}</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">v{detail.manifest_version}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Granted agents</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.granted_agent_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Recent invocations</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.recent_invocation_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last cost</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              ${detail.last_cost.toFixed(2)}
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
              <p className="text-xs text-[var(--fg-secondary)]">{detail.description}</p>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Schema</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.schema_json !== '{}' ? (
                <pre className="max-h-64 overflow-y-auto rounded bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-muted)]">
                  {detail.schema_json}
                </pre>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No schema provided.</p>
              )}
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
              {detail.granted_agents.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.granted_agents.map((agentId) => (
                    <li key={agentId} className="font-mono text-[var(--fg-secondary)]">
                      {agentId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No agents granted.</p>
              )}
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
                {pending && (
                  <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                    <p className="text-xs font-medium text-[var(--fg-secondary)]">
                      Blast radius preview
                    </p>
                    {previewLoading ? (
                      <p className="mt-1 text-xs text-[var(--fg-muted)]">
                        Loading blast radius…
                      </p>
                    ) : preview ? (
                      <dl className="mt-1 flex flex-col gap-1 text-xs">
                        <div>
                          <dt className="inline text-[var(--fg-muted)]">Affected agents: </dt>
                          <dd className="inline tabular-nums text-[var(--fg-secondary)]">
                            {preview.affected_agents.length}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-[var(--fg-muted)]">Affected plans: </dt>
                          <dd className="inline tabular-nums text-[var(--fg-secondary)]">
                            {preview.affected_plans.length}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--fg-muted)]">
                        Preview unavailable.
                      </p>
                    )}
                  </div>
                )}

                {agents.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {agents.map((agent) => {
                      const isGranted = detail.granted_agents.includes(agent.id);
                      return (
                        <li
                          key={agent.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate font-mono text-[var(--fg-secondary)]">
                            {agent.id}
                          </span>
                          {isGranted ? (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleOpenGrant(agent.id, false)}
                              aria-label={`Revoke ${agent.id}`}
                            >
                              Revoke
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleOpenGrant(agent.id, true)}
                              aria-label={`Grant ${agent.id}`}
                            >
                              Grant
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--fg-muted)]">No agents registered.</p>
                )}

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