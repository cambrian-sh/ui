//! Generated gRPC clients + message types for the operator plane the UI speaks.
//!
//! Produced by `build.rs` (tonic-build) from the vendored protos. Do not edit by
//! hand; re-vendor + rebuild when a contract bumps.
//!
//! - `cambrian` — the pinned OSS `OperatorConsole` contract (`../proto/operator.proto`).
//! - The PREMIUM planes, each mounted on the same kernel server behind the same
//!   operator auth interceptors (ADR-0073/0088) and gated on its capability:
//!   [`authz`], [`telegram`], [`ingress`], [`substrate`], [`accounts`], [`org`] and
//!   [`telemetry`].

tonic::include_proto!("cambrian");

/// The premium access-policy administration plane (ADR-0085/0087).
///
/// The client is compiled in unconditionally; whether the SERVER exists is what
/// varies. A kernel without the policy plugin does not advertise
/// [`ACCESS_POLICY_CAPABILITY`], and every RPC here answers `Unimplemented` — so
/// the UI gates on the capability rather than probing and handling errors.
pub mod authz {
    tonic::include_proto!("cambrian.premium.authz");
}

/// The premium Telegram ingress plane (ADR-0090).
///
/// Present in the binary unconditionally; a kernel built without the telegram plugin
/// answers `Unimplemented`, which the UI surfaces as "not available" rather than an error.
pub mod telegram {
    tonic::include_proto!("cambrian.premium.telegram");
}

/// The premium telemetry (Langfuse) administration plane (contract 0078, PREM-0019),
/// behind Settings > Telemetry and the `telemetry-admin` capability.
pub mod telemetry {
    tonic::include_proto!("cambrian.premium.telemetry");
}

/// The premium Ingress Studio plane (ADR-0112 §13) — the full ingress
/// lifecycle: capture, draft, confirm, dry-run, arm, pause, repair, retire.
///
/// Compiled in unconditionally like every premium plane here. The capability
/// is reported post-Build (REC-02): a kernel without
/// Postgres or evidence capture is a CORRECT deployment that never advertises
/// it, and the surface stays hidden rather than broken.
pub mod ingress {
    tonic::include_proto!("cambrian.premium.ingress");
}

/// The premium knowledge-substrate plane (ADR-0118) — the NL ask box
/// (`AskKnowledge`: question → compiled AST + exact answer + guarantee, or a
/// named refusal), the closed query AST (`Query`), and the explore catalog
/// (`Overview` / `ListEntities`).
///
/// Compiled in unconditionally like every premium plane here. The capability
/// is reported post-Build (REC-02): a kernel with the
/// substrate plugin and no Postgres is a CORRECT deployment that never
/// advertises it, and the surface stays hidden rather than broken.
pub mod substrate {
    tonic::include_proto!("cambrian.premium.substrate");
}

/// The premium accounts plane (ADR-0141) — personal accounts for per-user
/// integrations: connect my account (OAuth sign-in hosted by the kernel),
/// list / disconnect / confirm mine, and operator list / revoke. It replaced
/// the six ADR-0140 RPCs that were briefly on `OperatorConsole`. Phase 2
/// (additive, vendored 2026-11-06): org accounts (List/Create/Update/Rotate/
/// Revoke/Bind/UnbindOrgAccount), provider OAuth clients
/// (List/Set/ClearProviderClient) and ConfirmMyAccount. Org OAuth install +
/// system catalog (additive, vendored 2026-11-06): StartOrgAccountInstall,
/// ListSystems, ListAccountConsumers, per-grant scope verdicts — gated on
/// [`ACCOUNTS_SYSTEMS_CAPABILITY`].
///
/// Compiled in unconditionally like every premium plane here; the console
/// surface is gated on [`ACCOUNTS_CAPABILITY`]. Called by `accounts.rs`
/// (Tauri commands `op_*account*`, ADR-0141 phase 4).
pub mod accounts {
    tonic::include_proto!("cambrian.premium.accounts");
}

/// The capability the kernel advertises when the accounts plugin is active.
pub const ACCOUNTS_CAPABILITY: &str = "accounts";

/// The capability the kernel advertises when the accounts plugin serves the
/// system catalog and org OAuth install (ListSystems et al.). Without it the
/// console derives systems itself (an older kernel).
pub const ACCOUNTS_SYSTEMS_CAPABILITY: &str = "accounts-systems";

