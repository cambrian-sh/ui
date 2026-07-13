import { cn } from "@/design-system/lib/utils";


export type MemoryDocType =
  | "mnemonic_fact"
  | "mnemonic_scene"
  | "episodic_memory"
  | "procedural_template"
  | "agent_profile"
  | "negative_edge"
  | "tool"
  | "skill";

export interface MemoryDocument {
  doc_id: string;
  doc_type: MemoryDocType;
  scope_tags: string[];
  activation_strength: number;
  session_id: string | null;
  created_at: string;
  content_preview: string;
}

export interface MemoryListRowProps {
  doc: MemoryDocument;
  selected?: boolean;
  showCheckbox?: boolean;
  checked?: boolean;
  onCheckboxChange?: (docId: string) => void;
  onClick?: (docId: string) => void;
  className?: string;
}

const DOC_TYPE_LABEL: Record<MemoryDocType, string> = {
  mnemonic_fact: "FACT",
  mnemonic_scene: "SCENE",
  episodic_memory: "EPISODIC",
  procedural_template: "TEMPLATE",
  agent_profile: "AGENT",
  negative_edge: "NEG-EDGE",
  tool: "TOOL",
  skill: "SKILL",
};

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MemoryListRow({
  doc,
  selected,
  showCheckbox,
  checked,
  onCheckboxChange,
  onClick,
  className,
}: MemoryListRowProps) {
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onClick?.(doc.doc_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(doc.doc_id);
        }
      }}
      className={cn(
        "flex items-center gap-2 border-b border-[var(--list-row-border)] px-2 py-1.5 text-xs",
        "hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        selected && "bg-[var(--bg-elevated)]",
        className,
      )}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={checked ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onCheckboxChange?.(doc.doc_id);
          }}
          aria-label={`Select memory ${doc.doc_id}`}
          className="accent-[var(--accent-bg)]"
        />
      )}
      <span
        className="rounded-sm border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-secondary)]"
        aria-label={`DocType ${DOC_TYPE_LABEL[doc.doc_type]}`}
      >
        {DOC_TYPE_LABEL[doc.doc_type]}
      </span>
      <span className="font-mono text-[var(--fg-muted)] max-w-[6rem] truncate">
        {doc.scope_tags[0] ?? "—"}
      </span>
      <div
        className="h-1.5 w-12 rounded-full bg-[var(--bg-elevated)] overflow-hidden"
        role="meter"
        aria-label="activation strength"
        aria-valuenow={Math.round(doc.activation_strength * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[var(--accent-bg)]"
          style={{ width: `${doc.activation_strength * 100}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-[var(--fg-muted)] max-w-[5rem] truncate">
        {doc.session_id ?? "—"}
      </span>
      <span className="text-[10px] text-[var(--fg-muted)] shrink-0">
        {formatAge(doc.created_at)}
      </span>
      <span className="font-mono text-[11px] text-[var(--fg-primary)] flex-1 truncate">
        {doc.content_preview}
      </span>
    </div>
  );
}
