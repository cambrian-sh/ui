import { createFileRoute } from '@tanstack/react-router';
import { VerifierPoolConsole } from '@/screens/verifier/VerifierPoolConsole';

export const Route = createFileRoute('/verifier')({
  component: VerifierPoolConsole,
});
