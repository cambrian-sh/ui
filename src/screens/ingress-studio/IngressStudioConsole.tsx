import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PluginSurface } from '@/components/PluginSurface';
import { Button, Input } from '@/design-system/components';
import { ScrollArea } from '@/design-system/components/ui/scroll-area';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { ipc } from '@/ipc';
import type { StudioIngress } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';
import { LifecyclePane } from './LifecyclePane';
import { SpecsPane } from './SpecsPane';
import { StudioColumn } from './StudioColumn';
import { OperationsPane } from './OperationsPane';

/** The capability the kernel advertises when the studio is live (ADR-0112). */
const STUDIO_CAPABILITY = 'ingress-studio';

/**
 * The studio has no feed lane — `IngressStudioAdmin` is request/response only —
 * so the list and status poll EXPLICITLY, the drift convention: nothing here
 * pretends to be live, and the panes state their own age where it matters.
 */
const POLL_MS = 15_000;

/**
 * The four tabs are gone (turn 17 §1).
 *
 * They were four STATES of one thing, not four screens, and the server-side
 * lifecycle already enforces their order — so three were always unreachable and
 * a tab strip promised the opposite. What is left is one column plus the two
 * surfaces that are genuinely orthogonal to the flow: the transport/mapping
 * source text, and day-to-day operations on something already armed. Those are
 * reached from the column's own receipts rather than from a peer-looking strip.
 */
const SIDE_PANELS = [
  { id: 'specs', label: 'Source text' },
  { id: 'overview', label: 'Lifecycle & arming' },
  { id: 'operations', label: 'Operations' },
] as const;
type PanelID = (typeof SIDE_PANELS)[number]['id'];

/**
 * The Ingress Studio (ADR-0112 §13, plan D8): describe → secure+capture →
 * draft → confirm → dry-run → arm, with three human gates on purpose. Every
 * rule this screen appears to enforce actually lives kernel-side — the panes
 * render NAMED refusals inline rather than pre-empting them, so the state
 * machine on the server stays the single authority.
 */
export function IngressStudioConsole() {
  return (
    <PluginSurface pluginId="ingress-studio" capability={STUDIO_CAPABILITY}>
      <StudioSurfaces />
    </PluginSurface>
  );
}

function StudioSurfaces() {
  const projection = useStore(projectionStore);
  const readOnly = (projection.state?.role ?? null) !== 'operator';

  const search = useSearch({ strict: false }) as { ingress?: string; tab?: string };
  const navigate = useNavigate();
  // `tab` now names an OPTIONAL side panel, not one of four peers. Absent means
  // the column itself, which is the normal case.
  const panel: PanelID | null =
    (SIDE_PANELS.find((t) => t.id === search.tab)?.id as PanelID | undefined) ?? null;
  const selected = search.ingress ?? '';

  const setPanel = useCallback(
    (next: PanelID | null) =>
      void navigate({
        to: '/ingress-studio',
        search: { ingress: selected || undefined, tab: next ?? undefined },
        replace: true,
      }),
    [navigate, selected],
  );
  const setSelected = useCallback(
    (id: string) =>
      void navigate({
        to: '/ingress-studio',
        search: { ingress: id || undefined, tab: undefined },
        replace: true,
      }),
    [navigate],
  );

  const listQuery = useKernelQuery(['studio', 'ingresses'], ipc.studioListIngresses, {
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
  const ingresses = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const current = ingresses.find((i) => i.ingress_id === selected) ?? null;

  const statusQuery = useKernelQuery(
    ['studio', 'status', selected],
    () => ipc.studioGetIngress(selected),
    { enabled: selected !== '', refetchInterval: POLL_MS, staleTime: 0 },
  );

  const refresh = useCallback(() => {
    void listQuery.refetch();
    void statusQuery.refetch();
  }, [listQuery, statusQuery]);


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none px-6 pt-5 pb-3">
        <h1 className="type-page-title text-[var(--fg-primary)]">Ingress Studio</h1>
        <p className="type-page-description">
          Describe a source, capture its shape, confirm the mapping, dry-run against real traffic —
          then arm. Three of those are human gates, on purpose, and the order is enforced by the
          kernel rather than by this screen.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-5">
        <IngressRail
          ingresses={ingresses}
          selected={selected}
          onSelect={setSelected}
          readOnly={readOnly}
          onCreated={refresh}
          loadError={listQuery.error ? String(listQuery.error.message ?? listQuery.error) : null}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-base)] shadow-[var(--elevation-1)]">
          {current === null ? (
            <p className="p-8 text-[13px] leading-[1.6] text-[var(--fg-muted)]">
              {ingresses.length === 0
                ? 'No ingresses yet. Create one to begin — it starts in DRAFT, where you author its transport and credential before anything can arrive.'
                : 'Select an ingress.'}
            </p>
          ) : panel !== null ? (
            /* A side panel: source text or operations. Reached from the column,
               and it says so — it is not a peer of the stages, it is a detour
               with a way back. */
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-none items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
                <h2 className="type-section-title">
                  {SIDE_PANELS.find((p) => p.id === panel)?.label}
                </h2>
                <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                  {current.display_name || current.ingress_id}
                </span>
                <StateBadge state={current.state} />
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPanel(null)}>
                  Back to the stages
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-5">
                  {panel === 'overview' && (
                    <LifecyclePane
                      ingressId={current.ingress_id}
                      state={current.state}
                      status={statusQuery.data ?? null}
                      readOnly={readOnly}
                      onChanged={refresh}
                    />
                  )}
                  {panel === 'specs' && (
                    <SpecsPane
                      ingressId={current.ingress_id}
                      status={statusQuery.data ?? null}
                      readOnly={readOnly}
                      onChanged={refresh}
                    />
                  )}
                  {panel === 'operations' && (
                    <OperationsPane
                      ingressId={current.ingress_id}
                      state={current.state}
                      status={statusQuery.data ?? null}
                      readOnly={readOnly}
                      onChanged={refresh}
                    />
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <StudioColumn
              summary={current}
              status={statusQuery.data ?? null}
              readOnly={readOnly}
              onChanged={refresh}
              onOpenPanel={setPanel}
              health={current.health}
            />
          )}
        </main>
      </div>
    </div>
  );
}

