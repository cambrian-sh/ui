import { cn } from "@/design-system/lib/utils";

export interface Bid {
  agent_id: string;
  confidence: number;
  trust_score: number;
  latency_ms: number;
  is_winner: boolean;
}

export interface BidPanelProps {
  bids: Bid[];
  resolved?: boolean;
  className?: string;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function BidPanel({ bids, resolved, className }: BidPanelProps) {
  return (
    <div
      role="region"
      aria-label="Bid panel"
      className={cn(
        "flex flex-col gap-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2",
        className,
      )}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">
        <span>Bids</span>
        {resolved && bids.some((b) => b.is_winner) && (
          <span className="text-[var(--fg-muted)] font-mono normal-case">
            winner: {bids.find((b) => b.is_winner)!.agent_id}
          </span>
        )}
      </div>
      <ul aria-label="Qualified candidates" className="flex flex-col gap-1">
        {bids.map((bid) => (
          <li
            key={bid.agent_id}
            className={cn(
              "flex items-center gap-2 rounded-sm px-2 py-1 text-xs",
              bid.is_winner
                ? "border-l-2 border-l-[var(--accent-bg)] bg-[var(--bg-surface)]"
                : "border-l-2 border-l-transparent",
            )}
          >
            <span className="font-mono text-[11px] text-[var(--fg-primary)] flex-1 truncate">
              {bid.agent_id}
            </span>
            <div className="flex items-center gap-1 shrink-0" aria-label="confidence">
              <div className="h-1 w-8 rounded-full bg-[var(--bg-canvas)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-bg)]"
                  style={{ width: `${bid.confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-[var(--fg-muted)] w-6 text-right">
                {bid.confidence.toFixed(2)}
              </span>
            </div>
            <span
              className="rounded-sm border border-[var(--border-subtle)] px-1 text-[10px] font-mono text-[var(--fg-muted)] shrink-0"
              aria-label={`TrustScore ${bid.trust_score.toFixed(2)}`}
            >
              ts {bid.trust_score.toFixed(2)}
            </span>
            <span className="font-mono text-[10px] text-[var(--fg-muted)] w-12 text-right shrink-0">
              {formatLatency(bid.latency_ms)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
