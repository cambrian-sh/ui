import type { Role } from '@/ipc/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ScrollArea,
} from '@/design-system/components';
import { relativeTime } from '@/lib/relativeTime';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';

interface WatchDetailProps {
  configId: string;
  role: Role | null;
}

export function WatchDetail({ configId, role }: WatchDetailProps) {
  const entity = useStore(
    projectionStore,
    (s) => s.state?.watch_configs?.find((w) => w.id === configId) ?? null,
  );
  const isConnecting = useStore(projectionStore, (s) => s.state === null);

  const isOperator = role === 'operator';

  if (isConnecting) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-4 h-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    );
  }

  if (!entity) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Watch config not found" body="The watch configuration was not found in the current projection." />
        </CardContent>
      </Card>
    );
  }

  const statusColor =
    entity.last_fire_status === 'ok'
      ? 'var(--status-ok)'
      : entity.last_fire_status === 'error'
        ? 'var(--status-err)'
        : 'var(--status-warn)';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: statusColor }}
                aria-hidden="true"
              />
              <h2 className="truncate text-sm font-semibold">{entity.id}</h2>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Last fire</dt>
            <dd className="text-[var(--fg-secondary)]">
              {entity.last_fire_at ? relativeTime(entity.last_fire_at) : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Status</dt>
            <dd className="text-[var(--fg-secondary)] capitalize">{entity.last_fire_status}</dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Errors</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">{entity.error_count}</dd>
          </div>
        </dl>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Target Streams</CardTitle>
            </CardHeader>
            <CardContent>
              {entity.target_streams.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {entity.target_streams.map((stream, i) => (
                    <li key={i} className="font-mono text-[var(--fg-secondary)]">
                      {stream}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No target streams</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs italic text-[var(--fg-muted)]">
                Rule definition / fire history / errors are not projected by the current kernel build.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                variant="default"
                disabled={!isOperator}
                aria-label="Create Watch"
                className="w-full"
              >
                Create Watch
              </Button>
              <Button
                variant="default"
                disabled={!isOperator}
                aria-label="Edit Watch"
                className="w-full"
              >
                Edit Watch
              </Button>
              <Button
                variant="danger"
                disabled={!isOperator}
                aria-label="Delete Watch"
                className="w-full"
              >
                Delete Watch
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
        </div>
      </ScrollArea>
    </div>
  );
}