/// The premium organisation-hierarchy plane (ADR-0142 stage 2): org units,
/// people and manager edges (the built-in editor's backend), directory groups,
/// mapping rules with a dry-run preview, approval escalation settings, SCIM
/// connections (token shown once) and the Keycloak reconcile status. Vendored
/// 2026-11-06 from `cambrian-premium/api/proto/org/org_directory.proto`.
///
/// Compiled in unconditionally like every premium plane here; the console
/// surface is gated on [`ORG_DIRECTORY_CAPABILITY`].
pub mod org {
    tonic::include_proto!("cambrian.premium.org");
}

/// The capability the kernel advertises when the org-directory plugin is active.
pub const ORG_DIRECTORY_CAPABILITY: &str = "org-directory";

/// The capability the kernel advertises when the access-policy plugin is active.
/// The UI renders the policy console only when the handshake carries it
/// (ADR-0082 D2: the kernel forwards plugin capabilities without interpreting
/// them, which is what keeps premium vocabulary out of the OSS core).
pub const ACCESS_POLICY_CAPABILITY: &str = "access-policy";

/// The capability the kernel advertises when the Ingress Studio is live
/// (ADR-0112; reported via `LiveCapabilities` after Build finds Postgres and
/// evidence capture). Absence is a complete configuration, never a fault.
pub const INGRESS_STUDIO_CAPABILITY: &str = "ingress-studio";

/// The capability the kernel advertises when the knowledge substrate's query
/// plane has a store behind it (ADR-0118, `substrateplugin.LiveCapabilities`).
/// Absence is a complete configuration (no Postgres / no substrate plugin),
/// never a fault.
pub const SUBSTRATE_CAPABILITY: &str = "substrate-query";

/// The capability gating `RetentionRunOp` on the operator feed (contract 0084,
/// ADR-0102 A1).
///
/// The event is SOURCE-AGNOSTIC: the reactive-journal GC publishes it today (the
/// premium record compactor that also did was removed with the drift product on
/// 2026-10-31).
pub const RETENTION_FEED_CAPABILITY: &str = "retention-feed";

