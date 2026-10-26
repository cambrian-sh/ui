import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { queryClient } from '@/lib/queryClient';
import { formatRelativeTime, formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import type {
  BreakerState,
  ConfigWriteOutcome,
  GeneratorRole,
  GeneratorSpec,
  RoleAssignment,
} from '@/ipc/types';
import { GENERATOR_ROLES } from '@/ipc/types';
import { GeneratorEditor } from './GeneratorEditor';

/**
 * The editor's starting state for a generator that does not exist yet. Every
 * measured field is its honest zero — the card metrics never render for a
 * draft, only the form does.
 */
function newGeneratorDraft(): GeneratorSpec {
  return {
    id: '',
    protocol: 'openai',
    endpoint: '',
    model: '',
    timeout_ms: 0,
    capability_tags: [],
    native_tools: false,
    disable_thinking: false,
    breaker: 'closed',
    recent_failures: 0,
    p50_latency_ms: 0,
    p99_latency_ms: 0,
    tokens_today: -1,
    calls_today: -1,
    latency_samples: [],
    key_configured: false,
    key_last_four: '',
    key_source: '',
    key_added_at: '',
    key_last_used_at: '',
    last_tested_at: '',
    last_test_ok: false,
  };
}

const BREAKER: Record<BreakerState, { label: string; colour: string; note: string }> = {
  closed: { label: 'healthy', colour: 'var(--status-live)', note: 'accepting calls' },
  half_open: {
    label: 'degraded',
    colour: 'var(--status-warn)',
    note: 'probing after failures — work is falling back',
  },
  open: {
    label: 'open',
    colour: 'var(--status-err)',
    note: 'refusing calls — everything pointed here is falling back',
  },
};

/** What each organ does, in one line. */
const ROLE_NOTE: Record<GeneratorRole, string> = {
  planner:
    'Emits every step’s capability contract, so routing quality is capped here (ADR-0100 D3).',
  verifier: 'Scores completed work. Its labels are what per-capability merit is built from.',
  router: 'Resolves a capability contract to an eligible agent.',
  interview: 'Asks the clarifying questions before a plan forms.',
  memory: 'Answers grounded questions over the corpus.',
};

/**
 * Models & providers.
 *
 * The decision an operator actually makes here is *which generator serves which
 * organ*, and today that is five string fields at the bottom of a JSON file.
 * So the role map is a first-class grid, and each generator is a card with a
 * pulse — breaker, latency, token volume, key status, last test — rather than
 * a config entry.
 */
export function ProvidersSettings({ canMutate }: { canMutate: boolean }) {
  const generators = useKernelQuery(['generators'], () => ipc.listGenerators());
  const roles = useKernelQuery(['role-assignments'], () => ipc.listRoleAssignments());
  const [editing, setEditing] = useState<GeneratorSpec | null>(null);

  // No kernel serves this yet. An empty form backed by nothing is worse than no
  // form, so the pane says which of the two it is showing.
  if (generators.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Models &amp; providers</CardTitle>
          <CardDescription>
            This kernel does not report its generators, so there is nothing to configure here
            yet. The panel is built and will populate as soon as the contract serves them —
            it is not showing you an empty deployment.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (generators.isLoading) {
    return <p className="text-[12.5px] text-[var(--fg-muted)]">Loading generators…</p>;
  }

  const list = generators.data ?? [];

  if (editing) {
    return (
      <GeneratorEditor
        generator={editing}
        canMutate={canMutate}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-page-title">
            Models &amp; providers
          </h2>
          <p className="type-page-description mt-1">
            {list.length} generator{list.length === 1 ? '' : 's'}. Every figure here is a token
            count — a completion response never carries a price.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditing(newGeneratorDraft())}
          disabled={!canMutate}
        >
          Add generator
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((g) => (
          <GeneratorCard
            key={g.id}
            generator={g}
            roles={roles.data ?? []}
            onEdit={() => setEditing(g)}
          />
        ))}
      </div>

      <RoleMap generators={list} roles={roles.data ?? []} canMutate={canMutate} />
    </div>
  );
}

function GeneratorCard({
  generator: g,
  roles,
  onEdit,
}: {
  generator: GeneratorSpec;
  roles: RoleAssignment[];
  onEdit: () => void;
}) {
  const breaker = BREAKER[g.breaker];
  const pointedAt = roles.filter((r) => r.generator_id === g.id);
  // A generator nothing points at, that nothing has called, is a thing to
  // remove or assign — not a healthy card.
  const unused = pointedAt.length === 0 && g.calls_today === 0;
  const testStale =
    !g.last_tested_at ||
    Date.now() - new Date(g.last_tested_at).getTime() > 7 * 24 * 3600 * 1000;

  const tone = g.breaker !== 'closed' ? breaker.colour : unused ? 'var(--status-idle)' : undefined;

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]',
        tone && 'tint-wash tint-ring',
      )}
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', g.breaker === 'closed' && 'cambrian-live-pulse')}
          style={{ background: breaker.colour }}
        />
        <span className="font-mono text-[13px] font-medium">{g.id}</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{g.model}</span>
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Edit →
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
        <Metric label="breaker" value={breaker.label} tone={breaker.colour} />
        <Metric label="p50 / p99" value={`${g.p50_latency_ms} / ${g.p99_latency_ms}ms`} />
        <Metric
          label="today"
          value={`${formatTokens(g.tokens_today)} tok · ${g.calls_today} calls`}
        />
        <Metric
          label="key"
          value={g.key_configured ? `····${g.key_last_four}` : 'none stored'}
          tone={g.key_configured ? undefined : 'var(--status-warn)'}
        />
      </div>

      <Sparkline samples={g.latency_samples} />

      <div className="flex flex-wrap gap-1">
        {g.capability_tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
        {g.native_tools && <Tag>native_tools</Tag>}
        {g.disable_thinking && <Tag>disable_thinking</Tag>}
        <Tag>{g.timeout_ms}ms timeout</Tag>
      </div>

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {g.breaker !== 'closed' ? (
          <span className="text-[var(--status-warn)]">
            {breaker.note}
            {pointedAt.length > 0 &&
              ` — ${pointedAt.map((r) => r.role).join(', ')} ${pointedAt.length === 1 ? 'is' : 'are'} affected.`}
          </span>
        ) : unused ? (
          <span className="text-[var(--fg-muted)]">
            No role points at this and nothing has called it today. Assign it or remove it.
          </span>
        ) : (
          <>
            Serving {pointedAt.map((r) => r.role).join(', ')}.{' '}
            <span className={testStale ? 'text-[var(--status-warn)]' : undefined}>
              Last tested{' '}
              {g.last_tested_at ? formatRelativeTime(g.last_tested_at) : 'never'}
              {g.last_tested_at && !g.last_test_ok && ' — and it failed'}.
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The decision an operator actually makes.
 *
 * Rows are organs, columns are generators, one cell selected per row.
 */
function RoleMap({
  generators,
  roles,
  canMutate,
}: {
  generators: GeneratorSpec[];
  roles: RoleAssignment[];
  canMutate: boolean;
}) {
  const assigned = new Map(roles.map((r) => [r.role, r]));
  const [written, setWritten] = useState<ConfigWriteOutcome | null>(null);

  const assign = useMutation(async (role: GeneratorRole, generatorId: string) => {
    const res = await ipc.setRoleAssignment(role, generatorId, `assign ${role} to ${generatorId}`);
    const outcome = res.outcomes.length > 0 ? res.outcomes[0] : null;
    setWritten(outcome);
    // A rejected write is a FAILED assignment. The kernel reports it per key
    // rather than as an RPC error, so it must be raised here or the grid would
    // sit silent over a store that refused it.
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the kernel refused this assignment');
    }
    // Role assignments are a request/response read, not a feed projection — no
    // fold will ever refresh them, so the write path is the only place that can.
    await queryClient.invalidateQueries({ queryKey: ['role-assignments'] });
    return res;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Which generator serves which organ</CardTitle>
        <CardDescription>
          Changing a row takes effect on the next call. Nothing in flight is interrupted.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="type-label p-2 text-left text-[var(--fg-muted)]">
                Role
              </th>
              {generators.map((g) => (
                <th
                  key={g.id}
                  className="p-2 text-left font-mono text-[10.5px] font-normal text-[var(--fg-secondary)]"
                >
                  {g.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GENERATOR_ROLES.map((role) => {
              const current = assigned.get(role);
              return (
                <tr key={role}>
                  <th scope="row" className="max-w-[280px] p-2 text-left align-top">
                    <div className="font-medium text-[var(--fg-primary)]">{role}</div>
                    <div className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
                      {ROLE_NOTE[role]}
                    </div>
                    {current?.falling_back_to && (
                      <div className="mt-0.5 text-[11px] text-[var(--status-warn)]">
                        Falling back to {current.falling_back_to} — its own breaker is open.
                      </div>
                    )}
                  </th>
                  {generators.map((g) => {
                    const selected = current?.generator_id === g.id;
                    return (
                      <td key={g.id} className="p-2 align-top">
                        <input
                          type="radio"
                          name={`role-${role}`}
                          checked={selected}
                          disabled={!canMutate || assign.isLoading}
                          onChange={() => {
                            void assign.mutate(role, g.id);
                          }}
                          aria-label={`${role} → ${g.id}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {assign.error && (
          <p className="mt-2 text-[12px] text-[var(--status-err)]">{assign.error}</p>
        )}
        {written && !assign.error && written.effect === 'live' && (
          <p className="mt-2 text-[12px] text-[var(--status-live)]">
            Stored and applied — the organ's next call goes to the new generator.
          </p>
        )}
        {written && !assign.error && written.effect === 'shadowed' && (
          <p className="mt-2 text-[12px] text-[var(--status-warn)]">
            Stored, but <code className="font-mono">{written.shadowed_by}</code> supplies the
            live value and outranks the store. This takes effect when that variable is removed.
          </p>
        )}
        {written && !assign.error && written.effect === 'restart_required' && (
          <p className="mt-2 text-[12px] text-[var(--fg-secondary)]">
            Stored. It takes effect the next time the kernel starts.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="type-label text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="truncate font-mono text-[11.5px]" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Sparkline({ samples }: { samples: number[] }) {
  if (samples.length === 0) return null;
  const max = Math.max(...samples, 1);
  return (
    <div
      className="flex h-6 items-end gap-0.5"
      role="img"
      aria-label={`Recent call latency, ${samples.length} samples`}
    >
      {samples.slice(-24).map((s, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px] bg-[color-mix(in_srgb,var(--accent-bg)_55%,transparent)]"
          style={{ height: `${Math.max(8, (s / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      {children}
    </span>
  );
}
