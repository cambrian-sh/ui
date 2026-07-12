import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type {
  ScopeDetail as ScopeDetailType,
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
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { ScopeTagList } from './ScopeTagList';
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';

interface ScopeDetailProps {
  agentId: string;
  role: Role | null;
}

function parseTags(s: string): string[] {
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function computeMode(
  old: { required_tags: string[]; any_of_tags: string[]; forbidden_tags: string[] },
  next: { required_tags: string[]; any_of_tags: string[]; forbidden_tags: string[] },
): 'widen' | 'narrow' {
  const oldRestrictive =
    old.required_tags.length + old.forbidden_tags.length - old.any_of_tags.length;
  const newRestrictive =
    next.required_tags.length + next.forbidden_tags.length - next.any_of_tags.length;
  return newRestrictive <= oldRestrictive ? 'widen' : 'narrow';
}

export function ScopeDetail({ agentId, role }: ScopeDetailProps) {
  const [detail, setDetail] = useState<ScopeDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [reqInput, setReqInput] = useState('');
  const [anyInput, setAnyInput] = useState('');
  const [forbiddenInput, setForbiddenInput] = useState('');
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<BlastRadiusPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getScope(agentId)
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
  }, [agentId]);

  const { mutate, isLoading, error: mutationError } = useMutation(
    async (args: {
      agent_id: string;
      required_tags: string[];
      any_of_tags: string[];
      forbidden_tags: string[];
      reason: string;
    }) => {
      return ipc.setScope({
        command_id: crypto.randomUUID(),
        reason: args.reason,
        agent_id: args.agent_id,
        required_tags: args.required_tags,
        any_of_tags: args.any_of_tags,
        forbidden_tags: args.forbidden_tags,
      });
    },
  );

  const isOperator = role === 'operator';

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-4 h-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load scope" body={error ?? 'Agent not found.'} />
        </CardContent>
      </Card>
    );
  }

  const handleOpenForm = () => {
    setReqInput(detail.effective_scope.required_tags.join(', '));
    setAnyInput(detail.effective_scope.any_of_tags.join(', '));
    setForbiddenInput(detail.effective_scope.forbidden_tags.join(', '));
    setFormOpen(true);
  };

  const handleReviewChange = async () => {
    const required_tags = parseTags(reqInput);
    const any_of_tags = parseTags(anyInput);
    const forbidden_tags = parseTags(forbiddenInput);
    setPending(true);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const mode = computeMode(detail.effective_scope, {
        required_tags,
        any_of_tags,
        forbidden_tags,
      });
      const resp = await ipc.getBlastRadiusPreview({
        kind: 'set_scope',
        agent_id: agentId,
        scope: { required_tags, any_of_tags, forbidden_tags },
        mode,
      });
      setPreview(resp);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = async (reason: string) => {
    const required_tags = parseTags(reqInput);
    const any_of_tags = parseTags(anyInput);
    const forbidden_tags = parseTags(forbiddenInput);
    await mutate({
      agent_id: agentId,
      required_tags,
      any_of_tags,
      forbidden_tags,
      reason,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setPending(false);
      setPreview(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{detail.agent_id}</h2>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">k-anonymity floor</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.k_anonymity_floor}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Write tags</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.default_write_tags.length}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs defaultValue="effective" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="effective">Effective Scope</TabsTrigger>
          <TabsTrigger value="caller">Caller Scope</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent
          value="effective"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Effective Scope</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-xs">
                <ScopeTagList tags={detail.effective_scope.required_tags} label="Required tags" />
                <ScopeTagList tags={detail.effective_scope.any_of_tags} label="Any-of tags" />
                <ScopeTagList tags={detail.effective_scope.forbidden_tags} label="Forbidden tags" />
              </dl>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Default Write Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-xs">
                <ScopeTagList tags={detail.default_write_tags} label="Tags" />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="caller"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Caller Scope</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-xs">
                <ScopeTagList tags={detail.caller_scope.required_tags} label="Required tags" />
                <ScopeTagList tags={detail.caller_scope.any_of_tags} label="Any-of tags" />
                <ScopeTagList tags={detail.caller_scope.forbidden_tags} label="Forbidden tags" />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="history"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Scope Change History</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.scope_change_history.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.scope_change_history.map((entry, i) => (
                    <li key={i} className="text-[var(--fg-secondary)]">
                      {entry}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No scope changes recorded.</p>
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
                <CardTitle>Scope controls</CardTitle>
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
                <CardTitle>Scope controls</CardTitle>
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

                {formOpen ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="scope-required" className="text-xs font-medium text-[var(--fg-secondary)]">
                        Required tags (comma-separated)
                      </label>
                      <Input
                        id="scope-required"
                        value={reqInput}
                        onChange={(e) => setReqInput(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="scope-any-of" className="text-xs font-medium text-[var(--fg-secondary)]">
                        Any-of tags (comma-separated)
                      </label>
                      <Input
                        id="scope-any-of"
                        value={anyInput}
                        onChange={(e) => setAnyInput(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="scope-forbidden" className="text-xs font-medium text-[var(--fg-secondary)]">
                        Forbidden tags (comma-separated)
                      </label>
                      <Input
                        id="scope-forbidden"
                        value={forbiddenInput}
                        onChange={(e) => setForbiddenInput(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={isLoading}
                        onClick={handleReviewChange}
                        aria-label="Review scope change"
                      >
                        Review change
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => setFormOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="default"
                    disabled={isLoading}
                    onClick={handleOpenForm}
                    aria-label="Adjust scope"
                    className="w-full"
                  >
                    Adjust scope
                  </Button>
                )}

                {mutationError && <ErrorState reason={mutationError} />}

                <p className="text-xs text-[var(--fg-muted)]">
                  Mutations are gated behind the Blast-Radius panel (PRD-07).
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {pending && (
        <ConfirmMutationDialog
          open
          onOpenChange={handleDialogClose}
          title="Adjust scope"
          description="Apply the new required / any-of / forbidden tags to this agent. Running plans that depend on the current scope may be affected."
          confirmLabel="Apply scope change"
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}