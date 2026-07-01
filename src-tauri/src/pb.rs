//! Generated OperatorConsole gRPC client + message types.
//!
//! Produced by `build.rs` (tonic-build) from the vendored, pinned
//! `../proto/operator.proto` (contract version `0047`). Do not edit by hand;
//! re-vendor + rebuild when the kernel contract bumps.

tonic::include_proto!("cambrian");

/// The contract version this client is pinned to. Compare against
/// `SnapshotResponse.contract_version` to detect kernel skew (ADR-0047 D14).
pub const PINNED_CONTRACT_VERSION: &str = "0047";
