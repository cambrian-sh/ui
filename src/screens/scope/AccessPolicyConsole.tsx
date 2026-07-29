import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  EmptyState,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import { PluginSurface } from '@/components/PluginSurface';
import type { GroupSpec, IngressSpec, PolicySpec, ScopeSummary } from '@/ipc/types';
import { ScopeFilters, type ScopeFiltersState } from './ScopeFilters';
import { ScopeListRow } from './ScopeListRow';
import { ScopeDetail } from './ScopeDetail';
import { ExplainPane } from './ExplainPane';
import { PoliciesPane } from './PoliciesPane';
import { GroupsPane } from './GroupsPane';
import { RolloutPane } from './RolloutPane';
import { IngressPane } from './IngressPane';
import { ProposePane } from './ProposePane';
import { LabelsPane } from './LabelsPane';
import { useVocabulary } from './useVocabulary';

/**
 * The capability the kernel advertises when the access-policy plugin is active.
 *
 * This is the FIRST premium surface in the UI, and it establishes the pattern for
 * the rest: the kernel forwards a plugin's capability strings on the handshake
 * without interpreting them (ADR-0082 D2), and the UI renders the plugin's panel
 * only when its string is present. No probing, no error handling as flow control,
 * and an OSS kernel simply does not grow the surface.
 */
const ACCESS_POLICY_CAPABILITY = 'access-policy';
/** The plugin's manifest id, used to look up its version for skew (ADR-0089). */
const ACCESS_POLICY_PLUGIN_ID = 'authz';
/**
 * ListDocuments (contract 0070). An OSS capability, not a premium one — documents
 * belong to the store with or without the policy plugin. Gated separately so a
 * kernel that predates 0070 shows the Labels pane's search without a Browse tab
 * that would only ever return Unimplemented.
 */
const DOCUMENT_LISTING_CAPABILITY = 'document-listing';

const INITIAL_FILTERS: ScopeFiltersState = { search: '' };

function filterScopes(scopes: ScopeSummary[], filters: ScopeFiltersState): ScopeSummary[] {
  const q = filters.search.trim().toLowerCase();
  if (!q) return scopes;
  return scopes.filter((s) =>
    `${s.agent_id} ${s.effective_scope_summary}`.toLowerCase().includes(q),
  );
}

/**
 * Access Policy — who may see what, do what, and prove it afterwards.
 *
 * The screen is split by what a kernel can actually answer:
 *
 * - **Principals** and **Explain** ride the pinned OSS contract, so they work
 *   against any kernel serving `0066`. Explain is the load-bearing one: a
 *   fail-closed model turns a misconfiguration into zero results and no error,
 *   and this is the surface that turns that back into a sentence.
 * - **Policies**, **Groups** and **Rollout** are the premium plane and appear
 *   only when the plugin is on.
 */
