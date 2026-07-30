import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import { relativeTime } from '@/lib/relativeTime';
import { StrangerPolicyPane } from './StrangerPolicyPane';
import type {
  BindingKind,
  IdentityBinding,
  StrangerPolicy,
  UnboundSender,
} from '@/ipc/types';

const KIND_LABEL: Record<BindingKind, string> = {
  principal: 'principal',
  group: 'group',
  room_group: 'room → group',
};

const BIND_TARGETS: { id: BindingKind; label: string; body: string; warn?: boolean }[] = [
  {
    id: 'principal',
    label: 'A principal',
    body: 'The safe default. This person gets their own reach and nobody else inherits it.',
  },
  {
    id: 'group',
    label: 'A group',
    body: "For someone who should have a team's reach rather than their own.",
  },
  {
    id: 'room_group',
    label: 'This room → a group',
    body: "Membership of that room is Telegram's to change, not yours. Anyone an admin adds inherits the group the moment they mention the bot — right for a trusted internal channel, wrong for anything wider.",
    warn: true,
  },
];

/** What to call a row. A shared entry point deliberately has no single name. */
function senderLabel(s: UnboundSender): string {
  if (s.speaker_ids.length > 1) return `${s.speaker_ids.length} people`;
  return s.display_name || s.username || s.external_id;
}

/**
 * People — who is on the other end of this bot, as a worklist and a table.
 *
 * Its own section rather than a strip inside the bot's settings, because these
 * are different jobs on different clocks: the bot's token and switch are set
 * once and left, and this list is worked through whenever somebody new appears.
 *
 * The hole it closes: **without a binding the surface is the identity.** Policy
 * links to the surface, so every sender who finds the bot has identical reach —
 * an unknown number is governed by the same rule as a named colleague, not
 * because they are different people but because neither of them is anybody.
 */
