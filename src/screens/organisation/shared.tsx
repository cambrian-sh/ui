import type { ReactNode } from 'react';
import { cn } from '@/design-system/lib/utils';

/** Comma-separated text ⇄ a list. */
export const toList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
export const fromList = (xs: readonly string[] | undefined): string => (xs ?? []).join(', ');

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-md p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11.5px] text-[var(--fg-secondary)]">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-[13px] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
      />
      {hint && (
        <span id={`${id}-hint`} className="text-[10.5px] text-[var(--fg-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11.5px] text-[var(--fg-secondary)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-[13px] text-[var(--input-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SourceBadge({ source, editable }: { source: string; editable: boolean }) {
  if (editable) return null;
  return (
    <span
      title="Owned by a directory: read-only here"
      className={cn('rounded-sm px-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]')}
    >
      {source || 'directory'}
    </span>
  );
}

export function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'ok'; children: ReactNode }) {
  const tint = tone === 'warn' ? 'var(--status-warn)' : tone === 'ok' ? 'var(--status-ok)' : 'var(--fg-muted)';
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className="rounded-md p-2.5 text-[12px] leading-[1.5] tint-wash tint-ring"
      style={{ '--tint': tint } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function formatTime(ms: number): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