/// The contract version this client is pinned to. Compare against
/// `SnapshotResponse.contract_version` to detect kernel skew (ADR-0047 D14).
///
/// 0070 adds the OSS `ListDocuments` RPC (`ListDocumentsOpRequest` /
/// `ListDocumentsOpResponse` / `DocumentSummaryOp`) and the `document-listing`
/// capability. Unlike 0068/0069 this one DOES change the operator surface: it is the
/// console's only way to enumerate documents by row, which is what makes an unlabelled
/// document findable at all. Access policy acts on labels and never on a document by
/// name, so a document with no labels is invisible to the policy model rather than
/// denied, and semantic search cannot find one — "which of my documents have no
/// labels?" has no query text.
///
/// 0069 (ADR-0097 D8) reshaped the AGENT-plane `GenerateWithTools` request to carry a
/// message list. As with 0068, the operator surface this console speaks was unchanged —
/// that bump was tracked only because the skew check is exact equality, and a stale pin
/// would raise a permanent false banner against a current kernel.
/// 0072–0076 are the operator-console kernel work (`operator_ui_refactor/
/// KERNEL-REQUIREMENTS.md`), re-vendored together:
///
/// - **0072** Wave 1 reads — `ListSessionCheckpoints` (run-keyed: checkpoints are
///   stored per RUN, so `step_index` is meaningless without `run_id`),
///   `ListMCPServers` (with `configured`, separating "no servers" from "no MCP
///   subsystem"), `GetEmbeddingConfig`, `ClassifyInput` (the FIVE-value router
///   vocabulary — `ingest` must not be collapsed, it WRITES to memory),
///   `ListGenerators`/`ListRoleAssignments`/`TestGenerator`,
///   `RetryWatchDeadLetter`, `PlanStepOp.required_capabilities`, and
///   `PluginInfoOp.last_check_unix_ms` + the `licence_unverifiable` state.
/// - **0073** the durable config WRITE path — `SetConfig` / `DeleteConfig` /
///   `SetGeneratorKey` / `ClearGeneratorKey`, with per-key `ConfigWriteOutcomeOp`.
///   `effect == "shadowed"` means STORED BUT INERT and names the environment
///   variable winning over it; rendering that as a plain success reproduces the
///   exact "I changed it and nothing happened" bug the surface exists to close.
/// - **0074** `SubmitPlan` (operator-authored DAGs, fatal vs advisory issues),
///   watch stream liveness + fire history + `GetReactiveBudget`, and the detail
///   fields contract 0057 removed.
/// - **0075** `GetTokenSeries` (contiguous hours, zero points for idle ones — the
///   gap is the information) and `ProposePlan` (questions INSTEAD of a proposal).
/// - **0076** `ExplainAccessBatch` (lets the reachability matrix stop
///   re-implementing access-control logic), multi-action watches, and
///   `GetBlastRadiusPreview`.
///
/// Counters added across these use **-1 for "not tracked"**, which is distinct
/// from 0: reporting zero for an absent counter makes a busy system look idle.
/// - **0079** ADR-0098 progress on the OPERATOR feed
///   (`ConversationProgressOp`). The progress channel only ever delivered to an
///   ingress-bound conversation, so Telegram saw "step 2 of 4" and the console
///   saw nothing — a console conversation has no delivery address, so the
///   snapshot was computed and dropped. Live-only, like `TokenChunkOp`: seq is 0
///   and it is never replayed, because a status line is not history.
/// - **0086–0090** the reactive-pipeline surface, re-vendored together:
///   pipeline listing (0087), `DryRunPipeline` (0088), the canvas reads —
///   `GetPipeline` / `ValidatePipeline` with structured refusals (0089) — and
///   `SavePipeline` draft writes (0090).
/// - **0091** `field_schema_json` on `GetPipeline` / `ValidatePipeline`: the
///   per-node field schema, walked by the kernel from the trigger's capture
///   profile through each transform. Empty means "unchecked", never "no
///   fields" — the picker goes unavailable-with-reason, not blank. Advertised
///   as the `pipeline-field-schema` capability.
/// - **0092** the dry run carries the DATA: `source` names what was replayed
///   (the archive's real deliveries vs redacted captures — over redacted
///   samples a numeric gate fails on every item, and only the label lets a
///   reader blame the source rather than the graph) and `node_examples` are
///   real items per node, the value as each node received it plus the node's
///   own receipt, bounded kernel-side.
/// - **0093** `TransitionPipeline`: the lifecycle finally has a BUTTON — the
///   console could draw, edit, validate and rehearse a pipeline and then had
///   no way to publish or arm it. One RPC, target-state vocabulary
///   (validated/published/armed/paused/retired); `armed` walks a draft
///   through its gates so "make this live" is one intent; refusals carry the
///   registry's own sentence. Capability `pipeline-lifecycle`.
/// - **0096** `SetRoleAssignment`: the WRITE half of `ListRoleAssignments`.
///   The RoleMap grid's radios had called `op_set_role_assignment` since the
///   pane was built with nothing behind them. The kernel stores the binding on
///   the ADR-0101 store (per-role key, so it composes with file-configured
///   roles) and hot-applies it — effect `live`, the organ's next call moves.
///   Also: `RemoveGenerator` now refuses the global default and role-serving
///   generators, the states that would brick or silently reroute a later boot.
/// - **0097** the MCP server write half: `SaveMCPServer`/`RemoveMCPServer`
///   (ADR-0101 store + LIVE attach/detach through the connector — tools appear
///   as soon as the server answers, no restart), `SetMCPServerToken`/
///   `ClearMCPServerToken` (write-only; a set bounces the connection so the
///   new credential is actually presented), and `TestMCPServer` (one ephemeral
///   dial of a possibly-unsaved spec, returning the tool names the server
///   actually advertises). `MCPServerOp` gains the declared half + token facts.
/// - **0098** the identity plane's REVIEW lane: `ListLinkCandidates` reads the
///   inbox (unretracted proposals, highest confidence first) and
///   `ConfirmLink`/`RetractLink`/`RetractLinksByProducer` act on it, carried by
///   the new `LinkOp`. Confirmation APPENDS a human-mechanism row and leaves the
///   machine's proposal untouched — a console that renders the confirmation in
///   its place erases the producer-behaviour record the lane exists to build —
///   and retraction stamps state + retracted_at only, never a delete. Batch
///   revocation returns the COUNT it revoked, because "undo that producer" with
///   no number says nothing about what just happened. Capability `links`:
///   without it a kernel can answer over links but cannot review them, and the
///   queue must be hidden rather than drawn with dead buttons. The premium
///   substrate plane moved with it — `entity` and `why` query kinds,
///   `expand_aliases` on QueryRequest and `closure_size` on QueryResponse (the
///   guarantee says "across N confirmed aliases" for a reader; the field says N
///   for a consumer) — which is why the vendored
///   `proto/substrate/substrate.proto` changed in the same step, and why that
///   copy is finally listed in core's `scripts/sync-protos.sh`.
/// - **0099** the bundled bump (owner decision 2026-11-01). Operator plane,
///   all additive: `Logout` revokes the caller's own bearer token (ADR-0130
///   D5; capability `logout`); ADR-0134 event time (capability
///   `memory-event-time`) — `occurred_at` / `parts` (`MemoryPartOp`) /
///   `time_precision` on `IngestMemoryOpRequest`, `reference_time` +
///   `event_after` / `event_before` on `QueryMemoryRequest` and
///   `AnswerMemoryRequest` (a window this kernel cannot apply yet answers
///   Unimplemented), and `event_time` / `event_time_end` / `time_source` /
///   `time_precision` on `MemoryOp` and `MemoryCitation`; the ADR-0101 D8 file
///   facts `written_to` / `overrides_file` / `overrides_value` on
///   `ConfigWriteOutcomeOp`. Agent plane (not vendored here): the retired
///   Orchestrator watch-CRUD RPCs are deleted. The console renders all three:
///   sign-out (`op_logout`), the D8 file facts + "revert to file"
///   (`op_delete_config`), and event time on hits, citations and the ingest
///   form. The event WINDOW is not sent: the kernel refuses it until ADR-0134 P2.
/// - **0100** ADR-0138 Amendment B1 (upload deduplication and replace-by-name),
///   additive: `IngestMemoryOpResponse.duplicate_of` / `version`,
///   `ListDocumentsOpRequest.upload_name` / `upload_tags` (the "Replace?" lookup,
///   `op_match_upload`) and `DocumentSummaryOp.updated_at_unix_ms` / `version`.
///   Capability `upload-replace`: the ingest pane asks "Replace <name>?" (default)
///   or "Keep both" (sent as "<base> (n).<ext>") before an upload whose name the
///   operator already stores in the same scope.
/// - **0101** ADR-0139 phase 2/3 (one additive proto pass for D12/D13/D14):
///   operator plane `ListMemoryNotes` / `GetMemoryNotes` / `SetMemoryNotes` /
///   `DeleteMemoryNotes` / `SetMemoryNotesBudget` (capability `memory-notes`) and
///   the D13 skill-lifecycle RPCs plus the lifecycle fields on `SkillOp` /
///   `ListSkillsOpRequest` (capability `skills-lifecycle`); agent plane (not
///   vendored here) `SpawnSubagent`, `GetMemoryNotes`, `ProposeMemoryNote`,
///   `ProposeSkill`. The console renders no notes or lifecycle surface yet; the
///   bump only keeps it off the skew banner against a 0101 kernel.
/// - **0102** owner decisions 2026-11-14, additive: `WhoAmI` (principal, display
///   name, plane role, role set, `role_source`, issuer; open to every role incl.
///   member) — an OIDC sign-in asks it instead of probing Snapshot
///   (T-20261106-operator-plane-has-no-whoami-an-oidc-signed-in); `CancelRun`
///   (capability `run-cancel`) ends a live run terminally, unlike pause/close
///   (T-20261106-operator-closesession-only-pauses-a-live-plan). The task page
///   renders a "Cancel run" control behind the capability.
/// - **0103** owner decision 2026-11-14, additive: read-only fact inspection
///   `ListFacts` / `GetFactChain` / `GetFactCoverage` (capability `facts-inspect`;
///   T-20261103-operator-plane-cannot-inspect-facts-no-rpc). The console renders no
///   facts surface yet; the bump keeps it off the skew banner against a 0103 kernel.
/// - **0104** 2026-11-15, additive: `MemoryOp.fact_matches` / `fact_match` /
///   `fact_current` (rendered on the memory source card; ENG-461) and
///   `ConfigSchemaOp.overrides_file` / `overrides_file_value` (ADR-0101 D8; ENG-257).
///   The agent-plane `ExecuteToolResponse.annotations` (ENG-629) is not vendored here.
///   Also `IngestMemoryOpRequest.source_kind` / `title` / `author` and
///   `MemoryPartOp.speaker` (ADR-0136 A3.5; ENG-460) — the console sends none yet.
/// - **0105** 2026-11-16, additive (ADR-0137 S6, ENG-411 stage C): memory erasure —
///   `PreviewForgetMemory` / `ForgetMemory` / `ListErasures` / `GetErasure` with
///   `ErasureSelectorOp` / `ErasureCandidateOp` / `ErasureReceiptOp` (capability
///   `memory-erasure`, advertised only when the kernel enables erasure). The console
///   renders no erasure surface yet (ENG-462); the bump keeps it off the skew banner.
///   The agent-plane `PreviewForget` / `Forget` / `ListMyErasures` are not vendored here.
/// - **0106** 2026-11-17, additive, agent plane only (ADR-0137 D2, ENG-1948): the query
///   form of `PreviewForget` (`PreviewForgetRequest.query`, `ErasureCandidate.snippet`).
///   `operator.proto` is unchanged — operator previews stay ids/counts only; the bump
///   keeps the console off the skew banner against a 0106 kernel.
/// - **0107** 2026-11-17, additive, agent plane only (ENG-1953):
///   `PreviewForgetResponse.truncated` (a query preview cut by the candidate cap).
///   `operator.proto` is unchanged; the bump keeps the console off the skew banner.
/// - **0108** 2026-11-18, additive (ENG-2018): `ErasureReceiptOp.not_erasable_external`
///   (and the agent-plane `ErasureReceipt` twin) — the ADR-0137 D7 async steps that could
///   not erase from an external service. The console renders no erasure surface yet
///   (ENG-462); the bump keeps it off the skew banner.
/// - **0109** 2026-11-18, additive (ENG-2030/ENG-2032): the review lane over claims —
///   `ListLinkPairs`, `ConfirmLinkPair`, `RejectLinkPair` (`LinkPairOp`, `LinkPairKeyOp`)
///   and `LinkOp.supporting_evidence_ids`. The link review screen lists pairs and
///   decides them pair-level; the row-level RPCs are unchanged.
/// - **0110** 2026-11-19, additive (ENG-2147/ENG-2154): memory notes in the compliance
///   erase — `ErasureSelectorOp.memory_note_ids` / `memory_note_owners`,
///   `ErasureCandidateOp.note_text`, `ErasureReceiptOp.redacted_messages`. The console
///   renders no erasure surface yet (ENG-462); the bump keeps it off the skew banner.
///   `DeleteMemoryNotes` ("Clear notes") is labelled a soft delete, not an erasure.
/// - **0111** 2026-11-19, additive (ENG-2143): background embedding of large uploads —
///   `GetIngestStatus` (`IngestStatusOp`), `IngestMemoryOpResponse.status`,
///   `GetDocumentOpResponse.ingest`, capability `ingest-status`. With the capability
///   the upload queue shows accepted → embedding n of total → searchable / failed,
///   polling `GetIngestStatus` (`op_get_ingest_status`), and the document view shows a
///   state badge (ENG-2175).
/// - **0112** 2026-11-19, additive (ENG-2170): `IngestMemoryOpRequest.labels` — the
///   writer's non-classification markers (a revision's lifecycle, `rev<N>`, corpus and
///   document ids), carried beside the tags; the write ceiling never filters them. The
///   console's ingest pane sends none (an operator upload has no lifecycle); the bump
///   keeps it off the skew banner.
/// - **0113** 2026-11-19, additive (ENG-2139): the derivation journal —
///   `GetDerivationJournal` (backlog per kind, dead jobs with their last error,
///   counters) and `RequeueDerivationJob`, capability `derivation-journal`. With the
///   capability the Memory screen shows a "Derivation jobs" panel with a requeue action
///   per dead job (`op_get_derivation_journal`, `op_requeue_derivation_job`).
/// - **0114** 2026-11-20, additive (ENG-1545): `MCPServerSpecOp.allow_private_network`
///   (optional; absent keeps the stored opt-in) on `SaveMCPServer` / `TestMCPServer`
///   and `MCPServerOp.allow_private_network` on `ListMCPServers`. The Integrations ›
///   custom server editor shows an "Allow a private-network address" switch for
///   http/sse servers and always sends it.
/// - **0115** 2026-11-20, additive, agent plane only (ENG-1768):
///   `Orchestrator/RequestKnowledgeCommit` — ask for an existing knowledge candidate
///   to be committed. `operator.proto` is unchanged; the bump keeps the console off
///   the skew banner.
/// - **0116** 2026-11-20, additive (ENG-1654): `WatchDeadLetterOp.retryable` — the kernel
///   says which dead letters `RetryWatchDeadLetter` can replay (a failed delivery, with a
///   retrier registered); expired signals are delete-only. The Reactive screen's dead
///   letters panel offers Retry only on those (`op_retry_watch_dead_letter`) and Delete
///   with `watch-deadletter-delete` (`op_delete_watch_dead_letter`).
pub const PINNED_CONTRACT_VERSION: &str = "0116";

