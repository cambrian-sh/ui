/* Sample data for the browser mock (`VITE_USE_MOCK_IPC=1`).
 *
 * One coherent story — a small finance-operations team running Cambrian — so
 * every screen has believable content and the screens agree with each other:
 * the agent that holds a refund in the Inbox is the one in Agents, Scope and
 * the Audit log. Unit tests do not use this file; they start from the bare
 * state in mock.ts and seed what they assert on.
 *
 * Scenarios (edge states for design review) are chosen with
 * `localStorage['cambrian-studio:mock-scenario']` or `?scenario=` in the URL:
 *   populated (default) · empty · degraded · viewer · disconnected
 */
import type * as t from './types';

export type MockScenario = 'populated' | 'empty' | 'degraded' | 'viewer' | 'disconnected';

export const SCENARIOS: MockScenario[] = ['populated', 'empty', 'degraded', 'viewer', 'disconnected'];

const SCENARIO_KEY = 'cambrian-studio:mock-scenario';

export function readScenario(): MockScenario {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('scenario');
    if (fromUrl && (SCENARIOS as string[]).includes(fromUrl)) {
      localStorage.setItem(SCENARIO_KEY, fromUrl);
      return fromUrl as MockScenario;
    }
    const stored = localStorage.getItem(SCENARIO_KEY);
    if (stored && (SCENARIOS as string[]).includes(stored)) return stored as MockScenario;
  } catch {
    /* no storage — fall through */
  }
  return 'populated';
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const agoMs = (ms: number) => Date.now() - ms;

export const ALL_CAPABILITIES = [
  'audit',
  'scope',
  'memory_tag',
  'hitl_resolve',
  'memory-read',
  'memory-ingest',
  'memory-ingest-binary',
  'memory-answer',
  'chat',
  'watches-read',
  'kernel-logs',
  'access-policy',
  'telegram-ingress',
  'record-lane',
  'ingress-studio',
  'substrate-query',
  'links',
];

// ---------------------------------------------------------------------------
// State of record
// ---------------------------------------------------------------------------

export function scenarioState(base: t.StateOfRecord, scenario: MockScenario): t.StateOfRecord {
  if (scenario === 'empty') {
    return { ...base, capabilities: ALL_CAPABILITIES, kernel_version: '0.6.10-alpha', contract_version: '0095' };
  }
  const populated = populatedState(base);
  switch (scenario) {
    case 'degraded':
      return {
        ...populated,
        contract_skew: 1,
        cost_dashboard: {
          ...populated.cost_dashboard,
          circuit_breakers: [
            ...populated.cost_dashboard.circuit_breakers.slice(1),
            { model_id: 'openrouter/qwen3-235b', state: 'err', reason: '5 consecutive 429 responses' },
          ],
        },
      };
    case 'viewer':
      return { ...populated, role: 'viewer' };
    case 'disconnected':
      return {
        ...populated,
        connection: {
          status: 'reconnecting',
          endpoint: 'cambrian.example.com:50051',
          last_known_state_at: ago(3 * MIN),
          reason: 'connection reset by peer',
        },
      };
    default:
      return populated;
  }
}

