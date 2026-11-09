import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';

/**
 * Why a mutating control is disabled right now, or undefined when it is not.
 *
 * One rule for every screen: a Viewer's mutations are refused server-side
 * (PermissionDenied), and a console that is not live cannot deliver a command.
 * Saying so up front is more honest than a button that fails on click.
 */
export function useCommandGate(
  action = 'make this change',
  opts: { selfService?: boolean } = {},
): string | undefined {
  const role = useStore(projectionStore, (s) => s.state?.role ?? null);
  const connection = useStore(projectionStore, (s) => s.state?.connection.status ?? 'down');
  // Self-service commands (e.g. connecting MY account, ADR-0141 D8) are open to
  // every role; the kernel scopes them to the caller's own principal.
  if (role === 'viewer' && !opts.selfService) return `Operator role required to ${action}.`;
  // ADR-0142: a member (signed in, no console role) may only act on their own things.
  if (role === 'member' && !opts.selfService) return `A console role is required to ${action}.`;
  if (connection === 'reconnecting') return 'Reconnecting — the kernel is not accepting commands right now.';
  if (connection !== 'live') return 'Kernel unreachable.';
  return undefined;
}

/** Whether the handshake advertises a capability (the in-screen half of gating). */
export function useCapability(capability: string): boolean {
  return useStore(projectionStore, (s) => (s.state?.capabilities ?? []).includes(capability));
}

/** Format unix ms as a short local date-time; '—' when unset. */
export function formatUnixMs(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3m", "2h", "4d" since `ms`. */
export function ago(ms: number, now = Date.now()): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
