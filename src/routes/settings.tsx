/* Settings route — PRD-07 §3.1 + UI-IMPL-12.
 *
 * The connection sub-screen is the V1 scope. The runtime settings form
 * (per the locked config schema, UI-015) lands in a follow-on when the
 * `op_get_config_schema` form layer is built.
 */
import { createFileRoute } from '@tanstack/react-router';
import { ConnectionSettings } from '@/screens/settings/ConnectionSettings';

export const Route = createFileRoute('/settings')({
  component: ConnectionSettings,
});