function populatedState(base: t.StateOfRecord): t.StateOfRecord {
  return {
    ...base,
    connection: {
      status: 'live',
      endpoint: 'localhost:50051',
      last_known_state_at: ago(0),
      reason: null,
    },
    role: 'operator',
    kernel_version: '0.6.10-alpha',
    contract_version: '0095',
    capabilities: ALL_CAPABILITIES,
    cursor: 18_342,
    sessions: [
      {
        session_id: 'session-1',
        title: 'Review customer refund ledger for duplicates',
        state: 'active',
        created_at: ago(42 * MIN),
        last_activity_at: ago(20_000),
        plan_count: 1,
        agent_mix: ['cognitive-analyst'],
        cost: 0.22,
      },
      {
        session_id: 'session-2',
        title: 'Prepare weekly operations brief',
        state: 'paused',
        created_at: ago(3 * HOUR),
        last_activity_at: ago(2 * HOUR),
        plan_count: 1,
        agent_mix: ['model-summarizer'],
        cost: 0.09,
      },
      {
        session_id: 'session-3',
        title: 'Archive completed supplier contracts',
        state: 'completed',
        created_at: ago(DAY),
        last_activity_at: ago(20 * HOUR),
        plan_count: 1,
        agent_mix: ['daemon-archiver'],
        cost: 0.04,
      },
      {
        session_id: 'session-4',
        title: 'Reconcile September card statements',
        state: 'active',
        created_at: ago(15 * MIN),
        last_activity_at: ago(5_000),
        plan_count: 1,
        agent_mix: ['cognitive-analyst', 'model-summarizer'],
        cost: 0.31,
      },
    ],
    plans: [
      {
        plan_id: 'plan-1',
        session_id: 'session-1',
        subject: 'Review customer refund ledger for duplicates',
        step_count: 4,
        active_agent: 'cognitive-analyst',
        status: 'running',
        elapsed_ms: 92_000,
        cost: 0.22,
        started_at: ago(92_000),
        steps: [
          { index: 0, label: 'Read the refund ledger', depends_on: [], is_thought: false, status: 'done', agent: 'cognitive-analyst', required_capabilities: ['read:ledger'] },
          { index: 1, label: 'Find duplicate refunds', depends_on: [0], is_thought: false, status: 'running', agent: 'cognitive-analyst', required_capabilities: ['query:ledger'] },
          { index: 2, label: 'Draft findings with evidence', depends_on: [1], is_thought: false, status: 'pending', agent: null, required_capabilities: ['write:report'] },
          { index: 3, label: 'Verify evidence', depends_on: [2], is_thought: false, status: 'pending', agent: null, required_capabilities: ['verify'] },
        ],
      },
      {
        plan_id: 'plan-2',
        session_id: 'session-2',
        subject: 'Prepare weekly operations brief',
        step_count: 3,
        active_agent: null,
        status: 'paused',
        elapsed_ms: 120_000,
        cost: 0.09,
        started_at: ago(2 * HOUR),
      },
      {
        plan_id: 'plan-4',
        session_id: 'session-4',
        subject: 'Reconcile September card statements',
        step_count: 5,
        active_agent: 'model-summarizer',
        status: 'running',
        elapsed_ms: 410_000,
        cost: 0.31,
        started_at: ago(410_000),
      },
    ],
    pending_hitl: [
      {
        intervention_id: 'hitl-1',
        plan_id: 'plan-1',
        step_id: 'step-2',
        agent_id: 'cognitive-analyst',
        nature: 'approval_request',
        proposed_action: { tool: 'issue-refund', customer: 'C-20931', amount: 184.25, currency: 'EUR' },
        intended_action: { tool: 'issue-refund' },
        reason: 'This refund looks like a duplicate of R-88213. Issuing it needs your approval.',
        raised_at: ago(6 * MIN),
      },
      {
        intervention_id: 'hitl-2',
        plan_id: 'plan-4',
        step_id: 'step-3',
        agent_id: 'model-summarizer',
        nature: 'dangerous_tool',
        proposed_action: { tool: 'send-email', to: 'billing@acme-logistics.example', subject: 'Statement mismatch, 1–3 September' },
        intended_action: { tool: 'send-email' },
        reason: 'send-email is marked dangerous: it writes outside the organisation.',
        raised_at: ago(90_000),
      },
    ],
    agents: [
      {
        id: 'cognitive-analyst',
        trait: 'Cognitive',
        scope_summary: 'read:ledger, write:reports',
        trust_score: 0.92,
        last_activity_at: ago(20_000),
        last_state: 'ready',
        capabilities: ['read:ledger', 'query:ledger', 'write:report'],
        description: 'Reviews financial records and prepares evidence-backed findings.',
        runtime: 'python',
        manifest_version: '1.4.0',
        provisional: false,
        system: false,
      },
      {
        id: 'model-summarizer',
        trait: 'Model',
        scope_summary: 'read:operations',
        trust_score: 0.78,
        last_activity_at: ago(5_000),
        last_state: 'busy',
        capabilities: ['summarize', 'read-statement'],
        description: 'Summarizes operational material into short briefs.',
        runtime: 'llm',
        manifest_version: '0.9.2',
        provisional: true,
        system: false,
      },
      {
        id: 'daemon-archiver',
        trait: 'Daemon',
        scope_summary: 'read:contracts, write:archive',
        trust_score: 0.99,
        last_activity_at: ago(20 * HOUR),
        last_state: 'dormant',
        capabilities: ['archive'],
        description: 'Moves completed contracts into the archive.',
        runtime: 'daemon',
        manifest_version: '2.0.1',
        provisional: false,
        system: true,
      },
      {
        id: 'telegram-concierge',
        trait: 'Model',
        scope_summary: 'read:public, read:faq',
        trust_score: 0.86,
        last_activity_at: ago(12 * MIN),
        last_state: 'ready',
        capabilities: ['answer', 'search:faq'],
        description: 'Answers questions that arrive on the team Telegram bot.',
        runtime: 'llm',
        manifest_version: '1.1.0',
        provisional: false,
        system: false,
      },
    ],
    tools: [
      { id: 'query-ledger', description: 'Search the refund ledger and return matching entries.', danger: false, granted_agent_count: 2, recent_invocation_count: 14, last_cost: 0.003, classification_tags: ['finance'], effects: ['read'] },
      { id: 'issue-refund', description: 'Issue a refund against an existing customer charge.', danger: true, granted_agent_count: 1, recent_invocation_count: 2, last_cost: 0.04, classification_tags: ['finance', 'payments'], effects: ['write', 'spend'], effects_inferred: true },
      { id: 'read-statement', description: 'Read a card or bank statement by period.', danger: false, granted_agent_count: 2, recent_invocation_count: 31, last_cost: 0.001, classification_tags: ['finance'], effects: ['read'] },
      { id: 'send-email', description: 'Send an email from the operations mailbox.', danger: true, granted_agent_count: 0, recent_invocation_count: 0, last_cost: 0, classification_tags: ['external'], effects: ['write', 'external'] },
    ],
    skills: [
      { id: 'refund-review', description: 'Review and cite evidence for duplicate refunds.', scope_tags: ['finance'], loaded_in_count: 1, last_loaded_at: ago(42 * MIN) },
      { id: 'weekly-brief', description: 'Assemble the weekly operations brief.', scope_tags: ['operations'], loaded_in_count: 2, last_loaded_at: ago(3 * HOUR) },
    ],
    scope: {
      'cognitive-analyst': { agent_id: 'cognitive-analyst', effective_scope_summary: 'read:ledger, write:reports', default_write_tags: ['reports'], last_scope_change_at: ago(5 * DAY) },
      'model-summarizer': { agent_id: 'model-summarizer', effective_scope_summary: 'read:operations', default_write_tags: [], last_scope_change_at: ago(2 * DAY) },
      'telegram-concierge': { agent_id: 'telegram-concierge', effective_scope_summary: 'read:public, read:faq', default_write_tags: [], last_scope_change_at: ago(9 * DAY) },
    },
    audit_tail: [
      { entry_id: 'audit-1', timestamp: ago(30 * MIN), actor_id: 'doruk', actor_role: 'operator', target_kind: 'tool', target_id: 'issue-refund', action_type: 'set_grant', status: 'applied', reason: 'Approved refund review pilot.', kind: 'config' },
      { entry_id: 'audit-2', timestamp: ago(2 * HOUR), actor_id: 'doruk', actor_role: 'operator', target_kind: 'session', target_id: 'session-2', action_type: 'pause', status: 'applied', reason: 'Hold until the operations brief is reviewed.', kind: 'runtime' },
      { entry_id: 'audit-3', timestamp: ago(3 * HOUR), actor_id: 'cognitive-analyst', actor_role: 'operator', target_kind: 'tool', target_id: 'issue-refund', action_type: 'invoke', status: 'denied', reason: 'Policy requires operator approval for refunds.', kind: 'data' },
      { entry_id: 'audit-4', timestamp: ago(5 * HOUR), actor_id: 'ayse', actor_role: 'operator', target_kind: 'policy', target_id: 'finance-readers', action_type: 'save_policy', status: 'applied', reason: 'Finance team can read ledger documents.', kind: 'config' },
    ],
    watch_configs: [
      { id: 'watch-1', target_streams: ['telegram', 'schedule'], last_fire_at: ago(12 * MIN), last_fire_status: 'ok', error_count: 0 },
      { id: 'watch-2', target_streams: ['ingress:acme-webhook'], last_fire_at: ago(3 * HOUR), last_fire_status: 'error', error_count: 2 },
    ],
    lifecycle: {
      ...base.lifecycle,
      scheduler_state: 'running',
      pending_jobs: 2,
      last_consolidation: { timestamp: ago(6 * HOUR), duration_ms: 48_000, status: 'completed' },
    },
    verifier_pool: {
      ...base.verifier_pool,
    },
    cost_dashboard: {
      ...base.cost_dashboard,
      spend_rate_usd: 0.87,
      circuit_breakers: [
        { model_id: 'claude-sonnet-5-5', state: 'ok', reason: '' },
        { model_id: 'qwen3:14b', state: 'ok', reason: '' },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Reactive pipelines (watches)
// ---------------------------------------------------------------------------

export const watchConfigsFull: t.WatchConfigFull[] = [
  {
    id: 'watch-1',
    name: 'Answer FAQ questions on Telegram',
    description: 'When someone asks the team bot a question, look it up in the FAQ and reply.',
    source_type: 'stream',
    source_stream_id: 'telegram',
    condition: 'message.text != ""',
    condition_type: 'cel',
    daemon_params: {},
    action: { type: 'plan', target_type: 'agent', target: 'telegram-concierge', payload: 'Answer: {{message.text}}' },
    active: true,
    response_mode: 'reply',
    max_concurrent_plans: 3,
    debounce_seconds: 0,
    condition_payload_keys: ['message.text'],
    approved: true,
    dry_run: false,
    source_cron: '',
    source_timezone: '',
    missed_fire_policy: '',
  },
  {
    id: 'watch-2',
    name: 'Flag large refunds from the webhook',
    description: 'Raise a review task when the payment webhook reports a refund over €500.',
    source_type: 'stream',
    source_stream_id: 'ingress:acme-webhook',
    condition: 'event.type == "refund" && event.amount > 500',
    condition_type: 'cel',
    daemon_params: {},
    action: { type: 'plan', target_type: 'agent', target: 'cognitive-analyst', payload: 'Review refund {{event.id}}' },
    active: true,
    response_mode: 'task',
    max_concurrent_plans: 1,
    debounce_seconds: 30,
    condition_payload_keys: ['event.type', 'event.amount'],
    approved: true,
    dry_run: false,
    source_cron: '',
    source_timezone: '',
    missed_fire_policy: '',
  },
  {
    id: 'watch-3',
    name: 'Monday operations brief',
    description: 'Every Monday at 08:00, draft the weekly operations brief.',
    source_type: 'schedule',
    source_stream_id: 'schedule',
    condition: 'true',
    condition_type: 'cel',
    daemon_params: {},
    action: { type: 'plan', target_type: 'agent', target: 'model-summarizer', payload: 'Draft the weekly operations brief' },
    active: false,
    response_mode: 'task',
    max_concurrent_plans: 1,
    debounce_seconds: 0,
    condition_payload_keys: [],
    approved: false,
    dry_run: true,
    source_cron: '0 8 * * 1',
    source_timezone: 'Europe/Istanbul',
    missed_fire_policy: 'fire_once',
  },
];

export const watchMetrics: t.WatchMetrics[] = [
  { watch_id: 'watch-1', signals_seen: 412, condition_fired: 388, condition_suppressed: 24, dry_run_would_fire: 0, action_failed: 1, dead_lettered: 0, mean_condition_latency_ms: 3.2 },
  { watch_id: 'watch-2', signals_seen: 1290, condition_fired: 7, condition_suppressed: 1283, dry_run_would_fire: 0, action_failed: 2, dead_lettered: 2, mean_condition_latency_ms: 1.4 },
  { watch_id: 'watch-3', signals_seen: 3, condition_fired: 0, condition_suppressed: 0, dry_run_would_fire: 3, action_failed: 0, dead_lettered: 0, mean_condition_latency_ms: 0.2 },
];

export const watchDeadLetters: t.WatchDeadLetter[] = [
  {
    id: 'dl-1',
    watch_id: 'watch-2',
    action_type: 'plan',
    key: 'refund-r-90121',
    reason: 'agent cognitive-analyst was busy for longer than the 5 minute admission window',
    signal_stream_id: 'ingress:acme-webhook',
    signal_raw_text: '{"type":"refund","id":"R-90121","amount":742.10}',
    failed_at_unix_ms: agoMs(3 * HOUR),
  },
  {
    id: 'dl-2',
    watch_id: 'watch-2',
    action_type: 'plan',
    key: 'refund-r-90188',
    reason: 'agent cognitive-analyst was busy for longer than the 5 minute admission window',
    signal_stream_id: 'ingress:acme-webhook',
    signal_raw_text: '{"type":"refund","id":"R-90188","amount":1210.00}',
    failed_at_unix_ms: agoMs(3 * HOUR - 4 * MIN),
  },
];

export const backtestVerdicts: t.WatchBacktestVerdict[] = [
  { seq: 18_101, stream_id: 'ingress:acme-webhook', raw_text: '{"type":"refund","amount":742.10}', would_fire: true, eval_error: '' },
  { seq: 18_102, stream_id: 'ingress:acme-webhook', raw_text: '{"type":"charge","amount":19.00}', would_fire: false, eval_error: '' },
  { seq: 18_140, stream_id: 'ingress:acme-webhook', raw_text: '{"type":"refund","amount":44.00}', would_fire: false, eval_error: '' },
  { seq: 18_177, stream_id: 'ingress:acme-webhook', raw_text: '{"type":"refund"}', would_fire: false, eval_error: 'no such key: amount' },
];

export const pipelineGraphJson = JSON.stringify({
  nodes: [
    { id: 'source', kind: 'ingress', ref: 'acme-webhook' },
    { id: 'filter', kind: 'filter', expr: 'event.type == "refund"' },
    { id: 'store', kind: 'memory_write', tags: ['finance', 'payments'] },
  ],
  edges: [
    { from: 'source', to: 'filter' },
    { from: 'filter', to: 'store' },
  ],
});

export const nodeItems: t.NodeItem[] = [
  { run_id: 'run-77', item_key: 'R-90121', state: 'done', attempt: 1, input_json: '{"type":"refund","amount":742.10}', result_json: '{"doc_id":"doc-refund-90121"}', error: '', evidence_ref: 'ev-1121', updated_at: ago(3 * HOUR), iter_path: '' },
  { run_id: 'run-77', item_key: 'R-90188', state: 'done', attempt: 1, input_json: '{"type":"refund","amount":1210.00}', result_json: '{"doc_id":"doc-refund-90188"}', error: '', evidence_ref: 'ev-1122', updated_at: ago(3 * HOUR), iter_path: '' },
  { run_id: 'run-78', item_key: 'R-90201', state: 'failed', attempt: 3, input_json: '{"type":"refund"}', result_json: '', error: 'missing field: amount', evidence_ref: 'ev-1130', updated_at: ago(40 * MIN), iter_path: '' },
];

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const documents: t.DocumentSummary[] = [
  { id: 'doc-refund-policy', title: 'Refund policy 2026', source_type: 'file', tags: ['finance', 'policy'], chunk_count: 14, created_at_unix_ms: agoMs(12 * DAY) },
  { id: 'doc-ledger-sep', title: 'Refund ledger — September', source_type: 'file', tags: ['finance', 'payments'], chunk_count: 86, created_at_unix_ms: agoMs(5 * DAY) },
  { id: 'doc-ops-brief-41', title: 'Operations brief, week 41', source_type: 'agent', tags: ['operations', 'reports'], chunk_count: 9, created_at_unix_ms: agoMs(8 * DAY) },
  { id: 'doc-supplier-acme', title: 'Supplier contract — Acme Logistics', source_type: 'file', tags: ['contracts'], chunk_count: 32, created_at_unix_ms: agoMs(30 * DAY) },
  { id: 'doc-faq', title: 'Customer FAQ', source_type: 'url', tags: ['public', 'faq'], chunk_count: 21, created_at_unix_ms: agoMs(20 * DAY) },
  { id: 'doc-payroll-q3', title: 'Payroll summary Q3', source_type: 'file', tags: ['hr-confidential'], chunk_count: 6, created_at_unix_ms: agoMs(15 * DAY) },
  { id: 'doc-telegram-0412', title: 'Telegram thread with @mert_k', source_type: 'telegram', tags: [], chunk_count: 3, created_at_unix_ms: agoMs(2 * HOUR) },
];

export const tags: t.TagSpec[] = [
  { tag: 'finance', closed: true },
  { tag: 'payments', closed: true },
  { tag: 'hr-confidential', closed: true },
  { tag: 'contracts', closed: true },
  { tag: 'operations', closed: false },
  { tag: 'reports', closed: false },
  { tag: 'policy', closed: false },
  { tag: 'public', closed: false },
  { tag: 'faq', closed: false },
];

// ---------------------------------------------------------------------------
// Scope & Access
// ---------------------------------------------------------------------------

export const principals: t.PrincipalSpec[] = [
  { id: 'doruk', kind: 'human', display_name: 'Doruk', sources: ['operator'], group_ids: ['finance-team', 'ops-team'], has_direct_policy: false, orphaned: false },
  { id: 'ayse', kind: 'human', display_name: 'Ayşe Demir', sources: ['operator'], group_ids: ['finance-team'], has_direct_policy: false, orphaned: false },
  { id: 'mert', kind: 'human', display_name: 'Mert Kaya', sources: ['telegram'], group_ids: ['ops-team'], has_direct_policy: true, orphaned: false },
  { id: 'cognitive-analyst', kind: 'agent', display_name: 'cognitive-analyst', sources: ['manifest'], group_ids: ['finance-team'], has_direct_policy: false, orphaned: false },
  { id: 'model-summarizer', kind: 'agent', display_name: 'model-summarizer', sources: ['manifest'], group_ids: ['ops-team'], has_direct_policy: false, orphaned: false },
  { id: 'telegram-concierge', kind: 'agent', display_name: 'telegram-concierge', sources: ['manifest'], group_ids: [], has_direct_policy: true, orphaned: false },
  { id: 'guest-telegram', kind: 'guest', display_name: 'Telegram guest', sources: ['telegram'], group_ids: [], has_direct_policy: true, orphaned: false },
  { id: 'old-intern', kind: 'human', display_name: 'old-intern', sources: [], group_ids: [], has_direct_policy: true, orphaned: true },
];

export const groups: t.GroupSpec[] = [
  { id: 'finance-team', name: 'Finance team', members: ['doruk', 'ayse', 'cognitive-analyst'], subgroups: [], block_inheritance: false },
  { id: 'ops-team', name: 'Operations team', members: ['doruk', 'mert', 'model-summarizer'], subgroups: [], block_inheritance: false },
];

const rule = (r: Partial<t.ScopeRule>): t.ScopeRule => ({
  required_tags: [],
  any_of_tags: [],
  forbidden_tags: [],
  granted_tags: [],
  party_scoped_tags: [],
  ...r,
});

export const policies: t.PolicySpec[] = [
  { id: 'finance-readers', name: 'Finance can read ledgers', version: 3, rule: rule({ granted_tags: ['finance', 'payments'] }), effects: { allow: ['read'], deny: [] }, mode: 'enforce', expires_at_unix_ms: 0, granted_by: 'ayse', updated_at_unix_ms: agoMs(5 * HOUR) },
  { id: 'no-hr-for-agents', name: 'Agents never see HR files', version: 1, rule: rule({ forbidden_tags: ['hr-confidential'] }), effects: { allow: [], deny: ['read', 'write'] }, mode: 'enforce', expires_at_unix_ms: 0, granted_by: 'doruk', updated_at_unix_ms: agoMs(20 * DAY) },
  { id: 'public-only-guests', name: 'Guests see public material only', version: 2, rule: rule({ required_tags: ['public'] }), effects: { allow: ['read'], deny: ['write'] }, mode: 'enforce', expires_at_unix_ms: 0, granted_by: 'doruk', updated_at_unix_ms: agoMs(9 * DAY) },
  { id: 'ops-reports', name: 'Operations can write reports', version: 1, rule: rule({ granted_tags: ['operations', 'reports'] }), effects: { allow: ['read', 'write'], deny: [] }, mode: 'report_only', expires_at_unix_ms: 0, granted_by: 'doruk', updated_at_unix_ms: agoMs(2 * DAY) },
];

export const links: t.LinkSpec[] = [
  { policy_id: 'finance-readers', container_kind: 'group', target_id: 'finance-team', enforced: true, order: 0, expires_at_unix_ms: 0, granted_by: 'ayse' },
  { policy_id: 'no-hr-for-agents', container_kind: 'organisation', target_id: 'org', enforced: true, order: 0, expires_at_unix_ms: 0, granted_by: 'doruk' },
  { policy_id: 'public-only-guests', container_kind: 'principal', target_id: 'guest-telegram', enforced: true, order: 0, expires_at_unix_ms: 0, granted_by: 'doruk' },
  { policy_id: 'ops-reports', container_kind: 'group', target_id: 'ops-team', enforced: false, order: 1, expires_at_unix_ms: 0, granted_by: 'doruk' },
];

const contribution = (policy: t.PolicySpec, term: string, values: string[]): t.PolicyContribution => ({
  policy_id: policy.id,
  policy_name: policy.name,
  linked_at: 'group:finance-team',
  term,
  values,
  enforced: true,
});

export const resultantPolicy: t.ResultantPolicy = {
  effective: rule({ granted_tags: ['finance', 'payments'], forbidden_tags: ['hr-confidential'] }),
  any_of_clauses: [],
  contributions: [
    contribution(policies[0], 'granted_tags', ['finance', 'payments']),
    { ...contribution(policies[1], 'forbidden_tags', ['hr-confidential']), linked_at: 'organisation' },
  ],
  effects: { allow: ['read'], deny: ['write'] },
  policy_version: 'v42',
  unsatisfiable_reason: '',
  groups: ['finance-team'],
  row_scope_note: '',
  party_identities: [],
};

export const decisions: t.DecisionRecord[] = [
  { at_unix_ms: agoMs(3 * HOUR), principal: 'cognitive-analyst', surface: 'agent', resource: 'tool:issue-refund', allowed: false, reason: 'effect_not_permitted', detail: 'spend is not an allowed effect', policy_version: 'v42', report_only: false, would_have_denied: false, decided_by: [contribution(policies[0], 'effects', ['read'])] },
  { at_unix_ms: agoMs(2 * HOUR), principal: 'guest-telegram', surface: 'telegram', resource: 'doc:doc-ledger-sep', allowed: false, reason: 'missing_required_tag', detail: 'requires tag public', policy_version: 'v42', report_only: false, would_have_denied: false, decided_by: [contribution(policies[2], 'required_tags', ['public'])] },
  { at_unix_ms: agoMs(50 * MIN), principal: 'mert', surface: 'telegram', resource: 'doc:doc-ops-brief-41', allowed: true, reason: 'allowed', detail: '', policy_version: 'v42', report_only: true, would_have_denied: true, decided_by: [contribution(policies[3], 'granted_tags', ['operations'])] },
  { at_unix_ms: agoMs(20 * MIN), principal: 'ayse', surface: 'studio', resource: 'doc:doc-ledger-sep', allowed: true, reason: 'allowed', detail: '', policy_version: 'v42', report_only: false, would_have_denied: false, decided_by: [contribution(policies[0], 'granted_tags', ['finance'])] },
];

export const simulation: t.SimulationResult = {
  decisions: [
    { principal: 'mert', surface: 'telegram', resource: 'doc:doc-ops-brief-41', tags: ['operations'], allowed_now: true, allowed_under_draft: false, reason_under_draft: 'missing_required_tag', detail_under_draft: 'requires tag public', at_unix_ms: agoMs(50 * MIN) },
    { principal: 'ayse', surface: 'studio', resource: 'doc:doc-ledger-sep', tags: ['finance'], allowed_now: true, allowed_under_draft: true, reason_under_draft: 'allowed', detail_under_draft: '', at_unix_ms: agoMs(20 * MIN) },
  ],
  newly_denied: 1,
  newly_allowed: 0,
  unchanged: 41,
  row_scope_note: '',
};

// ---------------------------------------------------------------------------
// Ingress: Telegram, identity, Ingress Studio
// ---------------------------------------------------------------------------

export const telegramBots: t.TelegramBot[] = [
  { id: 'team', label: 'Team bot', surface: 'telegram:team', agent_id: 'telegram-concierge', token_configured: true, enabled: true, running: true, bot_username: 'acme_ops_bot', state: 'running', detail: 'Polling, last update 12 seconds ago', surface_registered: true },
  { id: 'support', label: 'Customer support', surface: 'telegram:support', agent_id: 'telegram-concierge', token_configured: false, enabled: false, running: false, bot_username: '', state: 'needs_token', detail: 'Add a bot token from @BotFather to start', surface_registered: false },
];

export const identityBindings: t.IdentityBinding[] = [
  { surface: 'telegram:team', external_id: '50211873', username: 'mert_k', display_name: 'Mert Kaya', bound_to_kind: 'principal', bound_to_id: 'mert', bound_at_unix_ms: agoMs(9 * DAY), username_changed_from: '', blocked: false },
  { surface: 'telegram:team', external_id: '50999120', username: 'ayse_d', display_name: 'Ayşe', bound_to_kind: 'principal', bound_to_id: 'ayse', bound_at_unix_ms: agoMs(6 * DAY), username_changed_from: 'aysedemir', blocked: false },
];

export const unboundSenders: t.UnboundSender[] = [
  { surface: 'telegram:team', external_id: '61200455', username: 'selin_ops', display_name: 'Selin', message_count: 4, first_seen_unix_ms: agoMs(DAY), last_seen_unix_ms: agoMs(25 * MIN), speaker_ids: [] },
  { surface: 'telegram:team', external_id: '70011001', username: '', display_name: 'Unknown', message_count: 1, first_seen_unix_ms: agoMs(3 * HOUR), last_seen_unix_ms: agoMs(3 * HOUR), speaker_ids: [] },
];

export const ingressActivity: t.IngressActivity[] = [
  { surface: 'telegram:team', principal: 'mert', resource: 'doc:doc-faq', outcome: 'answered', reason: '', at_unix_ms: agoMs(12 * MIN), external_id: '50211873', text: 'What is our refund window for EU customers?', message_count: 2, conversation_id: 'conv-1' },
  { surface: 'telegram:team', principal: 'guest-telegram', resource: 'doc:doc-ledger-sep', outcome: 'policy_denied', reason: 'missing_required_tag', at_unix_ms: agoMs(2 * HOUR), external_id: '70011001', text: 'show me the refund ledger', message_count: 1, conversation_id: 'conv-2' },
  { surface: 'telegram:team', principal: 'selin', resource: '', outcome: 'no_reply', reason: 'sender not bound', at_unix_ms: agoMs(25 * MIN), external_id: '61200455', text: 'hi, can you check the supplier invoice?', message_count: 1, conversation_id: 'conv-3' },
];

export const ingresses: t.IngressSpec[] = [
  { agent_id: 'telegram-concierge', surface_kind: 'telegram', surface_id: 'team', namespace: ['faq', 'public'] },
];

export const studioIngresses: t.StudioIngress[] = [
  { ingress_id: 'acme-webhook', display_name: 'Acme payments webhook', state: 'armed', health: 'healthy', pinned_release: 'rel-3' },
  { ingress_id: 'supplier-feed', display_name: 'Supplier invoices feed', state: 'draft', health: 'unknown', pinned_release: '' },
];

export const studioFailures: t.StudioFailure[] = [
  { evidence_id: 'ev-1130', delivery_ref: 'dlv-5521', mapping_revision: 3, outcome: 'mapping_error', detail: 'field amount missing in payload', finished_at: ago(40 * MIN) },
];

export const discovery: t.DiscoverySession = {
  ok: true,
  error: '',
  session_id: 'disc-1',
  outcome: 'needs_answers',
  reason: '',
  findings: [
    { field: 'protocol', proposed_value: 'https polling', status: 'confirmed', confidence: 0.97, rule_id: 'r-proto', evidence_refs: ['req-1'], explanation: 'The endpoint answers GET with JSON and no streaming headers.', observed_at: ago(10 * MIN), bounds_min: 0, bounds_max: 0 },
    { field: 'cadence_seconds', proposed_value: '300', status: 'proposed', confidence: 0.71, rule_id: 'r-cadence', evidence_refs: ['req-2', 'req-3'], explanation: 'New invoices appeared roughly every 5 minutes across 3 samples.', observed_at: ago(9 * MIN), bounds_min: 120, bounds_max: 900 },
  ],
  gaps: [{ field: 'cursor_path', why: 'No stable ordering field found yet.', refusal: false }],
  questions: [
    { id: 'q-1', shape: 'choice', prompt: 'Which field should mark where the feed left off?', options: ['invoice.updated_at', 'invoice.id'], path: 'cursor_path', status: 'open', asked_at_revision: 1, version: 1, from_untrusted: false, auth_scheme_ref: '' },
  ],
  proposal: { revision: 1, archetype: 'paginated_collection', protocol: 'https', format: 'json', cadence_seconds: 300, cadence_because: 'observed arrival rate', collection_root: '$.invoices', cursor_path: '', cursor_param: 'since', auth_scheme_ref: 'bearer' },
  pending_origins: [],
  requests_used: 6,
  model_calls_used: 3,
  running: false,
  steps: [
    { n: 1, action: 'fetch', summary: 'GET /invoices returned 25 items', refusal: '', observed_ref: 'req-1', at: ago(11 * MIN), in_flight: false },
    { n: 2, action: 'infer', summary: 'Proposed polling every 5 minutes', refusal: '', observed_ref: 'req-2', at: ago(9 * MIN), in_flight: false },
  ],
};

// ---------------------------------------------------------------------------
// Record lane (drift)
// ---------------------------------------------------------------------------

export const alerts: t.Alert[] = [
  {
    id: 1,
    kind: 'commitment_slip',
    record_key: 'PO-1182',
    owner: 'Acme Logistics',
    speaker: 'mert',
    message_id: 'tg-50211873-881',
    delta_days: 6,
    promised: '2026-10-10',
    recorded: '2026-10-16',
    slip_count: 2,
    text: 'Acme Logistics promised delivery for PO-1182 on 10 Oct; the record now says 16 Oct.',
    citations: [
      { index: 1, kind: 'message', ref: 'tg-50211873-881', quote: 'they confirmed the 10th for PO-1182', at: ago(9 * DAY), version_id: 1 },
      { index: 2, kind: 'record', ref: 'PO-1182', quote: 'expected_delivery: 2026-10-16', at: ago(2 * DAY), version_id: 4 },
    ],
    tags: ['contracts'],
    raised_at: ago(2 * DAY),
    detect_latency_ms: 840,
  },
];

export const driftStats: t.DriftStats = {
  consistent: 212,
  drift: 3,
  refused: 4,
  unresolved: [
    { reason: 'no matching record', count: 6 },
    { reason: 'ambiguous date', count: 2 },
  ],
  total: 227,
  available: true,
};

export const refusals: t.Refusal[] = [
  { id: 1, at: ago(DAY), kind: 'record', ref: 'PO-1190', boundary: ['hr-confidential'], reason: 'Record carries a tag outside the lane boundary.' },
];

export const retentionRuns: t.RetentionRunEvent[] = [
  { source: 'telegram', run_id: 14, started_at: ago(6 * HOUR), finished_at: ago(6 * HOUR - 4_000), deleted: [{ category: 'messages', count: 118 }], bounded: true, error: '' },
];

export const coverage: t.SourceCoverage[] = [
  { source: 'telegram', connector: 'telegram-ingress', invited_channels: ['team'], channel_count: 1, plan_tier: 'bot', retention_horizon_days: 30, horizon_unlimited: false, discovery_api: false, limits: ['bots only see messages after they join'], reported_at: ago(HOUR) },
];

export const pushStatus: t.KindPushStatus[] = [
  { kind: 'purchase_order', last_push_id: 'push-881', transport: 'grpc', record_count: 340, received_at: ago(2 * HOUR), live_records: 338 },
];

// ---------------------------------------------------------------------------
// Settings: models, MCP, telemetry
// ---------------------------------------------------------------------------

export const generators: t.GeneratorSpec[] = [
  {
    id: 'claude',
    protocol: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    timeout_ms: 60_000,
    capability_tags: ['planning', 'verification'],
    native_tools: true,
    disable_thinking: false,
    breaker: 'closed',
    recent_failures: 0,
    p50_latency_ms: 1840,
    p99_latency_ms: 6200,
    tokens_today: 412_880,
    calls_today: 214,
    latency_samples: [1500, 1700, 1900, 1650, 2100, 1800, 2400, 1750, 1600, 1950],
    key_configured: true,
    key_last_four: 'Qa9f',
    key_source: 'keychain',
    key_added_at: ago(30 * DAY),
    key_last_used_at: ago(20_000),
    last_tested_at: ago(DAY),
    last_test_ok: true,
  },
  {
    id: 'local-qwen',
    protocol: 'openai',
    endpoint: 'http://localhost:11434/v1',
    model: 'qwen3:14b',
    timeout_ms: 120_000,
    capability_tags: ['routing', 'memory'],
    native_tools: false,
    disable_thinking: true,
    breaker: 'closed',
    recent_failures: 1,
    p50_latency_ms: 950,
    p99_latency_ms: 4100,
    tokens_today: 98_100,
    calls_today: 640,
    latency_samples: [800, 900, 1100, 950, 1000, 870, 3900, 920, 990, 940],
    key_configured: false,
    key_last_four: '',
    key_source: '',
    key_added_at: '',
    key_last_used_at: '',
    last_tested_at: ago(3 * DAY),
    last_test_ok: true,
  },
];

export const roleAssignments: t.RoleAssignment[] = [
  { role: 'planner', generator_id: 'claude' },
  { role: 'verifier', generator_id: 'claude' },
  { role: 'router', generator_id: 'local-qwen' },
  { role: 'interview', generator_id: 'claude' },
  { role: 'memory', generator_id: 'local-qwen' },
];

export const mcpServers: t.MCPServerConfig[] = [
  { id: 'filesystem', transport: 'stdio', endpoint: 'reference-fs-mcp', args: ['--root', '/srv/shared'], auth_type: 'none', auth_header: '', classification_tags: ['internal'], connected: true, last_error: '', tool_count: 6, token_configured: false, token_source: '' },
  { id: 'linear', transport: 'http', endpoint: 'https://mcp.linear.app/mcp', args: [], auth_type: 'bearer', auth_header: 'Authorization', classification_tags: ['external'], connected: false, last_error: '401 Unauthorized — token expired', tool_count: 0, token_configured: true, token_source: 'keychain' },
];

export const telemetry: t.TelemetryConfig = {
  host: 'https://cloud.langfuse.com',
  project: 'cambrian-ops',
  public_key_configured: true,
  public_key_last_four: '7c1e',
  secret_key_configured: true,
  sample_rate: 0.25,
  send_structure_and_timings: true,
  send_prompts_and_outputs: false,
  send_from_enforcing_surfaces: false,
};

// ---------------------------------------------------------------------------
// Identity plane links
// ---------------------------------------------------------------------------

export const linkCandidates: t.Link[] = [
  {
    id: 'link-1',
    namespace_id: 'default',
    family: 'identity',
    from_ref: 'telegram:50211873',
    to_ref: 'principal:mert',
    relation: 'same_person',
    state: 'candidate',
    mechanism: 'username_match',
    producer: 'identity-linker',
    confidence: 0.91,
    evidence_id: 'ev-2201',
    asserted_by: 'identity-linker',
    asserted_at_unix_ms: agoMs(5 * HOUR),
    recorded_at_unix_ms: agoMs(5 * HOUR),
    valid_from_unix_ms: agoMs(5 * HOUR),
    valid_to_unix_ms: 0,
    retracted_at_unix_ms: 0,
    source_ref: 'telegram:team',
  },
  {
    id: 'link-2',
    namespace_id: 'default',
    family: 'entity',
    from_ref: 'record:PO-1182',
    to_ref: 'org:acme-logistics',
    relation: 'supplier_of',
    state: 'candidate',
    mechanism: 'llm_extraction',
    producer: 'record-lane',
    confidence: 0.64,
    evidence_id: 'ev-2240',
    asserted_by: 'record-lane',
    asserted_at_unix_ms: agoMs(2 * DAY),
    recorded_at_unix_ms: agoMs(2 * DAY),
    valid_from_unix_ms: agoMs(2 * DAY),
    valid_to_unix_ms: 0,
    retracted_at_unix_ms: 0,
    source_ref: 'doc-supplier-acme',
  },
];

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

const COMPONENTS = ['scheduler', 'router', 'memory', 'transport', 'policy', 'watch'];
const MESSAGES: [t.LogLevel, string, string][] = [
  ['info', 'scheduler', 'plan step started'],
  ['info', 'router', 'routed step to agent'],
  ['debug', 'memory', 'retrieved 8 chunks'],
  ['info', 'transport', 'operator subscribed to feed'],
  ['warn', 'policy', 'report-only policy would have denied read'],
  ['info', 'watch', 'condition fired'],
  ['error', 'watch', 'action dead-lettered: admission window exceeded'],
  ['info', 'scheduler', 'plan step completed'],
];

export function logRecords(count = 60): t.LogRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const [level, component, message] = MESSAGES[i % MESSAGES.length];
    return {
      seq: 9000 + i,
      at_unix_ms: agoMs((count - i) * 7_000),
      level,
      component: component || COMPONENTS[i % COMPONENTS.length],
      message,
      attrs: [
        { key: 'plan_id', kind: 'string', value: i % 2 ? 'plan-1' : 'plan-4', num: null },
        { key: 'latency_ms', kind: 'int', value: String(20 + ((i * 37) % 400)), num: 20 + ((i * 37) % 400) },
      ],
      boot_id: 'boot-7f3a',
      truncated: false,
    };
  });
}
