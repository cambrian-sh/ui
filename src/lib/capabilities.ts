/**
 * What each advertised capability actually turns on in this console.
 *
 * `14 advertised` answers nothing. The question an operator arrives with is
 * *"why is that panel missing"*, and only a mapping answers it: a capability is
 * the whole rendering contract for a premium surface (ADR-0082 D2 — the kernel
 * forwards plugin capabilities without interpreting them), so an absent string
 * is the difference between a panel existing and not.
 *
 * An unmapped capability is still listed, unnamed. That is deliberate: a plugin
 * can advertise something this build has never heard of, and silently dropping
 * it would hide the fact that the kernel offers more than the console shows.
 */
export interface CapabilitySurface {
  capability: string;
  /** Where it shows up, in the words the nav uses. */
  surface: string;
  /** What is lost without it. */
  consequence: string;
  /**
   * True when its absence removes a console surface an operator could go
   * looking for.
   *
   * Transport-level capabilities (`feed`, `commands`, `snapshot`) are excluded:
   * without them the console is not partially degraded, it is not working, and
   * listing them as "missing surfaces" would bury the ones that answer the
   * actual question — *"I know this console has that panel, where is it?"*
   */
  gatesSurface?: boolean;
}

/**
 * Every capability string this kernel family can advertise.
 *
 * Kept in sync with the three places that emit them:
 *   - `cambrian-core/app/app.go` — the OSS base list plus the four conditional
 *     ones (`llm-exchange`, `memory-answer`, `document-listing`, `chat`)
 *   - `cambrian-premium/plugins/{authzplugin,telegram,reactive}` — plugin-contributed
 *
 * Completeness matters more here than it looks. An unmapped capability falls
 * through to "not used by this build", so a partial map actively lies about a
 * kernel that is working correctly — and `missingCapabilities()` can only report
 * an absence for a string it knows about in the first place.
 */
