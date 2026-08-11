import { describe, expect, it } from 'vitest';
import { buildSurfaceRegistry, surfaceKey } from './surfaceRegistry';
import type { AgentSummary, IngressSpec, LinkSpec, PolicySpec } from '@/ipc/types';

function ingress(over: Partial<IngressSpec> = {}): IngressSpec {
  return {
    agent_id: 'telegram_ingress',
    surface_kind: 'chat',
    surface_id: 'telegram',
    namespace: ['tg:'],
    ...over,
  };
}

function link(over: Partial<LinkSpec> = {}): LinkSpec {
  return {
    policy_id: 'p1',
    container_kind: 'surface',
    target_id: 'chat:telegram',
    enforced: false,
    order: 0,
    expires_at_unix_ms: 0,
    granted_by: '',
    ...over,
  };
}

function policy(over: Partial<PolicySpec> = {}): PolicySpec {
  return {
    id: 'p1',
    name: 'No customer PII on Telegram',
    version: 1,
    rule: { required_tags: [], any_of_tags: [], forbidden_tags: [], granted_tags: [], party_scoped_tags: [] },
    effects: { allow: [], deny: [] },
    mode: 'enforced',
    expires_at_unix_ms: 0,
    granted_by: '',
    updated_at_unix_ms: 0,
    ...over,
  };
}

function agent(over: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: 'telegram_ingress',
    trait: 'Daemon',
    scope_summary: '',
    trust_score: 0.8,
    last_activity_at: new Date().toISOString(),
    last_state: 'ready',
    ...over,
  };
}

describe('buildSurfaceRegistry', () => {
  it('joins the ingress, the daemon and the linked policies into one row', () => {
    const rows = buildSurfaceRegistry([ingress()], [link()], [policy()], [agent()]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('surface:chat:telegram');
    expect(rows[0].ingress?.agent_id).toBe('telegram_ingress');
    expect(rows[0].daemon?.id).toBe('telegram_ingress');
    expect(rows[0].policies.map((p) => p.id)).toEqual(['p1']);
    expect(rows[0].problems).toEqual([]);
  });

  it('surfaces a policy linked to a surface nothing registers', () => {
    // The reason this screen exists. From the Policies pane this is
    // indistinguishable from a working boundary, and it applies to nobody.
    const rows = buildSurfaceRegistry(
      [],
      [link({ target_id: 'chat:slack' })],
      [policy()],
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('surface:chat:slack');
    expect(rows[0].ingress).toBeNull();
    expect(rows[0].problems).toContain('no-ingress');
  });

  it('flags a registered surface that no policy bounds', () => {
    const rows = buildSurfaceRegistry([ingress()], [], [], [agent()]);
    expect(rows[0].problems).toContain('no-policy');
  });

  it('flags an unrestricted namespace', () => {
    const rows = buildSurfaceRegistry(
      [ingress({ namespace: [] })],
      [link()],
      [policy()],
      [agent()],
    );
    expect(rows[0].problems).toContain('unrestricted-namespace');
  });

  it('flags an ingress whose daemon has never appeared on the feed', () => {
    // `agents` folds from AgentReadyOp, so an absent agent means nothing is
    // known to be serving the surface — which is not the same as "it is down".
    const rows = buildSurfaceRegistry([ingress()], [link()], [policy()], []);
    expect(rows[0].daemon).toBeNull();
    expect(rows[0].problems).toContain('daemon-silent');
  });

  it('ignores links that are not targeting a surface', () => {
    const rows = buildSurfaceRegistry(
      [ingress()],
      [
        link(),
        link({ policy_id: 'p2', container_kind: 'group', target_id: 'support-team' }),
        link({ policy_id: 'p3', container_kind: 'organisation', target_id: '' }),
      ],
      [policy(), policy({ id: 'p2' }), policy({ id: 'p3' })],
      [agent()],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].policies.map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps a surface id that contains a colon intact', () => {
    // `surface:chat:telegram:eu` — only the first segment is the kind.
    const rows = buildSurfaceRegistry(
      [],
      [link({ target_id: 'chat:telegram:eu' })],
      [policy()],
      [],
    );
    expect(rows[0].id).toBe('surface:chat:telegram:eu');
    expect(rows[0].kind).toBe('chat');
    expect(rows[0].surfaceId).toBe('telegram:eu');
  });

  it('records a link whose policy is missing without inventing one', () => {
    // A dangling policy_id must not become a phantom policy in the count.
    const rows = buildSurfaceRegistry([ingress()], [link({ policy_id: 'gone' })], [], [agent()]);
    expect(rows[0].links).toHaveLength(1);
    expect(rows[0].policies).toHaveLength(0);
    expect(rows[0].problems).toContain('no-policy');
  });

  it('merges several policies linked at the same surface', () => {
    const rows = buildSurfaceRegistry(
      [ingress()],
      [link(), link({ policy_id: 'p2' })],
      [policy(), policy({ id: 'p2', name: 'Second' })],
      [agent()],
    );
    expect(rows[0].policies).toHaveLength(2);
  });

  it('sorts surfaces stably by id', () => {
    const rows = buildSurfaceRegistry(
      [
        ingress({ agent_id: 'z', surface_id: 'zulip' }),
        ingress({ agent_id: 'a', surface_id: 'alpha' }),
      ],
      [],
      [],
      [],
    );
    expect(rows.map((r) => r.surfaceId)).toEqual(['alpha', 'zulip']);
  });

  it('is empty when nothing is registered and nothing is linked', () => {
    expect(buildSurfaceRegistry([], [], [], [])).toEqual([]);
  });
});

describe('surfaceKey', () => {
  it('produces the form a policy link targets', () => {
    expect(surfaceKey('chat', 'telegram')).toBe('surface:chat:telegram');
  });
});
