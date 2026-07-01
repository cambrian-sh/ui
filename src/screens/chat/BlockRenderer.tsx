/* 12-block taxonomy dispatcher (PRD-03 §4 + UI-010).
 *
 * The chat surface renders a reverse-chronological list of blocks. Each
 * block is one of 12 types (the discriminated union in this file). The
 * dispatcher is an exhaustive switch; TypeScript catches missing variants.
 *
 * V1 status: 4 of 12 renderers are implemented (OperatorMessage, RuntimeText,
 * PlanCard, HITLInline via the design-system components). The remaining 8
 * land as their owning PRDs ship (PRD-04 plan work, PRD-05 memory, PRD-06
 * console) — they're placeholder here so the chat surface compiles.
 */
import type { PlanInFlight, HITLIntervention } from '@/ipc/types';
import { ChatMessage } from '@/design-system/components/cambrian/chat-message';
import { PlanCard, type PlanStep } from '@/design-system/components/cambrian/plan-card';
import { HITLInline } from '@/design-system/components/cambrian/hitl-inline';

export type Block =
  | { kind: 'operator_message'; id: string; text: string; ts: string }
  | { kind: 'runtime_text'; id: string; text: string; ts: string }
  | { kind: 'plan_card'; id: string; plan: PlanInFlight; steps: PlanStep[] }
  | { kind: 'bid_panel'; id: string; plan_id: string }
  | { kind: 'agent_output'; id: string; session_id: string; step_index: number; text: string }
  | { kind: 'hitl_inline'; id: string; intervention: HITLIntervention }
  | { kind: 'artifact_card'; id: string; cid: string; title: string }
  | { kind: 'memory_reference'; id: string; doc_id: string; doc_kind: string; summary: string }
  | { kind: 'tool_call'; id: string; tool_name: string; args_summary: string; result: string }
  | { kind: 'system_note'; id: string; text: string; ts: string }
  | { kind: 'error_block'; id: string; text: string; remedy: string }
  | { kind: 'skill_panel'; id: string; name: string; description: string };

function Placeholder({ label }: { label: string }) {
  return (
    <div
      role="article"
      aria-label={label}
      className="rounded-sm border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--fg-muted)]"
    >
      {label} — renderer lands in its owning PRD.
    </div>
  );
}

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case 'operator_message':
      return <ChatMessage author="operator" text={block.text} timestamp={block.ts} />;
    case 'runtime_text':
      return <ChatMessage author="runtime" text={block.text} timestamp={block.ts} />;
    case 'plan_card':
      return <PlanCard plan={block.plan} steps={block.steps} />;
    case 'hitl_inline':
      return <HITLInline intervention={block.intervention} />;
    case 'bid_panel':
      return <Placeholder label={`BidPanel · ${block.plan_id}`} />;
    case 'agent_output':
      return <Placeholder label={`AgentOutputStream · step ${block.step_index}`} />;
    case 'artifact_card':
      return <Placeholder label={`ArtifactCard · ${block.title}`} />;
    case 'memory_reference':
      return <Placeholder label={`MemoryReference · ${block.doc_kind}`} />;
    case 'tool_call':
      return <Placeholder label={`ToolCall · ${block.tool_name}`} />;
    case 'system_note':
      return <Placeholder label={`SystemNote · ${block.text.slice(0, 40)}`} />;
    case 'error_block':
      return <Placeholder label={`ErrorBlock · ${block.remedy}`} />;
    case 'skill_panel':
      return <Placeholder label={`SkillPanel · ${block.name}`} />;
  }
}