const KNOWN: Record<string, Omit<CapabilitySurface, 'capability'>> = {
  // ── OSS base: the transport itself ──────────────────────────────────────
  feed: {
    surface: 'everything live',
    consequence: 'the StreamEvents feed — without it nothing on screen updates',
  },
  snapshot: {
    surface: 'startup + resync',
    consequence: 'the absolute-state snapshot the console hydrates and recovers from',
  },
  commands: { surface: 'every mutation', consequence: 'all mutating commands' },
  steering: {
    surface: 'Session work surface',
    consequence: 'pause, resume and inject',
  },
  audit: { surface: 'Audit', consequence: 'the audit tail', gatesSurface: true },
  'session-lifecycle': {
    surface: 'Sessions',
    consequence: 'session create/close and the lifecycle states',
  },

  // ── OSS base: runtime reads ─────────────────────────────────────────────
  'tools-read': { surface: 'Runtime › Tools', consequence: 'the tool catalogue' },
  'tools-manage': {
    surface: 'Runtime › Tools',
    consequence: 'granting and revoking tools',
  },
  'skills-read': { surface: 'Runtime › Skills', consequence: 'the skill catalogue' },
  'tool-exec': { surface: 'Runtime', consequence: 'operator-initiated tool execution' },
  'tool-approvals': { surface: 'Inbox', consequence: 'the HITL approval lane' },

  // ── OSS base: memory ────────────────────────────────────────────────────
  'memory-read': { surface: 'Memory', consequence: 'retrieval' },
  'memory-ingest': { surface: 'Memory › Ingest', consequence: 'text ingest' },
  'memory-ingest-binary': {
    surface: 'Memory › Ingest',
    consequence:
      'file upload — without it the drop target is hidden and an older kernel would silently text-only-ingest',
    gatesSurface: true,
  },
  'memory-answer': {
    surface: 'Memory › Ask',
    consequence: 'grounded, cited answers; plain retrieval still works',
    gatesSurface: true,
  },
  'document-listing': {
    surface: 'Scope › Labels, Scope › Overview',
    consequence:
      'the document browser, the unlabelled-only worklist, and the coverage count on the Scope landing',
    gatesSurface: true,
  },

  // ── OSS base: routing + observability ───────────────────────────────────
  'routing-trace': {
    surface: 'dispatch trace',
    consequence: 'the candidate funnel behind a routing decision',
  },
  'selection-cost': {
    surface: 'Step inspector',
    consequence: 'the RPC and speculative-boot counters — what a routing decision cost',
    gatesSurface: true,
  },
  'route-preview': {
    surface: 'dispatch preview',
    consequence: 'previewing which agent a capability contract would reach',
    gatesSurface: true,
  },
  'scout-usefulness': {
    surface: 'session diagnostics',
    consequence: 'per-session scout usefulness events',
  },
  'agent-steps': {
    surface: 'agent-loop observability',
    consequence: 'per-query agent step events',
    gatesSurface: true,
  },
  'llm-exchange': {
    surface: 'agent-loop observability',
    consequence:
      'full prompt + completion of every reasoning turn; advertised only when capture_llm_exchanges is on',
    gatesSurface: true,
  },
  'native-tool-calling': {
    surface: 'agent plane',
    consequence:
      'the GenerateWithTools RPC; declared unconditionally, whether a given step can use it depends on its model',
  },

  // ── Conditional: chat lane ──────────────────────────────────────────────
  chat: {
    surface: 'Chat',
    consequence: 'the conversation lane — turns run on the kernel chat pool, never the planner',
    gatesSurface: true,
  },

  // ── Plugin: authz ───────────────────────────────────────────────────────
  'access-policy': {
    surface: 'Scope & Access',
    consequence:
      'the premium policy panes (Rule, Reachability, Policies, Groups, Assistant, Rollout); Explain and Principals still work without it',
    gatesSurface: true,
  },

  // ── Plugin: telegram ────────────────────────────────────────────────────
  'telegram-ingress': {
    surface: 'Settings › Integrations',
    consequence: 'the Telegram panel',
    gatesSurface: true,
  },

  // ── Plugin: reactive ────────────────────────────────────────────────────
  'watches-read': {
    surface: 'Watch & Reactive',
    consequence: 'the watch list',
     gatesSurface: true,
  },
  'watches-crud': {
    surface: 'Watch & Reactive',
    consequence: 'creating, editing and deleting watches',
    gatesSurface: true,
  },
  'watch-observability': {
    surface: 'Watch & Reactive',
    consequence: 'per-watch metrics, dry-run and backtest',
    gatesSurface: true,
  },
  'watch-deadletter': {
    surface: 'Watch & Reactive',
    consequence: 'the dead-letter queue',
    gatesSurface: true,
  },
  'watch-schedule': {
    surface: 'Watch & Reactive',
    consequence: 'schedule-driven watches',
    gatesSurface: true,
  },
  'watch-condition-guard': {
    surface: 'Watch & Reactive',
    consequence: 'the LLM-condition injection guard',
    gatesSurface: true,
  },
  'reactive-backpressure': {
    surface: 'Watch & Reactive',
    consequence: 'debounce, rate limits and shed order',
    gatesSurface: true,
  },
  // ── plugin: ingress-studio (ADR-0112) ────────────────────────────────────
  'ingress-studio': {
    surface: 'Ingress Studio',
    consequence:
      'describe → secure+capture → draft → confirm → dry-run → arm for external data sources; reported only when the studio found Postgres and evidence capture',
    gatesSurface: true,
  },
  // ── plugin: substrate (ADR-0118) ─────────────────────────────────────────
  'substrate-query': {
    surface: 'Knowledge',
    consequence:
      'the natural-language ask box, the holdings overview and the entity explorer over the knowledge substrate; reported only when the substrate plugin found Postgres',
    gatesSurface: true,
  },
};

/** Map the handshake's capability list onto the surfaces they gate. */
export function describeCapabilities(capabilities: readonly string[]): CapabilitySurface[] {
  return capabilities.map((capability) => {
    const known = KNOWN[capability];
    return known
      ? { capability, ...known }
      : {
          capability,
          surface: 'not used by this build',
          consequence:
            'the kernel advertises it; this console has no surface bound to it yet',
        };
  });
}

/**
 * Capabilities this build knows about that the kernel did NOT advertise.
 *
 * The inverse question — "this console has a panel for that, why is it not
 * here" — is the one a missing capability actually causes, and it cannot be
 * answered from the advertised list alone.
 */
export function missingCapabilities(
  capabilities: readonly string[],
): CapabilitySurface[] {
  const advertised = new Set(capabilities);
  return Object.entries(KNOWN)
    .filter(([capability, spec]) => spec.gatesSurface && !advertised.has(capability))
    .map(([capability, rest]) => ({ capability, ...rest }));
}
