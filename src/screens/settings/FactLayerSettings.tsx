import type { ConfigSchema } from '@/ipc/types';

/** One property of the kernel's config JSON Schema (`SchemaJSON`, app/config_schema_source.go). */
interface SchemaProp {
  type?: string;
  title?: string;
  description?: string;
  'x-consequence'?: string;
}

const PREFIX = 'execution.facts.';

/**
 * The ADR-0136 fact layer, as the kernel reports it (config schema v4).
 *
 * Read-only on purpose: the extractor, the fact lane and supersession are wired
 * at boot and `SetRuntimeConfig` applies none of them, so the kernel lists them
 * in `kernel_only_keys`. Showing them — with the value the kernel is actually
 * running and where it came from — answers "is fact extraction on here?" without
 * a shell; changing one is a config-file edit and a restart, and this says so
 * (T-20261103-execution-facts-is-absent-from-the-operator). A kernel older than
 * schema v4 publishes no `execution.facts.*` key and the block does not render.
 */
export function FactLayerSettings({ schema }: { schema: ConfigSchema }) {
  let props: Record<string, SchemaProp> = {};
  try {
    props = (JSON.parse(schema.schema_json) as { properties?: Record<string, SchemaProp> }).properties ?? {};
  } catch {
    return null;
  }
  const keys = Object.keys(props)
    .filter((k) => k.startsWith(PREFIX))
    .sort((a, b) => {
      // switches first, then the budgets
      const ba = props[a].type === 'boolean' ? 0 : 1;
      const bb = props[b].type === 'boolean' ? 0 : 1;
      return ba - bb || a.localeCompare(b);
    });
  if (keys.length === 0) return null;

  return (
    <section
      aria-label="Fact layer"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]"
    >
      <h3 className="type-section-title">Fact layer</h3>
      <p className="text-[12px] leading-[1.55] text-[var(--fg-muted)]">
        What the kernel is running now. Read-only here: these are set in the config files and
        take effect on restart.
      </p>
      <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
        {keys.map((k) => {
          const p = props[k];
          const v = schema.current_values[k];
          const shown =
            v === undefined ? 'not reported' : p.type === 'boolean' ? (v ? 'On' : 'Off') : String(v);
          const source = schema.value_source[k] ?? 'unknown';
          return (
            <li key={k} className="flex flex-col gap-0.5 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium">{p.title ?? k}</span>
                <span aria-label={`${p.title ?? k} value`} className="font-mono text-[12px]">
                  {shown}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                  {source}
                </span>
              </div>
              {p['x-consequence'] && (
                <span className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
                  {p['x-consequence']}
                </span>
              )}
              <code className="text-[10.5px] text-[var(--fg-muted)]">{k}</code>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