const STATE_TINT: Record<string, string> = {
  DRAFT: 'var(--fg-muted)',
  CAPTURING: 'var(--color-accent-400)',
  MAPPED: 'var(--color-accent-400)',
  DRY_RUN: 'var(--status-warn)',
  ARMED: 'var(--status-live)',
  PAUSED: 'var(--status-warn)',
  RETIRED: 'var(--fg-muted)',
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium tracking-wide"
      style={{ color: STATE_TINT[state] ?? 'var(--fg-secondary)' }}
    >
      {state}
    </span>
  );
}

function IngressRail({
  ingresses,
  selected,
  onSelect,
  readOnly,
  onCreated,
  loadError,
}: {
  ingresses: StudioIngress[];
  selected: string;
  onSelect: (id: string) => void;
  readOnly: boolean;
  onCreated: () => void;
  loadError: string | null;
}) {
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [ack, setAck] = useState('');
  const create = useMutation(ipc.studioCreateIngress);

  const submit = async () => {
    setAck('');
    const res = await create.mutate(newId.trim(), newName.trim());
    if (res === undefined) return;
    if (res.ok) {
      setAck(res.detail);
      setNewId('');
      setNewName('');
      onSelect(newId.trim());
      onCreated();
    } else {
      setAck(res.error);
    }
  };

  return (
    <aside className="w-[236px] shrink-0">
      <ul className="space-y-1">
        {ingresses.map((i) => (
          <li key={i.ingress_id}>
            <button
              onClick={() => onSelect(i.ingress_id)}
              className={cn(
                'flex w-full items-center justify-between rounded-[var(--radius-lg)] px-2.5 py-2 text-left text-[13px]',
                selected === i.ingress_id
                  ? 'bg-[var(--bg-surface)] text-[var(--fg-primary)]'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]',
              )}
            >
              <span className="truncate">{i.display_name || i.ingress_id}</span>
              <StateBadge state={i.state} />
            </button>
          </li>
        ))}
      </ul>
      {loadError !== null && (
        <p className="mt-2 text-[12px] text-[var(--status-err)]">{loadError}</p>
      )}

      {!readOnly && (
        <div className="mt-4 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
          <p className="text-[12px] font-medium text-[var(--fg-primary)]">New ingress</p>
          <Input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="id, e.g. github-main"
            aria-label="Ingress id"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name"
            aria-label="Display name"
          />
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={create.isLoading || newId.trim() === ''}
          >
            Create
          </Button>
          {create.error !== null && (
            <p className="text-[12px] text-[var(--status-err)]">{create.error}</p>
          )}
          {ack !== '' && (
            <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
              {ack}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
