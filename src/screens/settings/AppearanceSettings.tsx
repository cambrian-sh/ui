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
import type { Density, Theme } from '@/design-system';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
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
 * Both are persisted in `shellStore` and applied as `data-theme` / `data-density`
 * on the document element, which is what the token layer keys off.
 */
export function AppearanceSettings() {
  const shell = useStore(shellStore);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Dark is the default and the design is built for it. Light mode keeps the same
          hue relationships at higher chroma so the alarm tones stay legible.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-[var(--fg-secondary)]">Theme</span>
          <ToggleGroup
            type="single"
            value={shell.theme}
            onValueChange={(v) => v && shellStore.getState().setTheme(v as Theme)}
            aria-label="Theme"
            className="self-start"
          >
            {THEMES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value}>
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-[var(--fg-secondary)]">Density</span>
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
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            {DENSITIES.find((d) => d.value === shell.density)?.hint}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