export function PeoplePane({ surface, canMutate }: { surface: string; canMutate: boolean }) {
  const [bindings, setBindings] = useState<IdentityBinding[]>([]);
  const [unbound, setUnbound] = useState<UnboundSender[]>([]);
  const [stranger, setStranger] = useState<StrangerPolicy | null>(null);
  const [absent, setAbsent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [b, u, s] = await Promise.all([
        ipc.listIdentityBindings(surface),
        ipc.listUnboundSenders(surface),
        ipc.getStrangerPolicy(surface),
      ]);
      setBindings(b);
      setUnbound(u);
      setStranger(s);
      setAbsent(null);
    } catch (e) {
      setAbsent(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [surface]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (absent) {
    return (
      <ErrorState
        reason={absent}
        whatToDo="This kernel does not serve identity bindings, so the surface is the identity here: every sender who finds this bot has the same reach."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* The state the whole section exists to end, stated when it is true. */}
      {!loading && bindings.length === 0 && (
        <p
          className="max-w-[680px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">Nobody is bound.</span>{' '}
          <span className="text-[var(--fg-secondary)]">
            Until someone is, everyone who finds this bot is governed by one rule and reaches
            exactly the same things.
          </span>
        </p>
      )}

      <UnboundQueue
        senders={unbound}
        loading={loading}
        canMutate={canMutate && !busy}
        onBind={(s, kind, target, reason) =>
          run(async () => {
            const out = await ipc.bindIdentity(
              {
                surface,
                external_id: s.external_id,
                // Labels travel with the binding: an id alone is not a person to
                // anybody reading the table later.
                username: s.username,
                display_name: s.display_name,
                bound_to_kind: kind,
                bound_to_id: target,
                bound_at_unix_ms: 0,
                username_changed_from: '',
                blocked: false,
              },
              reason,
            );
            if (!out.ok) setNotice(out.error);
          })
        }
        onBlock={(s, reason) => run(() => ipc.blockSender(surface, s.external_id, true, reason))}
      />

      <BindingTable
        bindings={bindings}
        canMutate={canMutate && !busy}
        onUnbind={(b, reason) => run(() => ipc.unbindIdentity(surface, b.external_id, reason))}
        onBlock={(b, blocked, reason) =>
          run(() => ipc.blockSender(surface, b.external_id, blocked, reason))
        }
      />

      <StrangerPolicyPane
        surface={surface}
        policy={stranger}
        canMutate={canMutate && !busy}
        onSaved={() => void reload()}
      />

      {notice && (
        <p role="status" className="text-[12px] text-[var(--status-err)]">
          {notice}
        </p>
      )}
    </div>
  );
}

function UnboundQueue({
  senders,
  loading,
  canMutate,
  onBind,
  onBlock,
}: {
  senders: UnboundSender[];
  loading: boolean;
  canMutate: boolean;
  onBind: (s: UnboundSender, kind: BindingKind, target: string, reason: string) => void;
  onBlock: (s: UnboundSender, reason: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div>
        <h3 className="text-[13.5px] font-medium">Waiting to be somebody — {senders.length}</h3>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--fg-muted)]">
          People who have messaged this bot and are not yet anybody. This is the worklist.
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-[var(--fg-muted)]">Loading…</p>
      ) : senders.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">
          Nobody unrecognised has messaged this bot.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {senders.map((s) => (
            <li key={s.external_id} className="flex flex-col gap-1.5 rounded-md bg-[var(--bg-canvas)] p-2.5">
              <div className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                <span className="font-medium">{senderLabel(s)}</span>
                {s.username && s.display_name && (
                  <span className="text-[11.5px] text-[var(--fg-secondary)]">@{s.username}</span>
                )}
                {/* The id is what a binding is actually made on, so it is shown
                    rather than hidden behind a friendly name. */}
                <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                  {s.external_id}
                </span>
                <span className="text-[11.5px] text-[var(--fg-muted)]">
                  {s.message_count} message{s.message_count === 1 ? '' : 's'} · first seen{' '}
                  {relativeTime(new Date(s.first_seen_unix_ms).toISOString())}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  disabled={!canMutate}
                  onClick={() => setOpen(open === s.external_id ? null : s.external_id)}
                >
                  {open === s.external_id ? 'Cancel' : 'Bind'}
                </Button>
              </div>

              {/* A row more than one person speaks through is a ROOM, and binding
                  it is a different decision: everyone in it inherits the target,
                  and Telegram decides who is in it. */}
              {s.speaker_ids.length > 1 && (
                <p
                  className="rounded-md p-2 text-[11.5px] leading-[1.55] tint-wash"
                  style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
                >
                  <span className="text-[var(--status-warn)]">
                    {s.speaker_ids.length} people speak through this entry point.
                  </span>{' '}
                  <span className="text-[var(--fg-secondary)]">
                    It is a room, not a person — binding it gives every one of them whatever
                    you bind it to.
                  </span>
                </p>
              )}

              {open === s.external_id && (
                <BindForm
                  shared={s.speaker_ids.length > 1}
                  onCancel={() => setOpen(null)}
                  onBind={(kind, target, reason) => {
                    onBind(s, kind, target, reason);
                    setOpen(null);
                  }}
                  onBlock={(reason) => {
                    onBlock(s, reason);
                    setOpen(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BindForm({
  shared,
  onBind,
  onBlock,
  onCancel,
}: {
  shared: boolean;
  onBind: (kind: BindingKind, target: string, reason: string) => void;
  onBlock: (reason: string) => void;
  onCancel: () => void;
}) {
  // A room is a room. Opening already pointed at "a principal" invites binding a
  // channel as a person — the one mistake this form exists to prevent.
  const [kind, setKind] = useState<BindingKind>(shared ? 'room_group' : 'principal');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const spec = BIND_TARGETS.find((t) => t.id === kind)!;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-2.5">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[11.5px] text-[var(--fg-secondary)]">Bind them to</legend>
        {BIND_TARGETS.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-[12px]">
            <input
              type="radio"
              name="bind-kind"
              checked={kind === t.id}
              onChange={() => setKind(t.id)}
            />
            <span>{t.label}</span>
          </label>
        ))}
      </fieldset>

      <p
        className={
          spec.warn
            ? 'max-w-[560px] rounded-md p-2 text-[11.5px] leading-[1.55] tint-wash text-[var(--fg-secondary)]'
            : 'max-w-[560px] text-[11.5px] leading-[1.55] text-[var(--fg-muted)]'
        }
        style={spec.warn ? ({ '--tint': 'var(--status-warn)' } as React.CSSProperties) : undefined}
      >
        {spec.body}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={kind === 'principal' ? 'afsin' : 'market-desk'}
          aria-label="Bind to"
          className="w-[200px]"
        />
        {/* Mandatory and audited: a binding grants reach, so who widened it and
            why is the question asked after something goes wrong. */}
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          aria-label="Reason"
          className="w-[240px]"
        />
        <Button size="sm" disabled={!target.trim() || !reason.trim()} onClick={() => onBind(kind, target.trim(), reason.trim())}>
          Bind
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!reason.trim()}
          onClick={() => onBlock(reason.trim())}
        >
          Block instead
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-[var(--fg-muted)]">
        Blocking drops them at the ingress — they never reach a policy or a plan.
      </p>
    </div>
  );
}

/** The bound list as an actual table: one row per person, scannable by column. */
function BindingTable({
  bindings,
  canMutate,
  onUnbind,
  onBlock,
}: {
  bindings: IdentityBinding[];
  canMutate: boolean;
  onUnbind: (b: IdentityBinding, reason: string) => void;
  onBlock: (b: IdentityBinding, blocked: boolean, reason: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div>
        <h3 className="text-[13.5px] font-medium">Bound — {bindings.length}</h3>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--fg-muted)]">
          Bound on the numeric id. The username is a label — it can change, which is why
          binding on one would be an impersonation vector rather than an identifier.
        </p>
      </div>

      {bindings.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-muted)]">Nobody is bound.</p>
      ) : (
        // Wide content scrolls inside its own container rather than pushing the
        // page sideways.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                <th className="pb-1.5 pr-3 font-normal">Person</th>
                <th className="pb-1.5 pr-3 font-normal">Id</th>
                <th className="pb-1.5 pr-3 font-normal">Reaches as</th>
                <th className="pb-1.5 pr-3 font-normal">Since</th>
                <th className="pb-1.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {bindings.map((b) => (
                <tr
                  key={b.external_id}
                  className="border-t border-[var(--border-subtle)] align-baseline"
                >
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span>{b.display_name || b.username || '—'}</span>
                      {b.username && b.display_name && (
                        <span className="text-[11px] text-[var(--fg-secondary)]">
                          @{b.username}
                        </span>
                      )}
                      {b.blocked && (
                        <span className="font-mono text-[10px] text-[var(--status-err)]">
                          blocked
                        </span>
                      )}
                    </div>
                    {/* Both a reassurance and an early warning: the binding is on
                        the id, so a rename cannot move anyone's reach. */}
                    {b.username_changed_from && (
                      <div className="mt-0.5 text-[11px] leading-[1.45] text-[var(--status-warn)]">
                        was @{b.username_changed_from} — the binding held, because it is on
                        the id
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[10.5px] text-[var(--fg-muted)]">
                    {b.external_id}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="text-[var(--color-accent-400)]">{b.bound_to_id}</span>{' '}
                    <span className="font-mono text-[10px] text-[var(--fg-muted)]">
                      {KIND_LABEL[b.bound_to_kind] ?? b.bound_to_kind}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-[11px] text-[var(--fg-muted)]">
                    {b.bound_at_unix_ms
                      ? relativeTime(new Date(b.bound_at_unix_ms).toISOString())
                      : '—'}
                  </td>
                  <td className="py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canMutate}
                      onClick={() => {
                        setOpen(open === b.external_id ? null : b.external_id);
                        setReason('');
                      }}
                    >
                      Change
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-2.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            aria-label="Reason"
            className="w-[260px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!reason.trim()}
              onClick={() => {
                const b = bindings.find((x) => x.external_id === open)!;
                onUnbind(b, reason.trim());
                setOpen(null);
              }}
            >
              Unbind
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!reason.trim()}
              onClick={() => {
                const b = bindings.find((x) => x.external_id === open)!;
                onBlock(b, !b.blocked, reason.trim());
                setOpen(null);
              }}
            >
              {bindings.find((x) => x.external_id === open)?.blocked ? 'Unblock' : 'Block'}
            </Button>
          </div>
          {/* Unbinding does not remove reach — it returns them to whatever a
              stranger gets, which may be more than they had. */}
          <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
            Unbinding does not lock them out. They become a stranger again and get whatever
            the stranger policy allows.
          </p>
        </div>
      )}
    </section>
  );
}
