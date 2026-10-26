import { useEffect, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import type { StrangerPolicy, StrangerPolicyMode } from '@/ipc/types';

const MODES: {
  id: StrangerPolicyMode;
  label: string;
  body: string;
  /** What actually happens to a message from someone unknown, in one line. */
  effect: string;
}[] = [
  {
    id: 'surface_default',
    label: 'Whatever the surface allows',
    body: "Today's behaviour, and worth naming rather than treating as neutral: it is the state where two different people are governed by one rule, because neither of them is anybody.",
    effect: 'They are answered, with whatever reach the surface policy grants.',
  },
  {
    id: 'guest_principal',
    label: 'A named guest principal',
    body: 'Strangers all resolve to one principal, so they become a thing you can write policy about instead of an absence you cannot address.',
    effect: 'They are answered as the guest principal, and you can write policy for it.',
  },
  {
    id: 'refuse_until_bound',
    label: 'Refuse until an operator adds them',
    body: 'It replies once saying an operator has to add them. It never silently ignores — silence is indistinguishable from a broken bot, so the person retries instead of asking to be added.',
    effect: 'They get one reply telling them to ask an operator, and nothing else.',
  },
];

/**
 * What a person you have never heard of gets (`11` §B.4).
 *
 * Two things this screen previously got wrong, both of which made it unreadable:
 *
 *  1. **Nothing said which mode was live.** A row of equal-looking tabs with one
 *     highlighted reads as a filter, not as a setting — an operator could not
 *     tell the current state from the one they were hovering over.
 *  2. **Clicking a mode looked like applying it.** It never was: selection is a
 *     draft until Save, and a control that looks applied but is not is worse
 *     than one that is slow, because the operator walks away believing the
 *     boundary changed.
 *
 * So: the live mode is labelled IN EFFECT NOW, a selection that differs is
 * labelled as not yet applied, and the consequence of each choice is stated as
 * what happens to a message rather than as a description of the setting.
 */
export function StrangerPolicyPane({
  surface,
  policy,
  canMutate,
  onSaved,
}: {
  surface: string;
  policy: StrangerPolicy | null;
  canMutate: boolean;
  onSaved: () => void;
}) {
  const live = policy?.mode ?? 'surface_default';
  const [selected, setSelected] = useState<StrangerPolicyMode>(live);
  const [guest, setGuest] = useState(policy?.guest_principal_id ?? '');
  const [reason, setReason] = useState('');
  // A REJECTION is not a transport failure — the kernel refuses a mode it cannot
  // honour — so it belongs next to the control, not in an error banner.
  const [rejected, setRejected] = useState('');

  useEffect(() => {
    setSelected(live);
    setGuest(policy?.guest_principal_id ?? '');
  }, [live, policy?.guest_principal_id]);

  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState('');

  const dirty = selected !== live || guest !== (policy?.guest_principal_id ?? '');
  // -1 is the kernel saying it could not compute the reach. It must read as
  // UNKNOWN: rendering 0 would say a stranger reaches nothing, which is the
  // opposite of not knowing.
  const readable = policy == null || policy.readable_documents < 0 ? null : policy.readable_documents;

  const save = async () => {
    setSaving(true);
    setFailed('');
    try {
      const out = await ipc.setStrangerPolicy(
        {
          surface,
          mode: selected,
          guest_principal_id: selected === 'guest_principal' ? guest.trim() : '',
          // The kernel computes reach; echoing ours back would be sending a
          // number we did not derive.
          readable_documents: 0,
        },
        reason.trim(),
      );
      setRejected(out.ok ? '' : out.error);
      if (out.ok) {
        setReason('');
        onSaved();
      }
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const liveSpec = MODES.find((m) => m.id === live)!;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div>
        <h3 className="text-[13.5px] font-medium">People you have never heard of</h3>
        <p className="mt-1 max-w-[620px] text-[12px] leading-[1.55] text-[var(--fg-muted)]">
          Anyone who messages this bot without a binding. Whatever is set here is what they
          get.
        </p>
      </div>

      {/* THE ANSWER TO "which one is on", before any of the controls. */}
      <div className="flex flex-col gap-1 rounded-md bg-[var(--bg-canvas)] p-2.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="type-status text-[var(--status-live)]">
            In effect now
          </span>
          <span className="text-[12.5px] font-medium">{liveSpec.label}</span>
          {live === 'guest_principal' && policy?.guest_principal_id && (
            <span className="font-mono text-[11px] text-[var(--color-accent-400)]">
              {policy.guest_principal_id}
            </span>
          )}
        </div>
        <p className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
          {liveSpec.effect}
        </p>
        <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          {readable == null ? (
            <>
              How much a stranger can read right now is <strong>unknown</strong> — this
              kernel does not report it. That is not the same as none.
            </>
          ) : (
            <>
              Right now a stranger can read{' '}
              <strong>{readable.toLocaleString()}</strong> document
              {readable === 1 ? '' : 's'}.
            </>
          )}
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[11.5px] text-[var(--fg-secondary)]">Change it to</legend>
        {MODES.map((m) => {
          const isLive = m.id === live;
          return (
            <label
              key={m.id}
              className="flex items-start gap-2 rounded-md p-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
            >
              <input
                type="radio"
                name="stranger-mode"
                className="mt-1"
                checked={selected === m.id}
                disabled={!canMutate}
                onChange={() => setSelected(m.id)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[var(--fg-primary)]">{m.label}</span>
                  {/* Repeated per row so the current state is legible from the
                      control itself, not only from the summary above. */}
                  {isLive && (
                    <span className="type-status text-[var(--status-live)]">
                      Current
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
                  {m.body}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {selected === 'guest_principal' && (
        <Input
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          placeholder="guest"
          aria-label="Guest principal"
          className="w-[220px]"
          disabled={!canMutate}
        />
      )}

      {/* Selecting is not applying, and the screen has to say so or an operator
          walks away believing the boundary moved. */}
      {dirty ? (
        <div
          className="flex flex-col gap-2 rounded-md p-2.5 tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <p className="text-[11.5px] leading-[1.55]">
            <span className="text-[var(--status-warn)]">Not applied yet.</span>{' '}
            <span className="text-[var(--fg-secondary)]">
              Strangers still get “{liveSpec.label.toLowerCase()}” until you save.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Mandatory and audited: this decides what a person you have never
                heard of can reach, so who widened it and why is the question
                asked after something goes wrong. */}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)"
              aria-label="Reason for changing the stranger policy"
              className="w-[260px]"
            />
            <Button
              size="sm"
              disabled={
                !canMutate ||
                !reason.trim() ||
                saving ||
                (selected === 'guest_principal' && !guest.trim())
              }
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Apply'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setSelected(live);
                setGuest(policy?.guest_principal_id ?? '');
                setReason('');
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--fg-muted)]">
          Selecting a different option does not change anything until you save it.
        </p>
      )}

      {failed && <ErrorState reason={failed} />}
      {rejected && <p className="text-[11.5px] text-[var(--status-err)]">{rejected}</p>}
    </section>
  );
}
