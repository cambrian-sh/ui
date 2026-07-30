import { createFileRoute } from '@tanstack/react-router';
import { TelegramConsole } from '@/screens/telegram/TelegramConsole';

export const Route = createFileRoute('/telegram')({
  component: TelegramConsole,
  // `tab` is the section being read. A search param rather than component state
  // so a section is linkable — "the people on my bot" is somewhere an operator
  // sends a colleague, and a tab you cannot link to is a tab you have to
  // describe in words.
  //
  // `bot` names which bot is being configured. Present from the start even
  // though one bot exists today: it is what stops the multi-bot work from
  // needing a third restructure of this screen.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    bot: typeof search.bot === 'string' ? search.bot : undefined,
  }),
});