/// The plugin versions this console was BUILT against, by plugin id (ADR-0089).
///
/// The contract version covers the OSS operator surface. It says nothing about a
/// plugin: a kernel can serve contract 0067 with a policy plugin two major
/// versions ahead of the panels compiled in here, and every RPC would answer
/// normally while the surface quietly meant something else. Pinning per plugin is
/// what makes that visible.
///
/// A plugin absent from this table is one this console has no pinned expectation
/// for — reported as unknown rather than assumed compatible. Add an entry when
/// the console gains a surface for a plugin, and bump it when that surface is
/// rebuilt against a new plugin major.
///
/// Each value is the plugin's own `Version` constant in
/// `cambrian-premium/plugins/<plugin>/plugin.go` at the time the surface was
/// built. `src/components/plugin-pins.test.ts` fails when a screen passes a
/// `pluginId` to `PluginSurface` that has no entry here.
pub const PINNED_PLUGIN_VERSIONS: &[(&str, &str)] = &[
    // Integrations > Accounts (premium accounts plane).
    ("accounts", "1.0.0"),
    // Access policy.
    ("authz", "1.0.0"),
    // Ingress Studio.
    ("ingress-studio", "0.2.0"),
    // Settings > Telemetry (TelemetryAdmin plane).
    ("langfuse", "1.0.0"),
    // Organisation.
    ("org-directory", "1.0.0"),
    // Pipelines.
    ("reactive", "1.0.0"),
    // Knowledge.
    ("substrate", "0.1.0"),
    // Telegram ingress.
    ("telegram", "1.0.0"),
];

