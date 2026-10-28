// The Knowledge console (ADR-0118) — asking, exploring and auditing the
// knowledge substrate.
//
// Three surfaces over one plane:
//   Ask — the natural-language box. The model compiles the question into the
//     closed AST (and the compiled query is always shown); the store answers
//     exactly or refuses. There is deliberately NO structured query builder —
//     curated drill-ins (entity cards, contradictions, receipts) cover the
//     structured shapes without asking an operator to think in ASTs.
//   Explore — the holdings overview per source surface, the entity browser,
//     and the co-participation graph.
//   Contradictions — the standing disagreement list, returned not resolved.
//
// This is a FULL-VISIBILITY surface: operator reads see everything, including
// classified material, by design (ADR-0118 v1). Agent reads elsewhere are
// scope-filtered; nothing on this page reflects what any agent can see.
//
// PRD: story 54 (Knowledge console: ask, explore, audit the substrate).

import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PluginSurface } from '@/components/PluginSurface';
import { Inspector } from '@/components/InspectorSlot';
import { ErrorState, PageHeader } from '@/design-system/components';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { ipc } from '@/ipc';
import { cn } from '@/design-system/lib/utils';
import { AskPane } from './AskPane';
import { ExplorePane } from './ExplorePane';
import { ContradictionsPane } from './ContradictionsPane';
import { OverviewStrip } from './OverviewStrip';
import { ReceiptInspector } from './ReceiptInspector';

/** Reported by the substrate plugin only after Build finds Postgres. */
const SUBSTRATE_QUERY = 'substrate-query';

const TABS = [
  { id: 'ask', label: 'Ask' },
  { id: 'explore', label: 'Explore' },
  { id: 'contradictions', label: 'Contradictions' },
] as const;

export type KnowledgeTab = (typeof TABS)[number]['id'];

export function KnowledgeConsole() {
  return (
    /*
      PluginSurface owns the honest absent state and plugin-version skew by
      construction. A kernel without the substrate plugin (or without
      Postgres) is a correct deployment, not a broken one.
    */
    <PluginSurface pluginId="substrate" capability={SUBSTRATE_QUERY}>
      <KnowledgeSurfaces />
    </PluginSurface>
  );
}

function KnowledgeSurfaces() {
  const search = useSearch({ strict: false }) as {
    tab?: string;
    entity?: string;
    receipt?: string;
  };
  const navigate = useNavigate();

  const tab: KnowledgeTab = isTab(search.tab) ? search.tab : 'ask';
  const selectedEntity = search.entity ?? null;
  const receiptId = search.receipt ?? null;

  const setSearchParams = useCallback(
    (next: { tab?: KnowledgeTab; entity?: string | null; receipt?: string | null }) => {
      void navigate({
        to: '/knowledge',
        search: {
          tab: next.tab ?? tab,
          entity: next.entity === null ? undefined : (next.entity ?? search.entity),
          receipt: next.receipt === null ? undefined : (next.receipt ?? search.receipt),
        },
        replace: true,
      });
    },
    [navigate, tab, search.entity, search.receipt],
  );

  // The holdings header is the page's status line. One read on navigation —
  // nothing substrate-shaped is on the operator feed, and this page does not
  // poll: holdings change on ingest cadence, not on a 15s clock.
  const overviewQuery = useKernelQuery(['knowledge', 'overview'], () => ipc.knowledgeOverview(), {
    staleTime: 60_000,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Knowledge"
        description="Typed facts drawn from your connected sources. Questions are answered exactly from them, or refused; disagreements between sources are shown, never resolved away."
        className="pb-3"
      >
        {overviewQuery.data ? (
          <OverviewStrip overview={overviewQuery.data} />
        ) : overviewQuery.isError ? (
          <ErrorState
            reason={`Holdings could not be read: ${overviewQuery.error?.message ?? 'the substrate lane did not answer'}.`}
            whatToDo="A read failure, not an empty store. Ask and Explore may still answer."
          />
        ) : null}
      </PageHeader>

      <nav
        className="flex flex-none items-center gap-5 border-b border-[var(--border-subtle)] px-[var(--page-gutter)]"
        aria-label="Knowledge surfaces"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSearchParams({ tab: t.id, entity: null, receipt: null })}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 py-2.5 text-[13px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              tab === t.id
                ? 'border-[var(--button-primary-bg)] text-[var(--fg-primary)]'
                : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'ask' && (
          <AskPane onOpenReceipt={(id) => setSearchParams({ receipt: id })} />
        )}
        {tab === 'explore' && (
          <ExplorePane
            selectedEntity={selectedEntity}
            onSelectEntity={(id) => setSearchParams({ entity: id, receipt: null })}
            onOpenReceipt={(id) => setSearchParams({ receipt: id })}
          />
        )}
        {tab === 'contradictions' && (
          <ContradictionsPane kinds={overviewQuery.data?.kinds ?? []} />
        )}
      </div>

      {/*
        The receipt belongs in the inspector slot, not a permanent aside — it
        exists only while a receipt is open, and the main pane gets the width
        back when none is.
      */}
      {receiptId && (
        <Inspector label={`Evidence receipt ${receiptId}`}>
          <ReceiptInspector evidenceId={receiptId} />
        </Inspector>
      )}
    </div>
  );
}

function isTab(v: unknown): v is KnowledgeTab {
  return typeof v === 'string' && TABS.some((t) => t.id === v);
}
