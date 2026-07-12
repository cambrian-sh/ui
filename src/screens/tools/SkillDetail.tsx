import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { SkillDetail as SkillDetailType, Role } from '@/ipc/types';
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
import { relativeTime } from '@/lib/relativeTime';

interface SkillDetailProps {
  skillId: string;
  role: Role | null;
}

export function SkillDetail({ skillId, role }: SkillDetailProps) {
  const [detail, setDetail] = useState<SkillDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getSkill(skillId)
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
  }, [skillId]);

  const isOperator = role === 'operator';

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
          <EmptyState title="Failed to load skill" body={error ?? 'Skill not found.'} />
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
              <h2 className="truncate text-sm font-semibold">{detail.id}</h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {detail.scope_tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Loaded in</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.loaded_in_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last loaded</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(detail.last_loaded_at)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loaded">Where Loaded</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
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

          {detail.bundled_tool_grants.length > 0 && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle>Bundled Tool Grants</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.bundled_tool_grants.map((toolId) => (
                    <li key={toolId} className="font-mono text-[var(--fg-secondary)]">
                      {toolId}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>SKILL.md</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.skill_md ? (
                <pre className="max-h-64 overflow-y-auto rounded bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-muted)]">
                  {detail.skill_md}
                </pre>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No SKILL.md provided.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Where Loaded tab */}
        <TabsContent
          value="loaded"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Where Loaded</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.where_loaded.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.where_loaded.map((agentId) => (
                    <li key={agentId} className="font-mono text-[var(--fg-secondary)]">
                      {agentId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">Not loaded anywhere.</p>
              )}
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
              <CardTitle>Skill controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                variant="default"
                disabled={!isOperator}
                aria-label="Register new skill"
                className="w-full"
              >
                Register new skill
              </Button>
              {!isOperator && (
                <p className="mt-2 text-xs text-[var(--fg-muted)]">
                  These actions require the Operator role.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
