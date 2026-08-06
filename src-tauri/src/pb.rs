//! Generated gRPC clients + message types for the two planes the UI speaks.
//!
//! Produced by `build.rs` (tonic-build) from the vendored protos. Do not edit by
//! hand; re-vendor + rebuild when a contract bumps.
//!
//! - `cambrian` — the pinned OSS `OperatorConsole` contract (`../proto/operator.proto`).
//! - [`authz`] — the PREMIUM `AccessPolicyAdmin` plane (`../proto/authz/access_policy.proto`),
//!   mounted on the same kernel server behind the same operator auth interceptors
//!   (ADR-0073/0088).

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

/// The premium record lane (ADR-0102) — the drift product's own plane.
///
/// Compiled in unconditionally, like every other premium plane here. Whether the
/// SERVER exists is what varies, and it varies on something the manifest cannot
/// know: the lane needs Postgres, so the plugin declares no capability at
/// registration and reports [`RECORD_LANE_CAPABILITY`] only after Build finds a
/// store. A kernel with the plugin and no database is a CORRECT deployment that
/// never advertises it.
pub mod records {
    tonic::include_proto!("cambrian.premium.records");
}

/// The premium Ingress Studio plane (ADR-0112 §13) — the full ingress
/// lifecycle: capture, draft, confirm, dry-run, arm, pause, repair, retire.
///
/// Compiled in unconditionally like every premium plane here. The capability
/// is reported post-Build (the record-lane precedent): a kernel without
/// Postgres or evidence capture is a CORRECT deployment that never advertises
/// it, and the surface stays hidden rather than broken.
pub mod ingress {
    tonic::include_proto!("cambrian.premium.ingress");
}

/// The capability the kernel advertises when the access-policy plugin is active.
/// The UI renders the policy console only when the handshake carries it
/// (ADR-0082 D2: the kernel forwards plugin capabilities without interpreting
/// them, which is what keeps premium vocabulary out of the OSS core).
pub const ACCESS_POLICY_CAPABILITY: &str = "access-policy";

/// The capability the kernel advertises when the record lane has a store
/// (ADR-0102, `driftplugin.Capability`).
///
/// Its ABSENCE is meaningful and must not be rendered as a fault: a deployment
/// with no Postgres has no reconciler, which is a complete configuration rather
/// than a missing piece. This is also distinct from `GetDriftStats.available` —
/// the capability says the plane is mounted, `available` says there is something
/// behind it, and a console that conflates them will eventually report "0 issues"
/// for a detector that was never switched on.
pub const RECORD_LANE_CAPABILITY: &str = "record-lane";

/// The capability the kernel advertises when the Ingress Studio is live
/// (ADR-0112; reported via `LiveCapabilities` after Build finds Postgres and
/// evidence capture). Absence is a complete configuration, never a fault.
pub const INGRESS_STUDIO_CAPABILITY: &str = "ingress-studio";

/// The capability gating `RetentionRunOp` on the operator feed (contract 0084,
/// ADR-0102 A1).
///
/// Separate from [`RECORD_LANE_CAPABILITY`] because the event is SOURCE-AGNOSTIC:
/// the record compactor and the reactive-journal GC publish the same shape, so a
/// deployment can have retention events with no record lane at all.
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
pub const PINNED_CONTRACT_VERSION: &str = "0093";

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
pub const PINNED_PLUGIN_VERSIONS: &[(&str, &str)] =
    &[("authz", "1.0.0"), ("reactive", "1.0.0"), ("drift", "0.1.0")];

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
