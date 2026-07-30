import { createFileRoute } from '@tanstack/react-router';
import { NowConsole } from '@/screens/now/NowConsole';

// `/` used to redirect to Sessions. Sessions answers "what am I working on",
// which is narrower than the question the console is actually opened with —
// "is anything wrong, and does anything need me". Now answers that one.
export const Route = createFileRoute('/')({
  component: NowConsole,
});
