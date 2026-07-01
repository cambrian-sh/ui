/* Cambrian Web UI — the router.
 *
 * Per UI-003 (TanStack Router file-based) + the technical document §5.1 + §12.1.
 * The route tree is auto-generated from src/routes/ by the Vite plugin
 * (@tanstack/router-plugin). The 14 surface routes (1 root + 13 console
 * surfaces) live as files in src/routes/.
 */
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
