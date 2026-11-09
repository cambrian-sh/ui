import { describe, expect, it } from 'vitest';
import type { Integration, IntegrationCatalogEntry, IntegrationHealth } from '@/ipc/types';
import { effectiveHealth, installable, missingFields, splitFieldValues, statusOf } from './integrations';

const health = (state: string, at: number): IntegrationHealth => ({
  server_id: 's', state, last_handshake_unix_ms: 0, tool_count: 0, last_error: '', restart_count: 0, changed_at_unix_ms: at,
});

const integration = (o: Partial<Integration> = {}): Integration => ({
  id: 's', catalog_id: 'brave', name: 'Brave', category: 'web-search', source: 'store', overrides_file: false,
  editable: true, enabled: true, transport: 'stdio', command: 'npx', args: [], url: '', settings: {}, secrets: [],
  health: null, installed_version: '', update_available: false, missing_required: [], tool_policies: [],
  has_default_policy: false, default_policy: null, policy_summary: '', classification_tags: [], trust_tier: 'official',
  passthrough_env: [], ...o,
});

const entry: IntegrationCatalogEntry = {
  id: 'brave', name: 'Brave', description: '', category: 'web-search', publisher: '', license: '', trust_tier: 'official',
  docs_url: '', version: '1', transport: 'stdio', command: 'npx', args: [], url: '', runtimes: [], platforms: [],
  platform_supported: true,
  fields: [
    { name: 'BRAVE_API_KEY', label: 'API key', secret: true, required: true, help: '', kind: 'env', default_value: '', placeholder: '' },
    { name: 'REGION', label: 'Region', secret: false, required: true, help: '', kind: 'env', default_value: 'eu', placeholder: '' },
    { name: 'OPTIONAL', label: 'Optional', secret: false, required: false, help: '', kind: 'env', default_value: '', placeholder: '' },
  ],
  tool_policies: [], has_default_policy: true, default_policy: null, policy_summary: '', probe_tool: '', notes: '',
  source: 'builtin', multi_instance: false,
};

describe('integrations', () => {
  it('prefers the newer of listed and fed health', () => {
    expect(effectiveHealth(health('starting', 1), health('ready', 2))?.state).toBe('ready');
    expect(effectiveHealth(health('ready', 5), health('starting', 2))?.state).toBe('ready');
    expect(effectiveHealth(null, health('error', 1))?.state).toBe('error');
  });

  it('derives one status: off, needs setup, then live health', () => {
    expect(statusOf(integration({ enabled: false }), health('ready', 1))).toBe('disabled');
    expect(statusOf(integration({ missing_required: ['BRAVE_API_KEY'] }), null)).toBe('needs_setup');
    expect(statusOf(integration(), health('ready', 1))).toBe('ready');
    expect(statusOf(integration(), null)).toBe('stopped');
  });

  it('validates required fields, honouring non-secret defaults', () => {
    expect(missingFields(entry, {})).toEqual(['API key']);
    expect(missingFields(entry, { BRAVE_API_KEY: 'k' })).toEqual([]);
  });

  it('splits secrets from settings and drops empties', () => {
    expect(splitFieldValues(entry, { BRAVE_API_KEY: ' k ', OPTIONAL: '' })).toEqual({
      settings: { REGION: 'eu' },
      secrets: { BRAVE_API_KEY: 'k' },
    });
  });

  it('does not offer a single-instance entry twice', () => {
    expect(installable(entry, [integration()])).toBe(false);
    expect(installable({ ...entry, multi_instance: true }, [integration()])).toBe(true);
  });
});
