import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  EmptyState,
  ScrollArea,
} from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { ToolSummary, SkillSummary } from '@/ipc/types';
import { ToolFilters, type ToolFiltersState } from './ToolFilters';
import { SkillFilters, type SkillFiltersState } from './SkillFilters';
import { ToolListRow } from './ToolListRow';
import { SkillListRow } from './SkillListRow';
import { ToolDetail } from './ToolDetail';
import { SkillDetail } from './SkillDetail';

const INITIAL_TOOL_FILTERS: ToolFiltersState = {
  dangerOnly: false,
  search: '',
};

const INITIAL_SKILL_FILTERS: SkillFiltersState = {
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

function filterSkills(skills: SkillSummary[], filters: SkillFiltersState): SkillSummary[] {
  const q = filters.search.trim().toLowerCase();
  return skills.filter((s) => {
    if (q) {
      const hay = `${s.id} ${s.description} ${s.scope_tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function ToolsSkillsConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string; tab?: 'tools' | 'skills' };
  
  const [toolFilters, setToolFilters] = useState<ToolFiltersState>(INITIAL_TOOL_FILTERS);
  const [skillFilters, setSkillFilters] = useState<SkillFiltersState>(INITIAL_SKILL_FILTERS);

  const tools = projection.state?.tools ?? [];
  const skills = projection.state?.skills ?? [];
  const role = projection.state?.role ?? null;

  const filteredTools = useMemo(() => filterTools(tools, toolFilters), [tools, toolFilters]);
  const filteredSkills = useMemo(() => filterSkills(skills, skillFilters), [skills, skillFilters]);

  const activeTab = search.tab === 'skills' ? 'skills' : 'tools';

  const selectedToolId =
    activeTab === 'tools' && search.focus && tools.some((t) => t.id === search.focus)
      ? search.focus
      : null;

  const selectedSkillId =
    activeTab === 'skills' && search.focus && skills.some((s) => s.id === search.focus)
      ? search.focus
      : null;

  useEffect(() => {
    const inList = activeTab === 'tools'
      ? tools.some((t) => t.id === search.focus)
      : skills.some((s) => s.id === search.focus);
    if (search.focus && !inList) {
      navigate({ to: '/tools', search: { tab: activeTab, focus: undefined }, replace: true });
    }
  }, [search.focus, activeTab, tools, skills]);

  const handleTabChange = (v: string) => {
    navigate({ to: '/tools', search: { tab: v as 'tools' | 'skills', focus: undefined }, replace: true });
  };

  const handleSelectTool = (toolId: string) => {
    navigate({ to: '/tools', search: { focus: toolId, tab: 'tools' }, replace: true });
  };

  const handleSelectSkill = (skillId: string) => {
    navigate({ to: '/tools', search: { focus: skillId, tab: 'skills' }, replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>

        <TabsContent value="tools" className="flex flex-1 flex-col overflow-hidden focus-visible:outline-none">
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
        </TabsContent>

        <TabsContent value="skills" className="flex flex-1 flex-col overflow-hidden focus-visible:outline-none">
          <SkillFilters filters={skillFilters} onChange={setSkillFilters} />

          <div className="flex flex-1 overflow-hidden">
            <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
              {filteredSkills.length === 0 ? (
                <EmptyState
                  title={skills.length === 0 ? 'No skills registered' : 'No skills match the filters'}
                  body={
                    skills.length === 0
                      ? 'Skills will appear here when registered by the kernel.'
                      : 'Adjust or reset the filters to see more skills.'
                  }
                />
              ) : (
                <ul role="list" aria-label="Skills" className="divide-y divide-[var(--border-subtle)]">
                  {filteredSkills.map((s) => (
                    <li key={s.id}>
                      <SkillListRow
                        skill={s}
                        selected={s.id === selectedSkillId}
                        onClick={() => handleSelectSkill(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>

            <aside
              aria-label="Skill detail"
              className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
            >
              {selectedSkillId ? (
                <SkillDetail skillId={selectedSkillId} role={role} />
              ) : (
                <Card className="m-4">
                  <CardContent className="pt-6">
                    <EmptyState
                      title="Select a skill"
                      body="Pick a skill from the list to see its documentation, bundled grants, and actions."
                    />
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
