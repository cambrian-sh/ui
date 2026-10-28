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
  mnemonic_fact: "Fact",
  mnemonic_scene: "Scene",
  episodic_memory: "Episodic",
  procedural_template: "Template",
  agent_profile: "Agent",
  negative_edge: "Negative edge",
  tool: "Tool",
  skill: "Skill",
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
        "flex cursor-pointer items-center gap-2.5 border-b border-[var(--list-row-border)] px-3 py-2 text-[12.5px] last:border-b-0",
        "hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
        selected && "bg-[var(--list-row-bg-selected)]",
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
        className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-secondary)]"
        aria-label={`DocType ${DOC_TYPE_LABEL[doc.doc_type]}`}
      >
        {DOC_TYPE_LABEL[doc.doc_type]}
      </span>
      <span className="max-w-[6rem] truncate font-mono text-[11px] text-[var(--fg-muted)]">
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
          className="h-full bg-[var(--fg-muted)]"
          style={{ width: `${doc.activation_strength * 100}%` }}
        />
      </div>
      <span className="max-w-[5rem] truncate font-mono text-[11px] text-[var(--fg-muted)]">
        {doc.session_id ?? "—"}
      </span>
      <span className="shrink-0 text-[11.5px] text-[var(--fg-muted)]">
        {formatAge(doc.created_at)}
      </span>
      <span className="flex-1 truncate text-[13px] text-[var(--fg-primary)]">
        {doc.content_preview}
      </span>
    </div>
  );
}
