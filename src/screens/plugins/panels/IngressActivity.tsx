import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { relativeTime } from '@/lib/relativeTime';
import type { IngressActivity as Activity } from '@/ipc/types';

const OUTCOME: Record<Activity['outcome'], { label: string; tone: string; note?: string }> = {
  answered: { label: 'answered', tone: 'var(--status-live)' },
  // The outcome the decision-journal source could never surface: a turn that
  // produced nothing leaves the person's message as the last word, and silence
  // is what an operator most needs to see.
  no_reply: {
    label: 'no reply',
    tone: 'var(--status-err)',
    note: 'they were left without an answer',
  },
  policy_denied: {
    label: 'policy denied',
    tone: 'var(--status-warn)',
    note: 'a denial is the policy working',
  },
  // The rollout signal, and invisible everywhere else: a report-only policy that
  // decided against this request but was not enforcing, so it went through.
  would_have_denied: {
    label: 'would have denied',
    tone: 'var(--color-accent-400)',
    note: 'report-only — this one went through',
  },
  blocked: { label: 'blocked', tone: 'var(--status-idle)', note: 'dropped at the ingress' },
};

/**
 * Who came through, and what happened to them (`10b` §5).
 *
 * Turning an ingress on and off blind is the experience this replaces: the
 * toggle says whether the bridge is running and nothing says whether anyone used
 * it or what policy did to them.
 *
 * A denial is called out as **the policy working** rather than as an error,
 * because a list of red rows trains an operator to loosen a boundary that is
 * doing its job.
 */
export function IngressActivity({ surface }: { surface: string }) {
  const activity = useKernelQuery(
    ['ingress-activity', surface],
    () => ipc.listIngressActivity(surface, 20),
    { retry: 0 },
  );

  const page = activity.data;
  const rows = page?.activity ?? [];

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
      <div className="type-label text-[var(--fg-muted)]">
        Recent inbound
      </div>

      {activity.error ? (
        <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
          This kernel does not report ingress activity, so who has come through this bridge —
          and what policy did to them — is not visible here.
        </p>
      ) : activity.isLoading ? (
        <p className="text-[11.5px] text-[var(--fg-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        // NOT "nobody has messaged". The decision journal is held in memory and
        // starts empty on every kernel restart, so an empty list is equally
        // consistent with a busy bridge and a kernel that came up a minute ago —
        // and claiming the first would be stating something the console cannot
        // know.
        <p className="text-[11.5px] text-[var(--fg-muted)]">
          Nobody has messaged through this bridge.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {rows.map((a, i) => {
              const o = OUTCOME[a.outcome] ?? {
                // An outcome this console does not know is shown verbatim rather
                // than dropped: the kernel is newer, and guessing which bucket it
                // belongs in is how a denial gets rendered as a success.
                label: a.outcome,
                tone: 'var(--fg-muted)',
              };
              return (
                <li key={`${a.principal}-${a.at_unix_ms}-${i}`} className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-2 text-[11.5px]">
                    <span className="font-mono text-[var(--fg-primary)]">
                      {a.external_id || a.principal}
                    </span>
                    {/* What they SAID, when the deployment records bodies —
                        otherwise the resource a decision was made about. */}
                    <span className="min-w-0 flex-1 truncate text-[var(--fg-secondary)]">
                      {a.text || (
                        <span className="font-mono text-[10.5px]">{a.resource}</span>
                      )}
                    </span>
                    {a.message_count > 1 && (
                      <span className="text-[10.5px] text-[var(--fg-muted)]">
                        {a.message_count} messages
                      </span>
                    )}
                    <span className="font-mono text-[10px]" style={{ color: o.tone }}>
                      {o.label}
                    </span>
                    <span className="text-[10.5px] text-[var(--fg-muted)]">
                      {relativeTime(new Date(a.at_unix_ms).toISOString())}
                    </span>
                  </span>
                  {(a.reason || o.note) && (
                    <span className="text-[10.5px] text-[var(--fg-muted)]">
                      {a.reason || o.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The column that is NOT here, named. This deployment journals access
              decisions, not request bodies — so saying nothing would leave the
              list reading as "they asked nothing". */}
          {page && !page.request_text_available && (
            <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
              What each person asked is not recorded here — these rows come from the
              access-decision journal, which records decisions rather than requests.
            </p>
          )}
        </>
      )}
    </section>
  );
}