/// How a kernel plugin's version compares to what this console pinned.
///
/// Deliberately three states, not a boolean: a patch-level difference is not the
/// same event as a major-version difference, and collapsing them either cries
/// wolf on every point release or stays silent through a breaking one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginSkew {
    /// Same version, or a difference below the major line.
    Aligned,
    /// Differs below the major line — surfaces should work; worth showing quietly.
    Minor,
    /// Major line differs — panels compiled here may be wrong about this plugin.
    Major,
    /// This console pinned no version for this plugin.
    Unknown,
}

/// Compare a kernel-reported plugin version against what this console pinned.
///
/// Only the major component is treated as breaking, which matches how the plugin
/// manifests version themselves. An unparseable version is reported as `Unknown`
/// rather than `Aligned`: a version this console cannot read is precisely the
/// case where it should not claim compatibility.
pub fn plugin_skew(plugin_id: &str, kernel_version: &str) -> PluginSkew {
    let Some((_, pinned)) = PINNED_PLUGIN_VERSIONS
        .iter()
        .find(|(id, _)| *id == plugin_id)
    else {
        return PluginSkew::Unknown;
    };
    if kernel_version.is_empty() {
        return PluginSkew::Unknown;
    }
    if *pinned == kernel_version {
        return PluginSkew::Aligned;
    }
    match (major_of(pinned), major_of(kernel_version)) {
        (Some(a), Some(b)) if a == b => PluginSkew::Minor,
        (Some(_), Some(_)) => PluginSkew::Major,
        _ => PluginSkew::Unknown,
    }
}

fn major_of(version: &str) -> Option<u32> {
    version.split('.').next()?.parse().ok()
}
