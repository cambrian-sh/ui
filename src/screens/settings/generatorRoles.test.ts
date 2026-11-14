import { describe, expect, it } from 'vitest';
import { GENERATOR_ROLES } from '@/ipc/types';

// The console's role grid must offer exactly the roles the kernel accepts
// (cambrian-core app/config_write_source.go `assignableRoles`). `facts` was missing,
// so the fact-extraction model could not be seen or assigned from the console
// (T-20261103-ui-settings-generatorrole-omits-facts-so-the).
describe('GENERATOR_ROLES', () => {
  it('lists every role the kernel accepts, and only those', () => {
    expect([...GENERATOR_ROLES].sort()).toEqual(
      ['facts', 'memory', 'planner', 'retrieval_planner', 'router', 'thought', 'verifier'],
    );
  });

  it('no longer offers the retired interview role', () => {
    expect(GENERATOR_ROLES as string[]).not.toContain('interview');
  });
});
