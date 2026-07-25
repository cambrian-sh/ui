
import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
} from '@xyflow/react';
import dagre from 'dagre';
import type { PlanInFlight } from '@/ipc/types';
import type { PlanStep } from './PlanStepList';
import '@xyflow/react/dist/style.css';

// Node border colour by live execution status, so the DAG animates as the plan runs.
const STATUS_BORDER: Record<string, string> = {
  pending: 'var(--border-strong)',
  running: 'var(--status-pulse)',
  done: 'var(--status-ok)',
  failed: 'var(--status-err)',
  skipped: 'var(--border-strong)',
};

function dagreLayout(steps: PlanStep[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 64 });
  steps.forEach((s) => g.setNode(s.step_id, { width: 180, height: 44 }));

  const byIndex = new Map(steps.map((s) => [s.index, s]));
  // Real DAG edges: an edge dep → step for every dependency. Fall back to a linear chain
  // only when NO step carries dependency data (e.g. the count-based placeholder).
  const hasDeps = steps.some((s) => (s.depends_on?.length ?? 0) > 0);
  const edges: Edge[] = [];
  if (hasDeps) {
    for (const s of steps) {
      for (const dep of s.depends_on ?? []) {
        const from = byIndex.get(dep);
        if (!from) continue;
        g.setEdge(from.step_id, s.step_id);
        edges.push({
          id: `${from.step_id}->${s.step_id}`,
          source: from.step_id,
          target: s.step_id,
          type: 'smoothstep',
        });
      }
    }
  } else {
    for (let i = 0; i < steps.length - 1; i++) {
      g.setEdge(steps[i].step_id, steps[i + 1].step_id);
      edges.push({
        id: `${steps[i].step_id}->${steps[i + 1].step_id}`,
        source: steps[i].step_id,
        target: steps[i + 1].step_id,
        type: 'smoothstep',
      });
    }
  }

  dagre.layout(g);
  const nodes: Node[] = steps.map((s) => {
    const pos = g.node(s.step_id);
    const label = s.query ? s.query.slice(0, 40) : `step ${s.index}`;
    return {
      id: s.step_id,
      position: { x: pos.x - 90, y: pos.y - 22 },
      data: { label: `${String(s.index).padStart(2, '0')} · ${s.status}${s.is_thought ? ' · think' : ''}\n${label}` },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        width: 180,
        height: 44,
        background: 'var(--bg-surface)',
        border: `1px solid ${STATUS_BORDER[s.status] ?? 'var(--border-strong)'}`,
        borderRadius: 2,
        fontSize: 11,
        color: 'var(--fg-primary)',
        whiteSpace: 'pre-line',
        textAlign: 'center',
      },
    };
  });
  return { nodes, edges };
}

export function PlanGraph({
  plan,
  steps,
  onSelectStep,
}: {
  plan: PlanInFlight;
  steps: PlanStep[];
  onSelectStep: (index: number) => void;
}) {
  const { nodes, edges } = useMemo(() => dagreLayout(steps), [steps]);

  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[var(--fg-muted)]">
        No steps to lay out.
      </div>
    );
  }

  return (
    <div className="h-full w-full" aria-label={`DAG for plan ${plan.plan_id}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const step = steps.find((s) => s.step_id === node.id);
          if (step) onSelectStep(step.index);
        }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
