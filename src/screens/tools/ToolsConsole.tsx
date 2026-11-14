import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import type { ToolSummary } from '@/ipc/types';
import { ToolFilters, type ToolFiltersState } from './ToolFilters';
import { ToolListRow } from './ToolListRow';
import { EffectDeclarationBanner } from './EffectDeclarationBanner';
import { ToolDetail } from './ToolDetail';

const INITIAL_TOOL_FILTERS: ToolFiltersState = {
  dangerOnly: false,
  search: '',
};

function filterTools(tools: ToolSummary[], filters: ToolFiltersState): ToolSummary[] {
  const q = filters.search.trim().toLowerCase();
  return tools.filter((t) => {
    if (filters.dangerOnly && !t.danger) return false;
    if (q) {
      const hay = `${t.id} ${t.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Runtime › Tools.
 *
 * This screen used to carry a second, read-only "Skills" tab built on the lossy
 * `ListSkills` summary (a fabricated `loaded_in_count` of 0, an empty
 * `last_loaded_at`) beside the real /skills screen. One surface per question:
 * skills live on /skills, and an old `/tools?tab=skills` link is redirected there
 * by the route (T-20261106-runtime-tools-skills-tab-still-shows-the-old).
 */
export function ToolsConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };

  const [toolFilters, setToolFilters] = useState<ToolFiltersState>(INITIAL_TOOL_FILTERS);

  const tools = projection.state?.tools ?? [];
  const role = projection.state?.role ?? null;

  const filteredTools = useMemo(() => filterTools(tools, toolFilters), [tools, toolFilters]);
  const isToolFiltered = toolFilters.dangerOnly || toolFilters.search.trim() !== '';

  const selectedToolId =
    search.focus && tools.some((t) => t.id === search.focus) ? search.focus : null;

  useEffect(() => {
    if (search.focus && !tools.some((t) => t.id === search.focus)) {
      navigate({ to: '/tools', search: { focus: undefined }, replace: true });
    }
  }, [search.focus, tools]);

  useEffect(() => {
    ipc.listTools().catch(() => {});
  }, []);

  const handleSelectTool = (toolId: string) => {
    navigate({ to: '/tools', search: { focus: toolId }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <p className="mx-4 mt-2 text-[12px] text-[var(--fg-muted)]">
        Skills, their versions and grants are on{' '}
        <Link to="/skills" className="text-[var(--accent-fg)] underline-offset-2 hover:underline">
          Skills
        </Link>
        .
      </p>
      <EffectDeclarationBanner tools={tools} />
      <ToolFilters filters={toolFilters} onChange={setToolFilters} />

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
          {filteredTools.length === 0 ? (
            <EmptyState
              title={tools.length === 0 ? 'No tools registered' : 'No tools match the filters'}
              body={
                tools.length === 0
                  ? 'Tools will appear here when registered by the kernel.'
                  : 'Adjust or reset the filters to see more tools.'
              }
              action={
                tools.length > 0 && isToolFiltered
                  ? { label: 'Clear filters', onClick: () => setToolFilters(INITIAL_TOOL_FILTERS) }
                  : undefined
              }
            />
          ) : (
            <ul role="list" aria-label="Tools" className="divide-y divide-[var(--border-subtle)]">
              {filteredTools.map((t) => (
                <li key={t.id}>
                  <ToolListRow
                    tool={t}
                    selected={t.id === selectedToolId}
                    onClick={() => handleSelectTool(t.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <aside
          aria-label="Tool detail"
          className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
        >
          {selectedToolId ? (
            <ToolDetail toolId={selectedToolId} role={role} />
          ) : (
            <Card className="m-4">
              <CardContent className="pt-6">
                <EmptyState
                  title="Select a tool"
                  body="Pick a tool from the list to see its schema, grants, and actions."
                />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
