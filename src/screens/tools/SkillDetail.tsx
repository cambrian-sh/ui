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

interface SkillDetailProps {
  skillId: string;
  role: Role | null;
}

export function SkillDetail({ skillId, role }: SkillDetailProps) {
  const skill = useStore(
    projectionStore,
    (s) => s.state?.skills?.find((s) => s.id === skillId) ?? null,
  );
  const isHydrating = useStore(projectionStore, (s) => s.state === null);

  const isOperator = role === 'operator';

  if (isHydrating) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-elevated)]" />
        <div className="mt-4 h-32 animate-pulse rounded bg-[var(--bg-elevated)]" />
      </div>
    );
  }

  if (!skill) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load skill" body="Skill not found in the current projection." />
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
              <h2 className="truncate text-sm font-semibold">{skill.id}</h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {skill.scope_tags.map((tag) => (
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
              {skill.loaded_in_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last loaded</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(skill.last_loaded_at)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
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
              <p className="text-xs text-[var(--fg-secondary)]">{skill.description}</p>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Bundled Tool Grants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--fg-muted)]">
                Bundled tool grants and SKILL.md are not projected by the current kernel build.
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
              <CardTitle>Skill controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs text-[var(--fg-muted)]">
                Rich skill details (where loaded, bundled grants, SKILL.md) are not projected by the current kernel build.
              </p>
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
