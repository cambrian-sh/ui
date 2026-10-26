import { Link } from '@tanstack/react-router';
import type { LogAttr, LogRecord } from '@/ipc/types';

/**
 * Where an attribute resolves to, if anywhere.
 *
 * This is the idea the screen is built on: `session`, `agent_id`, `plan_id`,
 * `generator` all name things this console already has screens for, so reading a
 * warning and then hand-hunting for the plan it belongs to is friction that has
 * no reason to exist. An attribute that resolves is a link; one that does not
 * renders plainly rather than pretending.
 */
function linkFor(a: LogAttr): { to: string; search?: Record<string, unknown> } | null {
  switch (a.key) {
    case 'session':
    case 'session_id':
      return { to: '/tasks', search: { focus: a.value } };
    case 'plan_id':
      return { to: '/plans', search: {} };
    case 'agent_id':
    case 'agent':
      return { to: '/agents', search: { focus: a.value } };
    case 'generator':
    case 'model':
      return { to: '/settings', search: {} };
    case 'surface':
      return { to: '/scope', search: { focus: undefined, tab: 'surfaces' } };
    case 'watch_id':
      return { to: '/watch', search: {} };
    case 'conversation':
    case 'conversation_id':
      return { to: '/chat', search: {} };
    default:
      return null;
  }
}

/**
 * One record, in full (`13a` §3.5).
 *
 * The attribute table is the payoff: three of these are usually links, and that
 * is the difference between reading a log and following a thread.
 */
export function LogRecordInspector({
  record,
  onFilterComponent,
  onFilterAttr,
}: {
  record: LogRecord;
  onFilterComponent: (component: string) => void;
  onFilterAttr: (key: string, value: string) => void;
}) {
  const at = new Date(record.at_unix_ms);
  const linked = record.attrs.filter((a) => linkFor(a) !== null).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="type-label"
          style={{
            color:
              record.level === 'error'
                ? 'var(--status-err)'
                : record.level === 'warn'
                  ? 'var(--status-warn)'
                  : 'var(--fg-secondary)',
          }}
        >
          {record.level}
        </span>
        {/* Milliseconds, because ordering three records in one second is exactly
            the question this pane gets opened for. */}
        <span className="font-mono text-[11.5px] tabular-nums text-[var(--fg-muted)]">
          {at.toLocaleTimeString()}.{String(at.getMilliseconds()).padStart(3, '0')}
        </span>
        <span className="font-mono text-[11px] text-[var(--color-accent-400)]">
          {record.component}
        </span>
      </div>

      <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
        {record.message}
      </p>

      {record.truncated && (
        <p className="text-[11px] text-[var(--status-warn)]">
          This record was clipped to keep the kernel's window bounded — what is shown is not the
          whole value.
        </p>
      )}

      {record.attrs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="type-label text-[var(--fg-muted)]">
            Attributes — {record.attrs.length}
          </div>
          <dl className="flex flex-col gap-1">
            {record.attrs.map((a) => {
              const target = linkFor(a);
              return (
                <div key={a.key} className="flex items-baseline gap-2 text-[11.5px]">
                  <dt
                    className="flex-none truncate font-mono text-[10.5px] text-[var(--fg-muted)]"
                    style={{ width: 82 }}
                  >
                    {a.key}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words font-mono">
                    {target ? (
                      <Link
                        to={target.to}
                        search={target.search as never}
                        className="text-[var(--color-accent-400)] underline underline-offset-2"
                      >
                        {a.value}
                      </Link>
                    ) : (
                      <span className="text-[var(--fg-secondary)]">{a.value}</span>
                    )}
                    {/* The type is kept so a number can be compared as one. */}
                    {a.kind !== 'string' && (
                      <span className="ml-1.5 text-[10px] text-[var(--fg-muted)]">{a.kind}</span>
                    )}
                  </dd>
                  <button
                    type="button"
                    onClick={() => onFilterAttr(a.key, a.value)}
                    className="flex-none text-[10.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  >
                    filter
                  </button>
                </div>
              );
            })}
          </dl>
          {linked > 0 && (
            <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
              {linked} of these are links, because they name things this console already has
              screens for. That is the difference between reading a log and following a thread.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          type="button"
          onClick={() => onFilterComponent(record.component)}
          className="rounded-sm border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)]"
        >
          Show only {record.component}
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(record, null, 2))}
          className="rounded-sm border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)]"
        >
          Copy as JSON
        </button>
      </div>

      <p className="font-mono text-[10px] text-[var(--fg-muted)]">
        seq {record.seq} · boot {record.boot_id.slice(0, 8)}
      </p>
    </div>
  );
}
