

export const tokens = {
  bg: {
    canvas: "var(--bg-canvas)",
    surface: "var(--bg-surface)",
    elevated: "var(--bg-elevated)",
    pulse: "var(--bg-pulse)",
  },
  fg: {
    primary: "var(--fg-primary)",
    secondary: "var(--fg-secondary)",
    muted: "var(--fg-muted)",
    onAccent: "var(--fg-on-accent)",
  },
  border: {
    subtle: "var(--border-subtle)",
    strong: "var(--border-strong)",
  },
  accent: {
    bg: "var(--accent-bg)",
    fg: "var(--accent-fg)",
  },
  status: {
    ok: "var(--status-ok)",
    warn: "var(--status-warn)",
    err: "var(--status-err)",
    info: "var(--status-info)",
    pulse: "var(--status-pulse)",
    muted: "var(--status-muted)",
  },
  button: {
    primary: {
      bg: "var(--button-primary-bg)",
      bgHover: "var(--button-primary-bg-hover)",
      fg: "var(--button-primary-fg)",
      border: "var(--button-primary-border)",
    },
    secondary: {
      bg: "var(--button-secondary-bg)",
      fg: "var(--button-secondary-fg)",
      border: "var(--button-secondary-border)",
    },
    danger: {
      bg: "var(--button-danger-bg)",
      fg: "var(--button-danger-fg)",
    },
  },
  input: {
    bg: "var(--input-bg)",
    border: "var(--input-border)",
    fg: "var(--input-fg)",
    placeholder: "var(--input-placeholder)",
    borderFocus: "var(--input-border-focus)",
  },
  card: {
    bg: "var(--card-bg)",
    border: "var(--card-border)",
    fg: "var(--card-fg)",
    padding: "var(--card-padding)",
  },
  tooltip: {
    bg: "var(--tooltip-bg)",
    fg: "var(--tooltip-fg)",
  },
  dialog: {
    overlayBg: "var(--dialog-overlay-bg)",
    padding: "var(--dialog-padding)",
  },
  popover: {
    padding: "var(--popover-padding)",
  },
  focusRing: "var(--focus-ring)",
  list: {
    rowBg: "var(--list-row-bg)",
    rowBgHover: "var(--list-row-bg-hover)",
    rowBorder: "var(--list-row-border)",
    rowH: "var(--list-row-h)",
    rowPaddingX: "var(--list-row-padding-x)",
  },
  layout: {
    navRailW: "var(--nav-rail-w)",
    inspectorW: "var(--inspector-w)",
    statusStripH: "var(--status-strip-h)",
  },
  elevation: {
    1: "var(--elevation-1)",
    2: "var(--elevation-2)",
    3: "var(--elevation-3)",
  },
} as const;

export type Tokens = typeof tokens;

export const themeAttr = "data-theme" as const;
export const densityAttr = "data-density" as const;
export type Theme = "dark" | "light";
export type Density = "compact" | "default" | "spacious";
