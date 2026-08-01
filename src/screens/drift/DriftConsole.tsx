import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PluginSurface } from '@/components/PluginSurface';
import { Inspector } from '@/components/InspectorSlot';
import { ErrorState } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { ipc } from '@/ipc';
import type { Alert } from '@/ipc/types';
import { AlertFeed, type AlertFilter } from './AlertFeed';
import { AlertEvidence } from './AlertEvidence';
import { OutcomeLedger } from './OutcomeLedger';
import { CoveragePane } from './CoveragePane';
import { RetentionPane } from './RetentionPane';
import { cn } from '@/design-system/lib/utils';

/** The capability the kernel advertises when the record lane has a store. */
const RECORD_LANE = 'record-lane';
/** Gates `RetentionRunOp` on the operator feed (contract 0084). */
const RETENTION_FEED = 'retention-feed';

/**
 * How often the alert surfaces re-poll.
 *
 * This is the ONE place in the console that polls the kernel, and it is
 * deliberate rather than an oversight. `queryClient.ts` turns every automatic
 * refetch off so nothing starts polling by ACCIDENT; alerts are the case where
 * there is no feed lane to fold — `ListAlerts` is request/response only, and
 * putting alerts on the operator event feed is a contract bump. The header says
 * "polled N s ago" for exactly this reason: a live indicator over a poll would be
 * a lie. When push lands, this constant and that indicator go together.
 */
const POLL_MS = 15_000;

/**
 * Coverage re-reads on a slower cadence than alerts.
 *
 * Coverage changes when a connector reconnects and re-reports, not when a message
 * arrives — so a fast poll would spend requests to watch a value that moves on the
 * scale of daemon restarts. The page still states its own age from `reported_at`,
 * which is the number that matters.
 */
const COVERAGE_POLL_MS = 60_000;

const TABS = [
  { id: 'alerts', label: 'Alerts' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'retention', label: 'Retention' },
] as const;

export type DriftTab = (typeof TABS)[number]['id'];

/** Where "since you last looked" is remembered. Per client, which is what it claims. */
const LAST_SEEN_KEY = 'cambrian.drift.lastSeenAlertId';

export function DriftConsole() {
  return (
    /*
      Mounted inside PluginSurface, which owns contract-skew reporting by
      CONSTRUCTION and the honest empty state. A kernel without the drift plugin
      is correct, not broken — and a panel rendered outside this wrapper silently
      loses skew detection.
    */
    <PluginSurface pluginId="drift" capability={RECORD_LANE}>
      <DriftSurfaces />
    </PluginSurface>
  );
}

