/* Agent detail panel — the right inspector content for the Agents console.
 *
 * PRD-06 §6: agent header + Genotype tab + History tab.
 * Mutating actions are operator-only and gated behind the Blast-Radius
 * panel (PRD-07); they are surfaced as disabled affordances with a note.
 */
import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { AgentDetail as AgentDetailType, Role } from '@/ipc/types';
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
  Separator,
} from '@/design-system/components';
import { relativeTime } from '@/lib/relativeTime';
import { AgentTraitPill } from './AgentTraitPill';

interface AgentDetailProps {
  agentId: string;
  role: Role | null;
}

export function AgentDetail({ agentId, role }: AgentDetailProps) {
  const [detail, setDetail] = useState<AgentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getAgent(agentId)
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
          <EmptyState title="Failed to load agent" body={error ?? 'Agent not found.'} />
        </CardContent>
      </Card>
    );
  }

  const isCognitive = detail.trait === 'Cognitive';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <AgentTraitPill trait={detail.trait} />
              <h2 className="truncate text-sm font-semibold">{detail.id}</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              v{detail.manifest_version}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Last state</dt>
            <dd className="text-[var(--fg-secondary)]">{detail.last_state}</dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last activity</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(detail.last_activity_at)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Scope</dt>
            <dd className="truncate text-[var(--fg-secondary)]">
              {detail.scope_summary}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">TrustScore</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {(detail.trust_score * 100).toFixed(0)}
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
              <CardTitle>Manifest</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-[var(--fg-muted)]">Version</dt>
                  <dd className="font-mono text-[var(--fg-secondary)]">
                    {detail.manifest_version}
                  </dd>
                </div>
              </dl>
              {detail.manifest_json !== '{}' && (
                <pre className="mt-3 max-h-32 overflow-y-auto rounded bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-muted)]">
                  {detail.manifest_json}
                </pre>
              )}
            </CardContent>
          </Card>

          {isCognitive && detail.cognitive_fingerprint && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle>Cognitive fingerprint</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-[10px] text-[var(--fg-muted)] break-all">
                  {detail.cognitive_fingerprint}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-xs">
                <div>
                  <dt className="text-[var(--fg-muted)]">Required tags</dt>
                  <dd className="text-[var(--fg-secondary)]">
                    {detail.scope.required_tags.length > 0
                      ? detail.scope.required_tags.join(', ')
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--fg-muted)]">Any-of tags</dt>
                  <dd className="text-[var(--fg-secondary)]">
                    {detail.scope.any_of_tags.length > 0
                      ? detail.scope.any_of_tags.join(', ')
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--fg-muted)]">Forbidden tags</dt>
                  <dd className="text-[var(--fg-secondary)]">
                    {detail.scope.forbidden_tags.length > 0
                      ? detail.scope.forbidden_tags.join(', ')
                      : '—'}
                  </dd>
                </div>
              </dl>
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
                    {(detail.trust_score * 100).toFixed(0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">EWMA</dt>
                  <dd className="tabular-nums text-[var(--fg-secondary)]">
                    {(detail.trust_score_ewma * 100).toFixed(0)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {detail.recent_verification_outcomes.length > 0 && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle>Recent verification outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.recent_verification_outcomes.map((outcome, i) => (
                    <li key={i} className="text-[var(--fg-secondary)]">
                      {outcome}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-xs">
                <div>
                  <dt className="text-[var(--fg-muted)]">Last error</dt>
                  <dd className="text-[var(--status-err)]">
                    {detail.last_error || '—'}
                  </dd>
                </div>
                <Separator className="my-1" />
                <div>
                  <dt className="text-[var(--fg-muted)]">Last successful plan</dt>
                  <dd className="font-mono text-[var(--fg-secondary)]">
                    {detail.last_successful_plan_id || '—'}
                  </dd>
                </div>
              </dl>
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
              <Button
                variant="default"
                disabled={!isOperator}
                aria-label="Adjust scope"
                className="w-full"
              >
                Adjust scope
              </Button>
              <Button
                variant="default"
                disabled={!isOperator}
                aria-label="Adjust tool grants"
                className="w-full"
              >
                Adjust tool grants
              </Button>
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
