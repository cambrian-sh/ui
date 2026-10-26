import { useState } from 'react';
import { ArrowUpLeft, Lock } from 'lucide-react';
import type { Alert, AlertCitation } from '@/ipc/types';
import { Badge, Button } from '@/design-system/components';
import { CitedAlertText } from './CitedAlertText';
import {
  deltaNote,
  deltaTone,
  formatDate,
  formatDelta,
  formatWhen,
  groupEvidence,
  unanchoredCitations,
} from './drift-format';

const TONE_VAR: Record<'err' | 'warn' | 'idle', string> = {
  err: 'var(--status-err)',
  warn: 'var(--status-warn)',
  idle: 'var(--fg-muted)',
};

/**
 * One alert's evidence — the argument an operator takes to a supplier.
 *
 * The order is deliberate and is the design's: **the two dates before the
 * prose**, because an operator wants the delta before the sentence. Then the
 * superseded banner if it applies, then the alert as written, then the evidence
 * cards, then the classification the alert inherited, then the actions.
 *
 * What is NOT here is as load-bearing as what is:
 *
 * - **No Resolve button.** An alert is advisory. It does not email the customer,
 *   amend the purchase order or update the CRM. A button that only flipped a
 *   local flag would read as "handled with the customer", so the panel says so
 *   explicitly rather than leaving it implied.
 * - **No acknowledge / dismiss / snooze.** Alerts have no state field, and a
 *   UI-local flag is wrong the moment there are two operators.
 * - **No click-through from `[2]`** — there is no RPC to fetch a record version
 *   by id, so the card shows `version_id` and stops.
 * - **No alert → conversation deep link.** `[1]` names the message and says, in
 *   place, that opening the thread needs a new RPC. A stated gap beats a
 *   dead-looking link.
 */
