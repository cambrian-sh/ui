import { createFileRoute } from '@tanstack/react-router';
import { DagBuilder } from '@/screens/plan/DagBuilder';

export const Route = createFileRoute('/plan-builder')({
  component: DagBuilder,
});
