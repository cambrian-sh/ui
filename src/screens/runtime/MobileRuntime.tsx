import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';

/**
 * Runtime, on a phone.
 *
 * Read-only by design. Every mutating control in this section — a tool grant, a
 * scope change, an MCP registration — is a policy-grade decision that deserves
 * a screen you can read the consequences on. So the phone answers *"is
 * everything alright"* and sends you to a desktop for *"change it"*.
 *
 * One live number and one sentence per tile. The sentence is the part that
 * matters: a count with no interpretation is something an operator has to
 * already know how to read.
 */
export function MobileRuntime() {
  const projection = useStore(projectionStore);
  const state = projection.state;

  const agents = state?.agents ?? [];
  const tools = state?.tools ?? [];
  const skills = state?.skills ?? [];
  // MCP servers are request/response state (contract 0097), not a feed
  // projection — this read is the same one the /mcp screen renders.
  const mcp = useKernelQuery(['mcp-server-configs'], () => ipc.listMCPServerConfigs());
  const servers = mcp.data ?? [];
  const watches = state?.watch_configs ?? [];

  const surveilled = state?.verifier_pool.surveillance_triggers.length ?? 0;
  const inferred = tools.filter((t) => t.effects_inferred).length;
  const serversDown = servers.filter((s) => !s.connected).length;
  const failingWatches = watches.filter((w) => w.last_fire_status === 'error').length;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h1 className="text-[26px] font-medium leading-[1.15] tracking-[-0.02em]">Runtime</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
          What can act here. Read-only on mobile — changes are made from a desktop.
        </p>
      </div>

      <Tile
        label="Agents"
        value={String(agents.length)}
        tone={surveilled > 0 ? 'var(--status-warn)' : undefined}
        sentence={
          agents.length === 0
            ? 'None have reported. Agents appear when they announce readiness, so this is quiet rather than empty.'
            : surveilled > 0
              ? `${surveilled} under surveillance — being verified on every task until their outcomes recover.`
              : 'All ranking normally; none under surveillance.'
        }
      />

      <Tile
        label="Tools"
        value={String(tools.length)}
        tone={inferred > 0 ? 'var(--status-warn)' : undefined}
        sentence={
          inferred > 0
            ? `${inferred} still have inferred effect classes — derived from a manifest rather than declared, so strict registration stays off.`
            : 'Every tool declares its effects.'
        }
      />

      <Tile
        label="Skills"
        value={String(skills.length)}
        sentence={
          skills.length === 0
            ? 'None registered.'
            : 'Bundles of instructions and tool grants an agent can load.'
        }
      />

      <Tile
        label="MCP servers"
        value={mcp.error ? 'unknown' : String(servers.length)}
        tone={serversDown > 0 ? 'var(--status-err)' : undefined}
        sentence={
          mcp.error
            ? // Only an ERROR is "unknown" now — the list read exists
              // (contract 0097), so an empty answer is a real zero.
              'This kernel does not serve the MCP list, so the console cannot tell an empty deployment from an unreported one.'
            : servers.length === 0
              ? 'None configured.'
              : serversDown > 0
                ? `${serversDown} unreachable — the kernel keeps retrying; anything routed to them fails its step meanwhile.`
                : 'All connected.'
        }
      />

      <Tile
        label="Watches"
        value={String(watches.length)}
        tone={failingWatches > 0 ? 'var(--status-err)' : undefined}
        sentence={
          watches.length === 0
            ? 'Nothing is watching a stream.'
            : failingWatches > 0
              ? `${failingWatches} failing on their last fire.`
              : 'All fired cleanly last time.'
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  sentence,
  tone,
}: {
  label: string;
  value: string;
  sentence: string;
  tone?: string;
}) {
  return (
    <section
      className="flex flex-col gap-1 rounded-[var(--radius-xl)] bg-[var(--bg-surface)] p-[14px_16px] shadow-[var(--elevation-1)]"
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          {label}
        </span>
        <span
          className="font-mono text-[22px] leading-[1.2] tracking-[-0.02em]"
          style={{ color: tone ?? 'var(--fg-primary)' }}
        >
          {value}
        </span>
      </div>
      <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">{sentence}</p>
    </section>
  );
}
