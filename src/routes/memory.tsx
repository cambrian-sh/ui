
import { createFileRoute } from '@tanstack/react-router';
import { MemoryExplorer } from '@/screens/memory/MemoryExplorer';

export const Route = createFileRoute('/memory')({
  component: MemoryExplorer,
});
