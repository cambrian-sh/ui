import { cn } from '@/design-system/lib/utils';
import { diffBoots, type BootReport } from './bootReport';

/**
 * `13c` — the boot report.
 *
 * Read in the order the questions get asked: what CHANGED, then what is unsafe,
 * then what is running. "What is enabled" is nobody's first question.
 */
export function BootReportPane({
  report,
  previous,
  onClose,
}: {
  report: BootReport;
  previous: BootReport | null;
  onClose: () => void;
}) {
  const diffs = previous ? diffBoots(previous, report) : [];
  // Rails that are DOWN. Each is already a slog.Warn and each is invisible among
  // a hundred boot lines; a warning that scrolls away was never delivered.
  const rails = report.settings.filter(
    (s) =>
      s.state === 'disabled' &&
      /unrestricted|auto[_ ]?approve|sandbox|guard|verif/i.test(`${s.subject} ${s.detail}`),
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="type-section-title">Boot report</h2>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--fg-muted)]">
            {new Date(report.startedAt).toLocaleTimeString()} · {report.lineCount} lines ·{' '}
            {report.settings.length} settings declared
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Close
        </button>
      </div>

      <p className="text-[12px] leading-[1.55] text-[var(--fg-secondary)]">
        What the kernel decided after reading its config — which is not always what the config
        says.
      </p>

      {rails.length > 0 && (
        <section
          className="flex flex-col gap-1.5 rounded-md p-2.5 tint-wash tint-ring"
          style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
        >
          <div className="type-status text-[var(--status-err)]">
            Safety rails that are down
          </div>
          {rails.map((r) => (
            <p key={r.seq} className="text-[12px] leading-[1.5]">
              <span className="font-mono text-[var(--fg-primary)]">{r.subject}</span>{' '}
              <span className="text-[var(--fg-secondary)]">{r.detail || 'is off'}</span>
            </p>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <div className="type-label text-[var(--fg-muted)]">
          {previous
            ? `${diffs.length} ${diffs.length === 1 ? 'thing differs' : 'things differ'} from the last boot`
            : 'No previous boot recorded'}
        </div>
        {!previous ? (
          // Honest: the diff is the useful half, and its absence is a fact.
          <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
            This is the first boot this console has seen, so there is nothing to compare against
            yet. The next restart will diff against this one.
          </p>
        ) : diffs.length === 0 ? (
          <p className="text-[11.5px] text-[var(--fg-muted)]">
            Nothing changed since the last boot.
          </p>
        ) : (
          diffs.map((d) => (
            <p key={`${d.component}:${d.subject}`} className="flex items-baseline gap-2 text-[12px]">
              <span
                aria-hidden
                className={cn(
                  'w-3 flex-none text-center font-mono',
                  d.kind === 'added' && 'text-[var(--status-live)]',
                  d.kind === 'removed' && 'text-[var(--status-err)]',
                  d.kind === 'changed' && 'text-[var(--status-warn)]',
                )}
              >
                {d.kind === 'added' ? '+' : d.kind === 'removed' ? '−' : '~'}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-[var(--fg-primary)]">{d.subject}</span>{' '}
                <span className="text-[var(--fg-muted)]">
                  {d.kind === 'added' && `newly ${d.after}`}
                  {d.kind === 'removed' && `was ${d.before}, no longer declared`}
                  {d.kind === 'changed' && `was ${d.before}, now ${d.after}`}
                </span>
              </span>
            </p>
          ))
        )}
      </section>

      {report.warnings.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <div className="type-label text-[var(--fg-muted)]">
            Degraded at boot — {report.warnings.length}
          </div>
          {/* The highest-consequence lines in the sequence, each of which was a
              single warn nobody was going to read. */}
          {report.warnings.slice(0, 20).map((w) => (
            <p key={w.seq} className="text-[11.5px] leading-[1.5]">
              <span className="font-mono text-[10.5px] text-[var(--color-accent-400)]">
                {w.component}
              </span>{' '}
              <span className="text-[var(--fg-secondary)]">{w.message}</span>
            </p>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-1">
        <div className="type-label text-[var(--fg-muted)]">
          Declared settings — {report.settings.length}
        </div>
        {report.settings.map((s) => (
          <div key={s.seq} className="flex items-baseline gap-2 text-[11.5px]">
            <span
              aria-hidden
              className="size-1.5 flex-none translate-y-[3px] rounded-full"
              style={{
                background:
                  s.state === 'disabled' ? 'var(--fg-muted)' : 'var(--status-live)',
              }}
            />
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{s.component}</span>
            <span className="min-w-0 flex-1">
              <span className="text-[var(--fg-primary)]">{s.subject}</span>{' '}
              <span className="text-[var(--fg-muted)]">{s.state}</span>
              {s.detail && (
                <span className="ml-1 text-[var(--fg-muted)]">— {s.detail}</span>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
