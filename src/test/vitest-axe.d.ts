/* Type declaration for the vitest-axe matcher.
 *
 * vitest-axe 0.1.0's .d.ts marks toHaveNoViolations as `export type` even
 * though the runtime value exists. The setup file registers it via
 * `expect.extend`; this declaration tells TypeScript the matcher is
 * available on the assertion.
 */
import 'vitest';
import type { AxeResults } from 'axe-core';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T extends AxeResults ? Promise<void> : void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}
