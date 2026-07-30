import { useMemo, useState } from 'react';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { relativeTime } from '@/lib/relativeTime';
import { cn } from '@/design-system/lib/utils';
import { Inspector } from '@/components/InspectorSlot';
import {
  buildSurfaceRegistry,
  PROBLEM_COPY,
  type SurfaceRow,
} from './surfaceRegistry';

export interface SurfaceRegistryPaneProps {
  /** Jump to another pane of this console. */
  onGo?: (tab: string) => void;
}

/**
 * The surface registry.
 *
 * A surface is the unit policy is written against, and until now it was a
 * string that appeared in other people's config: the ingress registry stamps
 * it, policy links target it, a daemon serves it, and nothing put those
 * together. So *"the Telegram surface"* was not a thing an operator could point
 * at and inspect.
 *
 * The join is what makes this worth a screen rather than a list — it is the only
 * place that can see a **policy linked to a surface nobody registers**, which
 * applies to nobody and looks identical to a working boundary everywhere else.
 */
export function SurfaceRegistryPane({ onGo }: SurfaceRegistryPaneProps) {
  const projection = useStore(projectionStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ingresses = useKernelQuery(['ingresses'], () => ipc.listIngresses());
  const links = useKernelQuery(['links'], () => ipc.listLinks());
  const policies = useKernelQuery(['policies'], () => ipc.listPolicies());

  // Daemons come off the projection: `agents` folds from AgentReadyOp, so an
  // absent agent means nothing has reported — not that it is down.
  const agents = projection.state?.agents ?? [];

  const rows = useMemo(
    () =>
      buildSurfaceRegistry(
        ingresses.data ?? [],
        links.data ?? [],
        policies.data ?? [],
        agents,
      ),
    [ingresses.data, links.data, policies.data, agents],
  );

  const loading = ingresses.isLoading || links.isLoading || policies.isLoading;
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const faulted = rows.filter((r) => r.problems.includes('no-ingress')).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none px-4 pb-3 pt-4">
        <h2 className="text-[17px] font-medium leading-[1.25] tracking-[-0.01em]">Surfaces</h2>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
          Where the outside world enters. Each row joins what registers the surface, the daemon
          serving it, and the policy bounding it.
          {faulted > 0 && (
            <>
              {' '}
              <span className="text-[var(--status-err)]">
                {faulted} {faulted === 1 ? 'surface has' : 'surfaces have'} policy linked but
                nothing registering them.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-[12.5px] text-[var(--fg-muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="max-w-[560px] p-4 text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
            No surfaces. Nothing is registered as an entry point and no policy targets one, so
            every surface is derived from the transport. That is a correct deployment, not a
            missing step.
          </p>
        ) : (
          <ul role="list" aria-label="Surfaces">
            {rows.map((row) => (
              <li key={row.id}>
                <SurfaceRowView
                  row={row}
                  selected={row.id === selectedId}
                  onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <Inspector label="Surface detail">
          <SurfaceDetail row={selected} onGo={onGo} />
        </Inspector>
      )}
    </div>
  );
}

function SurfaceRowView({
  row,
  selected,
  onClick,
}: {
  row: SurfaceRow;
  selected: boolean;
  onClick: () => void;
}) {
  const worst = worstProblem(row);
  const tone =
    worst === 'err' ? 'var(--status-err)' : worst === 'warn' ? 'var(--status-warn)' : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
        'shadow-[inset_0_-1px_0_var(--border-subtle)]',
        'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        tone && 'tint-wash',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: tone ?? 'var(--status-live)' }}
        />
        <span className="truncate font-mono text-[13px] text-[var(--fg-primary)]">{row.id}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--fg-muted)]">
        <span>
          {row.ingress ? (
            <>
              registered by <span className="font-mono">{row.ingress.agent_id}</span>
            </>
          ) : (
            <span className="text-[var(--status-err)]">nothing registers it</span>
          )}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {row.policies.length === 0
            ? 'no policy linked'
            : `${row.policies.length} ${row.policies.length === 1 ? 'policy' : 'policies'} linked`}
        </span>
        {row.daemon && (
          <>
            <span aria-hidden="true">·</span>
            <span>active {relativeTime(row.daemon.last_activity_at)}</span>
          </>
        )}
      </div>

      {row.problems.length > 0 && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: tone }}>
          {row.problems.map((p) => PROBLEM_COPY[p].kicker).join(' · ')}
        </span>
      )}
    </button>
  );
}

function SurfaceDetail({
  row,
  onGo,
}: {
  row: SurfaceRow;
  onGo?: (tab: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Surface
        </div>
        <p className="mt-1 break-all font-mono text-[13px] text-[var(--fg-primary)]">{row.id}</p>
      </div>

      <Field label="What registers it">
        {row.ingress ? (
          <span className="font-mono">{row.ingress.agent_id}</span>
        ) : (
          <span className="text-[var(--status-err)]">nothing</span>
        )}
      </Field>

      <Field label="Which daemon serves it">
        {row.daemon ? (
          <>
            <span className="font-mono">{row.daemon.id}</span>
            <span className="ml-2 text-[var(--fg-muted)]">
              {row.daemon.trait} · {row.daemon.last_state} · active{' '}
              {relativeTime(row.daemon.last_activity_at)}
            </span>
          </>
        ) : (
          <span className="text-[var(--fg-muted)]">
            {row.ingress ? 'no daemon has reported' : '—'}
          </span>
        )}
      </Field>

      <Field label="May speak for">
        {row.namespace.length > 0 ? (
          <span className="font-mono">{row.namespace.join(', ')}</span>
        ) : row.ingress ? (
          <span className="text-[var(--status-warn)]">any identity — unrestricted</span>
        ) : (
          <span className="text-[var(--fg-muted)]">—</span>
        )}
      </Field>

      <div>
        <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Policies linked here ({row.policies.length})
        </div>
        {row.policies.length === 0 ? (
          <p className="text-[12px] text-[var(--fg-muted)]">
            None. This surface is bounded only by what applies at broader containers.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.policies.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 text-[12px]">
                <span className="truncate text-[var(--fg-primary)]">{p.name || p.id}</span>
                <span
                  className="shrink-0 font-mono text-[10px]"
                  style={{
                    color:
                      p.mode === 'report_only'
                        ? 'var(--status-warn)'
                        : 'var(--fg-muted)',
                  }}
                >
                  {p.mode}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {row.problems.map((problem) => {
        const copy = PROBLEM_COPY[problem];
        const tone = copy.tone === 'err' ? 'var(--status-err)' : 'var(--status-warn)';
        return (
          <div
            key={problem}
            className="flex flex-col gap-1 rounded-md p-2.5 tint-wash tint-ring"
            style={{ '--tint': tone } as React.CSSProperties}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ color: tone }}
            >
              {copy.kicker}
            </span>
            <span className="text-[12px] leading-[1.55] text-[var(--fg-primary)]">
              {copy.body}
            </span>
          </div>
        );
      })}

      {onGo && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onGo('ingress')}
            className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            Open the ingress registry →
          </button>
          <button
            type="button"
            onClick={() => onGo('reachability')}
            className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            See what it reaches →
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {label}
      </div>
      <p className="mt-0.5 text-[12.5px] text-[var(--fg-primary)]">{children}</p>
    </div>
  );
}

function worstProblem(row: SurfaceRow): 'err' | 'warn' | null {
  if (row.problems.some((p) => PROBLEM_COPY[p].tone === 'err')) return 'err';
  if (row.problems.length > 0) return 'warn';
  return null;
}
