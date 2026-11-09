import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design-system/components';
import { PluginSurface } from '@/components/PluginSurface';
import { ORG_DIRECTORY_CAPABILITY } from '@/lib/hierarchy';
import { OrgTreePane } from './OrgTreePane';
import { MappingRulesPane } from './MappingRulesPane';
import { ScimPane } from './ScimPane';
import { ReconcilePane } from './ReconcilePane';
import { ApproversPane } from './ApproversPane';

/**
 * Organisation (ADR-0142 stage 2, premium, capability `org-directory`).
 *
 * One model, whatever feeds it — SCIM push, Keycloak reconcile, sign-in claims
 * or this editor (D5/D6). Rows a directory owns are read-only here; the kernel
 * says which (`editable`). Every change needs a reason and lands in the audit
 * log. Mapping rules are previewed before they are saved, because saving
 * applies them to everyone they match.
 */
export function OrganisationConsole() {
  const [tab, setTab] = useState('people');
  return (
    <PluginSurface pluginId="org-directory" capability={ORG_DIRECTORY_CAPABILITY}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex-none px-[26px] pb-3 pt-4">
          <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">Organisation</h1>
          <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
            Units, people and managers; the rules that turn directory data into roles, groups and approval
            limits; and who approves what.
          </p>
        </header>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-[26px] w-fit">
            <TabsTrigger value="people">People &amp; units</TabsTrigger>
            <TabsTrigger value="rules">Mapping rules</TabsTrigger>
            <TabsTrigger value="approvers">Who approves what</TabsTrigger>
            <TabsTrigger value="scim">SCIM</TabsTrigger>
            <TabsTrigger value="reconcile">Directory sync</TabsTrigger>
          </TabsList>
          <TabsContent value="people" className="min-h-0 flex-1 overflow-y-auto">
            <OrgTreePane />
          </TabsContent>
          <TabsContent value="rules" className="min-h-0 flex-1 overflow-y-auto">
            <MappingRulesPane />
          </TabsContent>
          <TabsContent value="approvers" className="min-h-0 flex-1 overflow-y-auto">
            <ApproversPane />
          </TabsContent>
          <TabsContent value="scim" className="min-h-0 flex-1 overflow-y-auto">
            <ScimPane />
          </TabsContent>
          <TabsContent value="reconcile" className="min-h-0 flex-1 overflow-y-auto">
            <ReconcilePane />
          </TabsContent>
        </Tabs>
      </div>
    </PluginSurface>
  );
}
