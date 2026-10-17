import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@/design-system/components';
import { shellStore } from '@/store/shell';
import { useStore } from '@/store/useStore';
import type { Density, ThemePreference } from '@/design-system';

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'follows your operating system' },
  { value: 'light', label: 'Light', hint: 'neutral and bright' },
  { value: 'dark', label: 'Dark', hint: 'neutral charcoal' },
  { value: 'nocturne', label: 'Nocturne', hint: 'the original lavender night palette' },
];

const DENSITIES: { value: Density; label: string; hint: string }[] = [
  { value: 'compact', label: 'Compact', hint: 'the most rows on screen' },
  { value: 'default', label: 'Default', hint: 'a middle setting' },
  { value: 'spacious', label: 'Spacious', hint: 'easiest to hit with a pointer' },
];

/**
 * Theme and density.
 *
 * These used to live at the bottom of the nav rail, where they sat at the same
 * visual weight as navigation and were reachable from every screen — a lot of
 * permanent chrome for two settings that are changed roughly once. They belong
 * with the rest of the preferences.
 *
 * Both are kept in `shellStore`, saved to local storage, and applied as
 * `data-theme` / `data-density` on the document element, which is what the
 * token layer keys off.
 */
export function AppearanceSettings() {
  const shell = useStore(shellStore);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          How Cambrian Studio looks on this computer. Saved here, not on the kernel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--fg-primary)]">Theme</span>
          <ToggleGroup
            type="single"
            value={shell.themePreference}
            onValueChange={(v) => v && shellStore.getState().setTheme(v as ThemePreference)}
            aria-label="Theme"
            className="self-start"
          >
            {THEMES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value}>
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-[var(--fg-muted)]">
            {THEMES.find((t) => t.value === shell.themePreference)?.hint}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--fg-primary)]">Density</span>
          <ToggleGroup
            type="single"
            value={shell.density}
            onValueChange={(v) => v && shellStore.getState().setDensity(v as Density)}
            aria-label="Density"
            className="self-start"
          >
            {DENSITIES.map((d) => (
              <ToggleGroupItem key={d.value} value={d.value} aria-label={d.label}>
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-[var(--fg-muted)]">
            {DENSITIES.find((d) => d.value === shell.density)?.hint}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
