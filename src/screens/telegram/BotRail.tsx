import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import type { TelegramBot } from '@/ipc/types';

const TONE: Record<string, string> = {
  running: 'var(--status-live)',
  starting: 'var(--status-warn)',
  off: 'var(--fg-muted)',
  no_token: 'var(--fg-muted)',
  // Recorded, but its bridge is not built on THIS kernel run.
  pending_start: 'var(--status-warn)',
  error: 'var(--status-err)',
};

/**
 * The bots this kernel carries (`contract 0081`).
 *
 * Each row is a separate entry point with its own credential, its own daemon and
 * its own surface. That separation is the point rather than an implementation
 * detail: a support bot the public can find and an internal bot for the team must
 * be governable apart, and one shared surface would give them identical reach —
 * adding a bot would silently widen whatever policy already existed.
 *
 * A row whose surface is not registered is called out, because that bot is not
 * broken in any way an operator would notice: it polls, it receives, it answers.
 * Its traffic simply arrives with no policy attached to the door it came through.
 */
export function BotRail({
  bots,
  activeId,
  canMutate,
  onSelect,
  onAdd,
  onRemove,
}: {
  bots: TelegramBot[];
  activeId: string;
  canMutate: boolean;
  onSelect: (id: string) => void;
  onAdd: (id: string, label: string) => Promise<void> | void;
  onRemove: (id: string, reason: string) => Promise<void> | void;
}) {
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  return (
    <aside className="flex w-[228px] flex-none flex-col gap-2">
      <div className="type-label text-[var(--fg-muted)]">
        Bots — {bots.length}
      </div>

      <ul className="flex flex-col gap-1">
        {bots.map((b) => {
          const tone = TONE[b.state] ?? 'var(--fg-muted)';
          const active = b.id === activeId;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md p-2 text-left',
                  active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-hover)]',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn('size-1.5 flex-none rounded-full', b.running && 'cambrian-live-pulse')}
                    style={{ background: tone }}
                  />
                  <span className="truncate text-[12.5px]">{b.label || b.id}</span>
                </span>
                <span className="truncate font-mono text-[10px] text-[var(--fg-muted)]">
                  {b.bot_username || b.surface}
                </span>
                {/* Not broken, and not governed. The one state that must never
                    look healthy. */}
                {!b.surface_registered && (
                  <span className="text-[10px] leading-[1.4] text-[var(--status-warn)]">
                    surface not registered — no policy on this door
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] p-2">
          <Input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="support"
            aria-label="Bot id"
          />
          {/* The id becomes a filename, an agent principal and part of the
              surface, so it is fixed once chosen — renaming it later would
              silently move which policy applies. */}
          <p className="text-[10px] leading-[1.45] text-[var(--fg-muted)]">
            Lower-case letters, digits, dash or underscore. It becomes the bot's surface and
            its agent id, so it cannot be changed later.
          </p>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Support (optional label)"
            aria-label="Bot label"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={!newId.trim()}
              onClick={() => {
                void onAdd(newId.trim(), newLabel.trim());
                setAdding(false);
                setNewId('');
                setNewLabel('');
              }}
            >
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        canMutate && (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setAdding(true)}>
            Add a bot
          </Button>
        )
      )}

      {/* Removing the default is refused by the kernel — it would leave a
          deployment that cannot be configured back to life from here. */}
      {canMutate && activeId && activeId !== 'default' && (
        <div className="flex flex-col gap-1.5">
          {removing === activeId ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-[var(--status-err)] p-2">
              <p className="text-[10.5px] leading-[1.45] text-[var(--fg-secondary)]">
                This stops the bridge and forgets its credential. Messages sent to it will no
                longer reach Cambrian.
              </p>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                aria-label="Reason for removing the bot"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--status-err)]"
                  disabled={!reason.trim()}
                  onClick={() => {
                    void onRemove(activeId, reason.trim());
                    setRemoving(null);
                    setReason('');
                  }}
                >
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-[var(--fg-muted)]"
              onClick={() => setRemoving(activeId)}
            >
              Remove this bot
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