function DriftSurfaces() {
  const search = useSearch({ strict: false }) as { tab?: string; alert?: string };
  const navigate = useNavigate();
  const projection = useStore(projectionStore);
  const capabilities = projection.state?.capabilities ?? [];
  const hasRetentionFeed = capabilities.includes(RETENTION_FEED);

  const tab: DriftTab = isTab(search.tab) ? search.tab : 'alerts';
  const selectedId = search.alert ? Number(search.alert) : null;

  const setTab = useCallback(
    (next: DriftTab) => {
      void navigate({ to: '/drift', search: { tab: next, alert: undefined }, replace: true });
    },
    [navigate],
  );

  const setAlert = useCallback(
    (id: number | null) => {
      void navigate({
        to: '/drift',
        search: { tab: 'alerts', alert: id === null ? undefined : String(id) },
        replace: true,
      });
    },
    [navigate],
  );

  const alertsQuery = useKernelQuery(['drift', 'alerts'], ipc.listAlerts, {
    refetchInterval: POLL_MS,
    // Staleness is the whole point here, unlike everywhere else in this client.
    staleTime: 0,
  });
  const statsQuery = useKernelQuery(['drift', 'stats'], ipc.getDriftStats, {
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
  const refusalsQuery = useKernelQuery(['drift', 'refusals'], ipc.listRefusals, {
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
  const retentionQuery = useKernelQuery(['drift', 'retention'], ipc.listRetentionRuns, {
    // Backfill only: the live lane is the feed, so this does not need a poll.
    staleTime: Infinity,
  });

  /*
    Coverage polls, and for a different reason from the alerts.

    It is PUSHED by each connector into a process-lifetime store, so what this
    console holds goes stale silently — a connector that reconnects and re-reports
    changes the answer with no event to fold. The page renders "reported N ago"
    off `reported_at`, and that age is only honest if the read behind it is
    refreshed. A slower cadence than the alert poll: coverage changes when a
    daemon reconnects, not when a message arrives.
  */
  const coverageQuery = useKernelQuery(['drift', 'coverage'], ipc.getCoverage, {
    refetchInterval: COVERAGE_POLL_MS,
    staleTime: 0,
  });
  const pushQuery = useKernelQuery(['drift', 'push-status'], ipc.getPushStatus, {
    refetchInterval: COVERAGE_POLL_MS,
    staleTime: 0,
  });

  const alerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);
  const polledAt = usePolledAt(alertsQuery.dataUpdatedAt);
  const newSinceLastLook = useNewSinceLastLook(alerts);

  const [filter, setFilter] = useState<AlertFilter>('all');
  const selected = useMemo(
    () => alerts.find((a) => a.id === selectedId) ?? null,
    [alerts, selectedId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex flex-none items-center gap-1 px-5 pt-3" aria-label="Drift surfaces">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'rounded-[7px] px-3 py-1.5 text-[13px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              tab === t.id
                ? 'bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] font-medium text-[var(--fg-primary)]'
                : 'text-[var(--fg-secondary)] hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'alerts' && (
          <>
            {/*
              Only blank the feed when there is nothing to show.

              A poll that fails once must not take a good alert list off the
              screen: the data is still the last thing the lane actually said,
              and an operator mid-read losing it to a network blip is worse than
              a stale list that admits its age. When there IS data, the failure
              is carried on the poll indicator instead — which is exactly where
              an operator looks to decide whether "no new alerts" is a finding.
            */}
            {alertsQuery.isError && alerts.length === 0 ? (
              <div className="p-5">
                <ErrorState
                  reason={`The alert list could not be read: ${alertsQuery.error?.message ?? 'the record lane did not answer'}.`}
                  whatToDo="This is a read failure, not a finding. Nothing here says whether drift exists — the lane simply did not answer."
                />
              </div>
            ) : (
              <div className="flex h-full min-h-0">
                <AlertFeed
                  alerts={alerts}
                  stats={statsQuery.data}
                  filter={filter}
                  onFilter={setFilter}
                  selectedId={selectedId}
                  onSelect={setAlert}
                  onOpenLedger={() => setTab('ledger')}
                  polledAt={polledAt}
                  pollError={alertsQuery.isError ? (alertsQuery.error?.message ?? 'the lane did not answer') : null}
                  newSinceLastLook={newSinceLastLook}
                />
              </div>
            )}
            {/*
              Detail belongs in the inspector slot, not a permanent aside — it
              exists only when an alert is selected, and the main pane simply
              gets the width when nothing is.
            */}
            {selected && (
              <Inspector label={`Evidence for ${selected.record_key}`}>
                <AlertEvidence alert={selected} />
              </Inspector>
            )}
          </>
        )}

        {tab === 'ledger' &&
          (statsQuery.isError ? (
            <div className="p-5">
              <ErrorState
                reason={`The outcome tally could not be read: ${statsQuery.error?.message ?? 'the record lane did not answer'}.`}
                whatToDo="Do not read this as a clean bill of health. A tally that failed to load and a deployment with nothing wrong are different facts, which is the whole argument of this page."
              />
            </div>
          ) : statsQuery.data ? (
            <OutcomeLedger stats={statsQuery.data} refusals={refusalsQuery.data ?? []} />
          ) : null)}

        {tab === 'coverage' &&
          (coverageQuery.isError ? (
            <div className="p-5">
              <ErrorState
                reason={`Coverage could not be read: ${coverageQuery.error?.message ?? 'the record lane did not answer'}.`}
                whatToDo="Do not present this as a coverage statement. A read that failed and a deployment with nothing connected look identical from an empty page, and only one of them is safe to show a customer."
              />
            </div>
          ) : (
            <CoveragePane
              sources={coverageQuery.data}
              pushes={pushQuery.data}
              loaded={coverageQuery.isSuccess && pushQuery.isSuccess}
            />
          ))}

        {tab === 'retention' && (
          <RetentionPane
            fedRuns={projection.state?.retention_runs}
            backfilledRuns={retentionQuery.data}
            hasFeed={hasRetentionFeed}
          />
        )}
      </div>
    </div>
  );
}

function isTab(v: unknown): v is DriftTab {
  return typeof v === 'string' && TABS.some((t) => t.id === v);
}

/**
 * When the last successful poll landed, re-rendered on a slow tick so the
 * "polled N s ago" label ages honestly instead of freezing at its first value.
 */
function usePolledAt(dataUpdatedAt: number): Date | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  return dataUpdatedAt ? new Date(dataUpdatedAt) : null;
}

/**
 * How many alerts arrived since this operator last opened the feed.
 *
 * The honest substitute for unread state. Alerts have no read/handled/dismissed
 * field, and a UI-local acknowledge flag would be wrong the moment there are two
 * operators — but "since YOU last looked" is a claim about this client alone, so
 * a local high-water mark is exactly the right shape for it.
 *
 * The mark is read ONCE per mount and only advanced on unmount, so the count does
 * not reset to zero under the operator while they are reading the page.
 */
function useNewSinceLastLook(alerts: readonly Alert[]): number {
  const markRef = useRef<number | null>(null);
  if (markRef.current === null) {
    markRef.current = Number(safeGet(LAST_SEEN_KEY) ?? 0) || 0;
  }

  const highest = useMemo(() => alerts.reduce((max, a) => Math.max(max, a.id), 0), [alerts]);

  useEffect(() => {
    return () => {
      if (highest > 0) safeSet(LAST_SEEN_KEY, String(highest));
    };
  }, [highest]);

  const mark = markRef.current ?? 0;
  return alerts.filter((a) => a.id > mark).length;
}

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // A console running without storage still works; it simply cannot remember
    // where the operator got to, and reports everything as new.
  }
}
