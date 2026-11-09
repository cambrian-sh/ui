import type {
  Integration,
  IntegrationCatalogEntry,
  IntegrationHealth,
} from '@/ipc/types';

/**
 * Integration state, derived. The page renders from these and nothing else, so
 * the "is it working" answer has one definition.
 */

export type IntegrationStatus = 'disabled' | 'needs_setup' | 'starting' | 'ready' | 'error' | 'stopped';

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  disabled: 'Off',
  needs_setup: 'Needs setup',
  starting: 'Starting',
  ready: 'Connected',
  error: 'Error',
  stopped: 'Stopped',
};

export const STATUS_TONE: Record<IntegrationStatus, string> = {
  disabled: 'var(--status-idle)',
  needs_setup: 'var(--status-warn)',
  starting: 'var(--status-info)',
  ready: 'var(--status-live)',
  error: 'var(--status-err)',
  stopped: 'var(--status-idle)',
};

/**
 * The freshest health for a server: the feed's (pushed on every change) when it
 * is at least as new as the one the last listing carried.
 */
export function effectiveHealth(
  listed: IntegrationHealth | null | undefined,
  fed: IntegrationHealth | null | undefined,
): IntegrationHealth | null {
  if (!fed) return listed ?? null;
  if (!listed) return fed;
  return fed.changed_at_unix_ms >= listed.changed_at_unix_ms ? fed : listed;
}

export function statusOf(i: Integration, health: IntegrationHealth | null): IntegrationStatus {
  if (!i.enabled) return 'disabled';
  if (i.missing_required.length > 0) return 'needs_setup';
  switch (health?.state) {
    case 'ready':
      return 'ready';
    case 'starting':
      return 'starting';
    case 'error':
      return 'error';
    default:
      return 'stopped';
  }
}

/** What the install form must collect before Connect is allowed. */
export function missingFields(entry: IntegrationCatalogEntry, values: Record<string, string>): string[] {
  return entry.fields
    .filter((f) => f.required && !(values[f.name] ?? f.default_value ?? '').trim())
    .map((f) => f.label || f.name);
}

/** Split form values into non-secret settings and write-only secrets. Empty values are dropped. */
export function splitFieldValues(
  entry: IntegrationCatalogEntry,
  values: Record<string, string>,
): { settings: Record<string, string>; secrets: Record<string, string> } {
  const settings: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of entry.fields) {
    const v = (values[f.name] ?? (f.secret ? '' : f.default_value) ?? '').trim();
    if (!v) continue;
    if (f.secret) secrets[f.name] = v;
    else settings[f.name] = v;
  }
  return { settings, secrets };
}

/** A catalog entry already installed (and not multi-instance) is not offered again. */
export function installable(entry: IntegrationCatalogEntry, installed: readonly Integration[]): boolean {
  return entry.multi_instance || !installed.some((i) => i.catalog_id === entry.id);
}

export const EFFECT_TEXT: Record<string, string> = {
  live: 'Applied now.',
  restart_required: 'Stored. It takes effect when the kernel restarts.',
  shadowed: 'Stored, but a higher layer (an environment variable) wins over it.',
  rejected: 'Nothing changed.',
};
