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

/// The capability the kernel advertises when the access-policy plugin is active.
/// The UI renders the policy console only when the handshake carries it
/// (ADR-0082 D2: the kernel forwards plugin capabilities without interpreting
/// them, which is what keeps premium vocabulary out of the OSS core).
pub const ACCESS_POLICY_CAPABILITY: &str = "access-policy";

/// The contract version this client is pinned to. Compare against
/// `SnapshotResponse.contract_version` to detect kernel skew (ADR-0047 D14).
pub const PINNED_CONTRACT_VERSION: &str = "0067";

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
pub const PINNED_PLUGIN_VERSIONS: &[(&str, &str)] = &[("authz", "1.0.0"), ("reactive", "1.0.0")];

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
    let Some((_, pinned)) = PINNED_PLUGIN_VERSIONS.iter().find(|(id, _)| *id == plugin_id) else {
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
