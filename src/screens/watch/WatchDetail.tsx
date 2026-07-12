import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { WatchConfigDetail, Role } from '@/ipc/types';
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

interface WatchDetailProps {
  configId: string;
  role: Role | null;
}

export function WatchDetail({ configId, role }: WatchDetailProps) {
  const [detail, setDetail] = useState<WatchConfigDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getWatchConfig(configId)
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
  }, [configId]);

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
          <EmptyState title="Failed to load watch config" body={error ?? 'Watch config not found.'} />
        </CardContent>
      </Card>
    );
  }

  const statusColor =
    detail.last_fire_status === 'ok'
      ? 'var(--status-ok)'
      : detail.last_fire_status === 'error'
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
              <h2 className="truncate text-sm font-semibold">{detail.id}</h2>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Last fire</dt>
            <dd className="text-[var(--fg-secondary)]">
              {detail.last_fire_at ? relativeTime(detail.last_fire_at) : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Status</dt>
            <dd className="text-[var(--fg-secondary)] capitalize">{detail.last_fire_status}</dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Errors</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">{detail.error_count}</dd>
          </div>
        </dl>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Rule</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-48 overflow-y-auto rounded bg-[var(--bg-elevated)] p-2 font-mono text-[10px] text-[var(--fg-muted)]">
                {detail.rule}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target Streams</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.target_streams.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.target_streams.map((stream, i) => (
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
            <CardHeader>
              <CardTitle>Last Fires</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.last_fires.length > 0 ? (
                <ul className="flex flex-col gap-3 text-xs">
                  {detail.last_fires.map((fire, i) => (
                    <li key={i} className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between">
                        <span className="font-medium text-[var(--fg-secondary)] capitalize">{fire.status}</span>
                        <span className="text-[var(--fg-muted)]">{relativeTime(fire.fired_at)}</span>
                      </div>
                      <div className="text-[var(--fg-muted)]">{fire.duration_ms}ms</div>
                      {fire.output && (
                        <pre className="mt-1 max-h-24 overflow-y-auto rounded bg-[var(--bg-elevated)] p-1.5 font-mono text-[10px] text-[var(--fg-muted)]">
                          {fire.output}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No fires recorded</p>
              )}
            </CardContent>
          </Card>

          {detail.errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.errors.map((err, i) => (
                    <li key={i} className="text-[var(--status-err)]">
                      {err}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

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