export function AccessPolicyConsole() {
  const projection = useStore(projectionStore);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    focus?: string;
    tab?: string;
  };

  const [filters, setFilters] = useState<ScopeFiltersState>(INITIAL_FILTERS);
  const [groups, setGroups] = useState<GroupSpec[]>([]);
  const [policies, setPolicies] = useState<PolicySpec[]>([]);
  // Registered ingresses, so their surfaces are offerable as policy link targets
  // rather than typed from memory (ADR-0090).
  const [ingresses, setIngresses] = useState<IngressSpec[]>([]);

  const capabilities = projection.state?.capabilities ?? [];
  const hasPolicyPlane = capabilities.includes(ACCESS_POLICY_CAPABILITY);

  const scopeMap = projection.state?.scope ?? {};
  const scopes = useMemo(() => Object.values(scopeMap), [scopeMap]);
  const principals = useMemo(() => scopes.map((s) => s.agent_id).sort(), [scopes]);
  const role = projection.state?.role ?? null;

  const vocabulary = useVocabulary(hasPolicyPlane);

  const reloadPolicyData = useCallback(async () => {
    if (!hasPolicyPlane) return;
    try {
      const [g, p, ing] = await Promise.all([
        ipc.listGroups(),
        ipc.listPolicies(),
        ipc.listIngresses().catch(() => [] as IngressSpec[]),
      ]);
      setGroups(g);
      setPolicies(p);
      setIngresses(ing);
    } catch {
      // A kernel that advertises the capability but fails the call is a genuine
      // fault; the panes that need this data surface it themselves rather than
      // blanking the whole console.
      setGroups([]);
      setPolicies([]);
    }
  }, [hasPolicyPlane]);

  useEffect(() => {
    void reloadPolicyData();
  }, [reloadPolicyData]);

  const tab = search.tab ?? 'principals';

  const filtered = useMemo(() => filterScopes(scopes, filters), [scopes, filters]);
  const isFiltered = filters.search.trim() !== '';

  const selectedId =
    search.focus && scopes.some((s) => s.agent_id === search.focus) ? search.focus : null;

  useEffect(() => {
    if (search.focus && !scopes.some((s) => s.agent_id === search.focus)) {
      navigate({
        to: '/scope',
        search: { focus: undefined, tab },
        replace: true,
      });
    }
  }, [search.focus, scopes, navigate, tab]);

  const setTab = (next: string) => {
    navigate({
      to: '/scope',
      search: { focus: selectedId ?? undefined, tab: next },
      replace: true,
    });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2">
        <TabsList>
          <TabsTrigger value="principals">Principals</TabsTrigger>
          <TabsTrigger value="explain">Explain</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="ingress">Ingress</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="propose">Assistant</TabsTrigger>
          <TabsTrigger value="rollout">Rollout</TabsTrigger>
        </TabsList>
        {!hasPolicyPlane && (
          <span className="text-xs text-[var(--fg-muted)]">
            Unscoped kernel — every principal reads everything.
          </span>
        )}
      </div>

      <TabsContent value="principals" className="min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <ScopeFilters filters={filters} onChange={setFilters} />
          <div className="flex flex-1 overflow-hidden">
            <ScrollArea className="flex-1 border-r border-[var(--border-subtle)]">
              {filtered.length === 0 ? (
                <EmptyState
                  title={scopes.length === 0 ? 'No principals' : 'No principals match the filters'}
                  body={
                    scopes.length === 0
                      ? 'Principals appear here when agents are registered.'
                      : 'Adjust or reset the filters to see more.'
                  }
                  action={
                    scopes.length > 0 && isFiltered
                      ? {
                          label: 'Clear filters',
                          onClick: () => setFilters(INITIAL_FILTERS),
                        }
                      : undefined
                  }
                />
              ) : (
                <ul
                  role="list"
                  aria-label="Principals"
                  className="divide-y divide-[var(--border-subtle)]"
                >
                  {filtered.map((s) => (
                    <li key={s.agent_id}>
                      <ScopeListRow
                        scope={s}
                        selected={s.agent_id === selectedId}
                        onClick={() =>
                          navigate({
                            to: '/scope',
                            search: { focus: s.agent_id, tab },
                            replace: true,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>

            <aside
              aria-label="Principal detail"
              className="w-[var(--right-inspector-w,360px)] shrink-0 overflow-hidden"
            >
              {selectedId ? (
                <ScopeDetail agentId={selectedId} role={role} />
              ) : (
                <Card className="m-4">
                  <CardContent className="pt-6">
                    <EmptyState
                      title="Select a principal"
                      body="Pick one to see the boundary it carries, what it may write, and how that changed."
                    />
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="explain" className="min-h-0 flex-1">
        <ExplainPane
          vocabulary={vocabulary}
          principals={principals}
          hasPolicyPlane={hasPolicyPlane}
        />
      </TabsContent>

      {/* ADR-0089: the premium tabs render inside PluginSurface, so plugin version
          skew is reported by construction rather than by each pane remembering to
          check. The absent state keeps the copy this console already had. */}
      <TabsContent value="policies" className="min-h-0 flex-1">
        <PluginSurface
          pluginId={ACCESS_POLICY_PLUGIN_ID}
          capability={ACCESS_POLICY_CAPABILITY}
          absent={<PluginOff subject="Policy objects" />}
        >
          <PoliciesPane
            vocabulary={vocabulary}
            groups={groups}
            principals={principals}
            ingresses={ingresses}
            onChanged={() => void reloadPolicyData()}
          />
        </PluginSurface>
      </TabsContent>

      <TabsContent value="groups" className="min-h-0 flex-1">
        <PluginSurface
          pluginId={ACCESS_POLICY_PLUGIN_ID}
          capability={ACCESS_POLICY_CAPABILITY}
          absent={<PluginOff subject="Groups" />}
        >
          <GroupsPane
            groups={groups}
            principals={principals}
            onChanged={() => void reloadPolicyData()}
          />
        </PluginSurface>
      </TabsContent>

      <TabsContent value="ingress" className="min-h-0 flex-1">
        <PluginSurface
          pluginId={ACCESS_POLICY_PLUGIN_ID}
          capability={ACCESS_POLICY_CAPABILITY}
          absent={<PluginOff subject="Ingress registry" />}
        >
          <IngressPane role={role} />
        </PluginSurface>
      </TabsContent>

      <TabsContent value="labels" className="min-h-0 flex-1">
        <LabelsPane
          vocabulary={vocabulary}
          role={role}
          canBrowse={capabilities.includes(DOCUMENT_LISTING_CAPABILITY)}
        />
      </TabsContent>

      <TabsContent value="propose" className="min-h-0 flex-1">
        <PluginSurface
          pluginId={ACCESS_POLICY_PLUGIN_ID}
          capability={ACCESS_POLICY_CAPABILITY}
          absent={<PluginOff subject="Policy drafting" />}
        >
          <ProposePane role={role} onChanged={() => void reloadPolicyData()} />
        </PluginSurface>
      </TabsContent>

      <TabsContent value="rollout" className="min-h-0 flex-1">
        <PluginSurface
          pluginId={ACCESS_POLICY_PLUGIN_ID}
          capability={ACCESS_POLICY_CAPABILITY}
          absent={<PluginOff subject="Rollout" />}
        >
          <RolloutPane policies={policies} onChanged={() => void reloadPolicyData()} />
        </PluginSurface>
      </TabsContent>
    </Tabs>
  );
}

/**
 * What an operator sees when the plugin is not installed.
 *
 * It says what the deployment IS rather than what is missing: an OSS kernel is
 * not a broken premium kernel, it is a correct single-tenant one. Naming that is
 * the difference between an empty state that informs and one that nags.
 */
function PluginOff({ subject }: { subject: string }) {
  return (
    <div className="p-4">
      <EmptyState
        title={`${subject} need the access-policy plugin`}
        body="This kernel does not advertise the access-policy capability, so it is running unscoped: every registered principal reads everything, which is the correct and only behaviour for a single-tenant open-source deployment. Install the plugin to author groups, policies, and links."
      />
    </div>
  );
}
