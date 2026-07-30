import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/design-system/components';
import { NAV_SHORTCUTS, SHORTCUTS } from '@/lib/keyboard';

/**
 * The keyboard map.
 *
 * The bindings themselves are unchanged — what changed is that they stopped
 * being drawn at 10px next to every nav label, where they were heavier than the
 * labels they annotated. A shortcut is looked up once and then remembered, so
 * it belongs somewhere you can look it up: here, the ⌘K palette, and the ⇧?
 * sheet.
 */
export function KeyboardSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyboard</CardTitle>
        <CardDescription>
          Every binding in the console. Press ⇧? anywhere for the same list as an overlay.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Section title="Go to">
          {NAV_SHORTCUTS.map((s) => (
            <Row key={s.keys} keys={s.keys} label={s.label} />
          ))}
        </Section>

        <Section title="Actions">
          {SHORTCUTS.map((s) => (
            <Row key={`${s.keys}-${s.scope}`} keys={s.keys} label={s.label} scope={s.scope} />
          ))}
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {title}
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function Row({ keys, label, scope }: { keys: string; label: string; scope?: string }) {
  return (
    <li className="flex items-baseline gap-3 text-[12.5px]">
      <kbd className="min-w-[68px] rounded-sm px-1.5 py-0.5 text-center font-mono text-[11px] text-[var(--fg-primary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
        {keys}
      </kbd>
      <span className="text-[var(--fg-secondary)]">{label}</span>
      {scope && scope !== 'global' && (
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{scope}</span>
      )}
    </li>
  );
}
