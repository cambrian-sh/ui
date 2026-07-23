
import { createFileRoute } from '@tanstack/react-router';
import { MemoryPage } from '@/screens/memory/MemoryPage';

export const Route = createFileRoute('/memory')({
  component: MemoryPage,
});
