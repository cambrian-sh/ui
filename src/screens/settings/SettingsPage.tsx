import { useState } from 'react';
import { ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { cn } from '@/design-system/lib/utils';
import { ConnectionSettings } from './ConnectionSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { KeyboardSettings } from './KeyboardSettings';
import { ProvidersSettings } from './ProvidersSettings';
import { DispatchSettings } from './DispatchSettings';
import { EmbeddingSettings } from './EmbeddingSettings';
import { IntegrationsSettings } from './IntegrationsSettings';
import { TelemetrySettings } from './TelemetrySettings';

type Section =
  | 'connection'
  | 'appearance'
  | 'keyboard'
  | 'providers'
  | 'embedding'
  | 'dispatch'
  | 'integrations'
  | 'telemetry'
  | 'storage';

interface SectionSpec {
  id: Section;
  label: string;
  /** Kernel-half sections do not exist until a connection is live. */
  kernel: boolean;
  /** Rendered as present-but-unreachable when not built yet. */
  planned?: boolean;
}

/**
 * Two halves that are not the same thing.
 *
 * *This app* — connection, appearance, keyboard — lives in the OS keychain and
 * localStorage. *This kernel* — everything else — is published as a schema and
 * changed through audited commands. Mixing them is how an operator ends up
 * unsure whether they just changed their laptop or production, so the split is
 * structural rather than a heading.
 */
const SECTIONS: SectionSpec[] = [
  { id: 'connection', label: 'Connection', kernel: false },
  { id: 'appearance', label: 'Appearance & density', kernel: false },
  { id: 'keyboard', label: 'Keyboard', kernel: false },
  { id: 'providers', label: 'Models & providers', kernel: true },
  { id: 'embedding', label: 'Embedding', kernel: true },
  { id: 'dispatch', label: 'Dispatch & retrieval', kernel: true },
  { id: 'integrations', label: 'Integrations', kernel: true },
  { id: 'telemetry', label: 'Telemetry', kernel: true },
  { id: 'storage', label: 'Storage & database', kernel: true, planned: true },
];

export function SettingsPage() {
  const projection = useStore(projectionStore);
  const [section, setSection] = useState<Section>('connection');

  const connected = projection.state?.connection.status === 'live';
  const role = projection.state?.role ?? null;
  const endpoint = projection.state?.connection.endpoint ?? null;

  const spec = SECTIONS.find((s) => s.id === section)!;
  // A config form backed by nothing is worse than no form.
  const unreachable = spec.kernel && !connected;

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Settings sections"
        className="w-[220px] flex-none overflow-y-auto bg-[var(--bg-surface)] p-2 shadow-[inset_-1px_0_0_var(--border-subtle)]"
      >
        <Group label="This app">
          {SECTIONS.filter((s) => !s.kernel).map((s) => (
            <Item
              key={s.id}
              spec={s}
              active={section === s.id}
              disabled={false}
              onSelect={() => setSection(s.id)}
            />
          ))}
        </Group>

        <Group label="This kernel">
          {SECTIONS.filter((s) => s.kernel).map((s) => (
            <Item
              key={s.id}
              spec={s}
              active={section === s.id}
              disabled={!connected}
              onSelect={() => setSection(s.id)}
            />
          ))}
          {!connected && (
            <p className="px-2.5 pt-1.5 text-[11px] leading-[1.5] text-[var(--fg-muted)]">
              Not connected — these are the kernel&rsquo;s settings, so there is nothing to
              read or write until an instance is live.
            </p>
          )}
        </Group>
      </nav>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-4 pb-10">
          {unreachable ? (
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              {spec.label} lives on the kernel. Connect an instance to read or change it.
            </p>
          ) : (
            <>
              {section === 'connection' && <ConnectionSettings />}
              {section === 'appearance' && <AppearanceSettings />}
              {section === 'keyboard' && <KeyboardSettings />}
              {section === 'providers' && <ProvidersSettings canMutate={role === 'operator'} />}
              {section === 'dispatch' && <DispatchSettings canMutate={role === 'operator'} />}
              {section === 'embedding' && <EmbeddingSettings canMutate={role === 'operator'} />}
              {section === 'telemetry' && <TelemetrySettings canMutate={role === 'operator'} />}
              {section === 'integrations' && (
                <IntegrationsSettings capabilities={projection.state?.capabilities ?? []} />
              )}
              {spec.planned && <Planned label={spec.label} />}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Every write in the kernel half is audited under this name. */}
      <footer className="pointer-events-none absolute bottom-0 right-0 p-2 text-[11px] text-[var(--fg-muted)]">
        {connected
          ? `Editing ${endpoint ?? 'this instance'} as ${role ?? 'unknown role'}`
          : 'Not connected'}
      </footer>
    </div>
  );
}

/**
 * A section that is designed but not built.
 *
 * Named rather than hidden: an operator looking for Telemetry should find out
 * that it is coming, not conclude the console cannot do it.
 */
function Planned({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <h2 className="text-[15px] font-medium">{label}</h2>
      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
        Designed, not built yet. It follows the pattern the Telegram panel already sets:
        intent and reality kept apart, write-only credentials, capability-gated presence.
      </p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-2.5 pb-[7px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--fg-muted)_35%,transparent)]">
        {label}
      </div>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Item({
  spec,
  active,
  disabled,
  onSelect,
}: {
  spec: SectionSpec;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-[var(--radius-nav)] px-2.5 py-[7px] text-left text-[13px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
          active
            ? 'bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] font-medium text-[var(--fg-primary)] shadow-[inset_2px_0_0_var(--accent-bg)]'
            : 'text-[color-mix(in_srgb,var(--fg-secondary)_72%,transparent)] hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]',
          // Present but unreachable, not hidden: an absent item reads as a
          // console that cannot do the thing.
          disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
      >
        <span className="flex-1 truncate">{spec.label}</span>
      </button>
    </li>
  );
}
