/* DAG-as-graph mode (PRD-04 §4 + UI-011).
 *
 * React Flow (xyflow v12) + dagre for the layout. The plan's steps are
 * sequential (depends_on indices), so the graph is a linear chain in
 * V1. The dagre layout is deterministic and stable: the same plan always
 * lays out the same. Pan + zoom are built in; the keyboard layer
 * (`+`/`-`/`0` per PRD-04 §4.4) wires to the React Flow viewport.
 */
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

function dagreLayout(steps: PlanStep[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 64 });
  steps.forEach((s) => g.setNode(s.step_id, { width: 180, height: 44 }));
  for (let i = 0; i < steps.length - 1; i++) {
    g.setEdge(steps[i].step_id, steps[i + 1].step_id);
  }
  dagre.layout(g);
  const nodes: Node[] = steps.map((s) => {
    const pos = g.node(s.step_id);
    return {
      id: s.step_id,
      position: { x: pos.x - 90, y: pos.y - 22 },
      data: { label: `${String(s.index).padStart(2, '0')} · ${s.status}` },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        width: 180,
        height: 44,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 2,
        fontSize: 11,
        color: 'var(--fg-primary)',
      },
    };
  });
  const edges: Edge[] = steps.slice(0, -1).map((s, i) => ({
    id: `${s.step_id}-${steps[i + 1].step_id}`,
    source: s.step_id,
    target: steps[i + 1].step_id,
    type: 'smoothstep',
  }));
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
