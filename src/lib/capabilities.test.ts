import { describe, expect, it } from 'vitest';
import { describeCapabilities, missingCapabilities } from './capabilities';

/**
 * The capability strings the kernel can actually advertise, transcribed from
 * the three places that emit them:
 *   cambrian-core/app/app.go (base + the four conditional ones)
 *   cambrian-premium/plugins/{authzplugin,telegram,reactive}
 *
 * This list is the point of the test: a capability the kernel sends that the
 * console does not recognise renders as "not used by this build", which is a
 * lie about a kernel that is working correctly.
 */
const KERNEL_ADVERTISES = [
  // OSS base
  'feed',
  'snapshot',
  'commands',
  'steering',
  'audit',
  'tools-read',
  'tools-manage',
  'skills-read',
  'memory-read',
  'memory-ingest',
  'tool-exec',
  'tool-approvals',
  'memory-ingest-binary',
  'routing-trace',
  'selection-cost',
  'scout-usefulness',
  'route-preview',
  'native-tool-calling',
  'agent-steps',
  'session-lifecycle',
  // conditional
  'llm-exchange',
  'memory-answer',
  'document-listing',
  'chat',
  // plugin: authz
  'access-policy',
  // plugin: telegram
  'telegram-ingress',
  // plugin: reactive
  'watches-read',
  'watches-crud',
  'watch-deadletter',
  'reactive-backpressure',
  'watch-condition-guard',
  'watch-observability',
  'watch-schedule',
  // plugin: ingress-studio
  'ingress-studio',
];

describe('describeCapabilities', () => {
  it('recognises every capability the kernel can advertise', () => {
    const unrecognised = describeCapabilities(KERNEL_ADVERTISES)
      .filter((c) => c.surface === 'not used by this build')
      .map((c) => c.capability);

    expect(unrecognised).toEqual([]);
  });

  it('still lists a capability it has never heard of, rather than dropping it', () => {
    // A plugin can advertise something this build predates. Silently dropping
    // it would hide that the kernel offers more than the console shows.
    const [described] = describeCapabilities(['some-future-plugin']);
    expect(described.capability).toBe('some-future-plugin');
    expect(described.surface).toBe('not used by this build');
  });

  it('names the surface for the ones that gate a whole panel', () => {
    const byCap = new Map(
      describeCapabilities(KERNEL_ADVERTISES).map((c) => [c.capability, c]),
    );
    expect(byCap.get('access-policy')?.surface).toBe('Scope & Access');
    expect(byCap.get('memory-answer')?.surface).toBe('Memory › Ask');
    expect(byCap.get('telegram-ingress')?.surface).toBe('Settings › Integrations');
  });
});

describe('missingCapabilities', () => {
  it('reports nothing missing when the kernel advertises everything', () => {
    expect(missingCapabilities(KERNEL_ADVERTISES)).toEqual([]);
  });

  it('reports the premium surfaces an OSS kernel does not have', () => {
    const oss = KERNEL_ADVERTISES.filter(
      (c) => !c.startsWith('watch') && c !== 'access-policy' && c !== 'telegram-ingress',
    );
    const missing = missingCapabilities(oss).map((c) => c.capability);

    expect(missing).toContain('access-policy');
    expect(missing).toContain('telegram-ingress');
    expect(missing).toContain('watch-observability');
  });

  it('does not report transport capabilities as missing surfaces', () => {
    // Without `feed` or `commands` the console is not partially degraded, it is
    // not working. Listing them here would bury the ones that answer the actual
    // question: "I know this console has that panel, where is it?"
    const missing = missingCapabilities([]).map((c) => c.capability);

    expect(missing).not.toContain('feed');
    expect(missing).not.toContain('snapshot');
    expect(missing).not.toContain('commands');
    expect(missing).not.toContain('steering');
  });

  it('reports the surface-gating ones an empty handshake is missing', () => {
    const missing = missingCapabilities([]).map((c) => c.capability);
    expect(missing).toContain('memory-answer');
    expect(missing).toContain('document-listing');
    expect(missing).toContain('chat');
  });
});
