/* Stand-in for `@tauri-apps/plugin-dialog` in dev — see ./socket.ts.
 *
 * A browser tab cannot open a native file picker that yields a path the Rust
 * core can read, so outside the native window `open` reports a cancelled pick.
 */
import * as dialog from '@tauri-apps/plugin-dialog';
import { inTauri } from './socket';

export * from '@tauri-apps/plugin-dialog';

export const open: typeof dialog.open = ((options?: dialog.OpenDialogOptions) => {
  if (inTauri()) return dialog.open(options);
  console.warn('[dev-bridge] file picker is only available in the native window');
  return Promise.resolve(null);
}) as typeof dialog.open;
