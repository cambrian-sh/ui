// The co-participation neighborhood, laid out with dagre and rendered with
// React Flow — the PlanGraph conventions (tokens for every colour, hidden
// attribution, no interactive controls), not its code: this graph is entities
// joined by shared events, not a plan DAG. Traversal is hop-capped by the
// query plane itself (MaxTraverseHops), so the graph is bounded by
// construction and cannot melt the layout.
//
// Dagre is a DAG layouter and co-participation is undirected; the traverse
// rows' from→to orientation (a BFS spanning tree from the centre) is exactly
// the spanning orientation that makes the ranking meaningful: hop distance
// becomes rank.

import { useMemo } from 'react';
import { ReactFlow, Background, type Edge, type Node, Position } from '@xyflow/react';
import dagre from 'dagre';
import type { KnowledgeRow } from './rows';
import '@xyflow/react/dist/style.css';

const NODE_W = 200;
const NODE_H = 40;

export function NeighborGraph({
  center,
  rows,
  onSelect,
}: {
  center: string;
  rows: KnowledgeRow[];
  onSelect: (entityId: string) => void;
}) {
  const { nodes, edges } = useMemo(() => layout(center, rows), [center, rows]);

  if (rows.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--fg-muted)]">
        No co-participants in the window. This entity's events name no other entities — an
        answer, not a failure.
      </p>
    );
  }

  return (
    <div className="h-[300px] w-full rounded-[8px] border border-[var(--border-default)]"
      aria-label={`Co-participation neighborhood of ${center}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_e, node) => onSelect(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}

function layout(center: string, rows: KnowledgeRow[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 90, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set<string>([center]);
  for (const row of rows) {
    if (typeof row.from === 'string') ids.add(row.from);
    if (typeof row.to === 'string') ids.add(row.to);
  }
  for (const id of ids) g.setNode(id, { width: NODE_W, height: NODE_H });
  for (const row of rows) {
    if (typeof row.from === 'string' && typeof row.to === 'string') {
      g.setEdge(row.from, row.to);
    }
  }
  dagre.layout(g);

  const nodes: Node[] = [...ids].map((id) => {
    const pos = g.node(id);
    const isCenter = id === center;
    return {
      id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: id },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        width: NODE_W,
        height: NODE_H,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        background: 'var(--bg-surface)',
        color: 'var(--fg-primary)',
        border: isCenter
          ? '1.5px solid var(--accent-bg)'
          : '1px solid var(--border-strong)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'pointer',
      },
    };
  });

  const edges: Edge[] = rows
    .filter((r) => typeof r.from === 'string' && typeof r.to === 'string')
    .map((r, i) => ({
      id: `e${i}`,
      source: r.from as string,
      target: r.to as string,
      type: 'smoothstep',
      label: typeof r.role === 'string' ? r.role : undefined,
      labelStyle: { fontSize: 10, fill: 'var(--fg-muted)' },
      labelBgStyle: { fill: 'var(--bg-surface)' },
      style: { stroke: 'var(--border-strong)' },
    }));

  return { nodes, edges };
}