export function AlertEvidence({ alert }: { alert: Alert }) {
  const [active, setActive] = useState<number | null>(null);
  const { promise, record, history } = groupEvidence(alert.citations);
  const orphaned = unanchoredCitations(alert.text, alert.citations);
  const tone = deltaTone(alert.delta_days);

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <header className="flex items-center gap-2">
        <span className="type-label text-[var(--fg-muted)]">
          Drift
        </span>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {alert.record_key} · raised {formatWhen(alert.raised_at)}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          detected in {alert.detect_latency_ms} ms
        </span>
      </header>

      {/* 1. The two dates, before the prose. */}
      <div>
        <div className="flex overflow-hidden rounded-[10px] bg-[var(--bg-canvas)]">
          <DateCell label="Promised" value={formatDate(alert.promised)} sub={`by ${alert.speaker || '—'}`} />
          <div className="w-px flex-none bg-[var(--border-subtle)]" />
          <DateCell label="Recorded" value={formatDate(alert.recorded)} sub="system of record" />
          <div className="w-px flex-none bg-[var(--border-subtle)]" />
          <div className="w-[104px] flex-none px-3.5 py-3">
            <Kicker>Delta</Kicker>
            <div className="font-mono text-sm leading-tight" style={{ color: TONE_VAR[tone] }}>
              {formatDelta(alert.delta_days)}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
          {deltaNote(alert.delta_days)}
        </p>
      </div>

      {/*
        2. Superseded.

        Rendered from `alert.superseded`, which THIS KERNEL DOES NOT YET SEND —
        the contract carries no supersession signal on a raised alert (`kind` is
        the record family, e.g. "purchase_order"). It is wired here rather than
        omitted because the product truth is real and the field is the only
        honest way to carry it: a correction after the promise stops it being
        reconciled, but the alert already raised stays raised by design, and
        without this line an operator reads a stale alert as a bug. Absent the
        field the banner simply never renders — it is never inferred.
      */}
      {alert.superseded && (
        <Callout tone="warn" icon={<ArrowUpLeft size={14} strokeWidth={1.75} />} title="This commitment was later superseded">
          A correction after this promise stopped it being reconciled — but{' '}
          <strong className="font-medium text-[var(--fg-primary)]">the alert already raised stays raised</strong>, by
          design. Without this line you would read a stale alert as a bug.
        </Callout>
      )}

      {/* 3. The alert sentence, with markers derived from the citations. */}
      <section>
        <Kicker className="mb-2">The alert, as written</Kicker>
        <CitedAlertText
          text={alert.text}
          citations={alert.citations}
          activeIndex={active}
          onSelect={setActive}
        />
      </section>

      {/* 4. Evidence, one card per citation. */}
      <section className="flex flex-col gap-2">
        <Kicker>Evidence</Kicker>

        {promise && (
          <EvidenceCard accent="var(--accent-bg)" active={active === promise.index}>
            <CardHead index={promise.index} title="the promise" meta={formatWhen(promise.at)} tone="var(--color-accent-400)" />
            {promise.quote ? (
              <blockquote className="mb-2 pl-3 text-[13.5px] leading-[1.65] text-[var(--fg-primary)] shadow-[inset_1px_0_0_var(--border-strong)] text-pretty">
                “{promise.quote}”
              </blockquote>
            ) : (
              <p className="mb-2 text-[12px] text-[var(--fg-muted)]">
                The lane recorded no quote for this message.
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] leading-[1.5] text-[var(--fg-muted)]">
                {alert.speaker || promise.ref}
              </span>
              {/* A stated gap, not a dead link. */}
              <span className="ml-auto text-[11.5px] text-[var(--fg-muted)]">
                opening the thread needs a new RPC
              </span>
            </div>
          </EvidenceCard>
        )}

        {record && (
          <EvidenceCard accent="var(--accent-bg)" active={active === record.index}>
            <CardHead
              index={record.index}
              title="the record, as it stands"
              meta={record.version_id ? `version ${record.version_id}` : '—'}
              tone="var(--color-accent-400)"
            />
            <div className="font-mono text-[13px] leading-[1.5] text-[var(--color-accent-300)]">
              {record.ref}
            </div>
          </EvidenceCard>
        )}

        {/*
          [3..n] — every earlier distinct recorded date, with the day each was
          written. Rendered from the history array's own length, so an alert with
          one earlier date gets one row and an alert with none gets no card.

          Not collapsed into the count on purpose: "it has moved 3 times" is an
          assertion, and these dates are the argument.
        */}
        {history.length > 0 && (
          <EvidenceCard accent="var(--status-warn)" active={history.some((c) => c.index === active)}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-[var(--status-warn)]">
                {history.map((c) => `[${c.index}]`).join('')}
              </span>
              <span className="text-[12.5px] font-medium">every earlier date this record carried</span>
              {alert.slip_count >= 2 && (
                <span className="ml-auto font-mono text-[10.5px] text-[var(--status-warn)]">
                  moved {alert.slip_count}×
                </span>
              )}
            </div>
            <ul className="flex flex-col">
              {history.map((c) => (
                <li key={c.index} className="flex items-baseline gap-2.5 py-[5px]">
                  <span className="flex-none font-mono text-[12.5px] leading-[1.5] text-[var(--fg-primary)]">
                    {c.ref}
                  </span>
                  <span className="font-mono text-[11px] leading-[1.5] text-[var(--fg-muted)]">
                    written {formatWhen(c.at)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
              “It has moved {alert.slip_count} times” is an assertion.{' '}
              <strong className="font-medium text-[var(--fg-secondary)]">
                These dates, with the day each was written, are the argument
              </strong>{' '}
              — the thing you take into the conversation with the supplier.
            </p>
          </EvidenceCard>
        )}

        {/*
          The other half of the marker invariant. Evidence with no anchor in the
          sentence still renders — dropping it would hide the argument — but the
          gap is stated rather than left for the operator to notice.
        */}
        {orphaned.length > 0 && (
          <p className="text-[11.5px] leading-[1.6] text-[var(--status-warn)]" role="status">
            {orphaned.length === 1 ? 'One citation is' : `${orphaned.length} citations are`} carried on this alert
            without a marker in its sentence, so the prose does not reach{' '}
            {orphaned.length === 1 ? 'it' : 'them'}. Shown above regardless.
          </p>
        )}
      </section>

      {/* 5. Classification. */}
      <Callout tone="err" icon={<Lock size={14} strokeWidth={1.75} />} title="This alert carries the classification of what it quotes">
        {alert.tags.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {alert.tags.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-[11.5px] text-[var(--fg-muted)]">
            This alert carries no tags, which means the material behind it carried none either.
          </p>
        )}
        Inherited from both sources, so an alert is never more visible than the material behind it. Every copy, export
        and share below honours these — an alert is the artifact most likely to be forwarded, which makes it the worst
        one to leak.
      </Callout>

      {/* 6. Actions — all of them things the operator does WITH the alert. */}
      <div className="flex flex-col gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => copyEvidence(alert)}>
          Copy the evidence
        </Button>
        <Button variant="secondary" size="sm" disabled title="Opening a record by key needs a record-lane RPC that does not exist yet.">
          Open {alert.record_key} in the record lane
        </Button>
        <Button variant="ghost" size="sm" disabled title="Asking memory from here needs the alert to carry a session; that link does not exist yet.">
          Ask memory about {alert.owner || 'this counterparty'}’s history
        </Button>
      </div>

      <p className="text-[11.5px] leading-[1.65] text-[var(--fg-muted)]">
        There is no <em>Resolve</em> here on purpose. This alert notifies; it does not email{' '}
        {alert.owner || 'the counterparty'}, amend the order or touch the CRM. A button that only flipped a local flag
        would read as “handled with the customer”, and that is a lie the product cannot afford. When the backend gains a
        real state column, triage lands here.
      </p>
    </div>
  );
}

/**
 * Copy the alert as text an operator can paste into a conversation.
 *
 * The classification tags lead, and that ordering is the point: this is the
 * export path for the artifact most likely to be forwarded, so what governs its
 * handling has to arrive before the material it governs.
 */
function copyEvidence(alert: Alert) {
  const lines = [
    alert.tags.length > 0 ? `[${alert.tags.join('] [')}]` : '[unclassified]',
    '',
    alert.text,
    '',
    ...alert.citations.map(
      (c) => `[${c.index}] ${c.kind} ${c.ref}${c.quote ? ` — “${c.quote}”` : ''}${c.at ? ` (${formatWhen(c.at)})` : ''}`,
    ),
  ];
  void navigator.clipboard?.writeText(lines.join('\n'));
}

function DateCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 flex-1 px-3.5 py-3">
      <Kicker>{label}</Kicker>
      <div className="font-mono text-sm leading-tight text-[var(--fg-primary)]">{value}</div>
      <div className="mt-0.5 text-[11px] text-[var(--fg-muted)]">{sub}</div>
    </div>
  );
}

function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`font-mono text-[9.5px] uppercase leading-none tracking-[0.1em] text-[var(--fg-muted)] ${className || 'mb-1.5'}`}
    >
      {children}
    </div>
  );
}

function CardHead({ index, title, meta, tone }: { index: number; title: string; meta: string; tone: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-mono text-[11px]" style={{ color: tone }}>
        [{index}]
      </span>
      <span className="text-[12.5px] font-medium">{title}</span>
      <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">{meta}</span>
    </div>
  );
}

function EvidenceCard({
  accent,
  active,
  children,
}: {
  accent: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[10px] bg-[var(--bg-canvas)] px-3.5 py-3 transition-colors"
      style={{
        boxShadow: `inset 3px 0 0 ${accent}`,
        backgroundColor: active ? `color-mix(in srgb, ${accent} 7%, var(--bg-canvas))` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function Callout({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warn' | 'err' | 'live';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const v = `var(--status-${tone === 'live' ? 'live' : tone})`;
  return (
    <div
      className="rounded-[10px] px-3.5 py-3"
      style={{
        background: `color-mix(in srgb, ${v} 7%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${v} 28%, transparent)`,
      }}
    >
      <div className="mb-1.5 flex items-center gap-2" style={{ color: v }}>
        {icon}
        <span className="text-[12.5px] font-medium text-[var(--fg-primary)]">{title}</span>
      </div>
      <div className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">{children}</div>
    </div>
  );
}

export type { AlertCitation };
