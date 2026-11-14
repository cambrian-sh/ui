//! The telemetry (Langfuse) administration plane — Settings > Telemetry.
//!
//! Premium `cambrian.premium.telemetry.TelemetryAdmin` (contract 0078), mounted by the
//! langfuse plugin on the same kernel server, over the same connection and bearer token
//! as the operator console (ADR-0073/0088). A kernel without the plugin does not
//! advertise the `telemetry-admin` capability, the Settings section is not shown, and
//! every RPC here would answer `Unimplemented`.
//!
//! **The secret key is write-only across this whole file.** It is passed straight
//! through to `SetTelemetrySecretKey` and never retained, echoed or logged; the config
//! carries only whether one is stored and its last four characters.
//!
//! The DTOs mirror the proto field for field. In particular `enabled` (the tracing
//! master switch, proto field 3) round-trips: a save that dropped it would send
//! `false` and switch tracing off (T-20261106-langfuse-secret-key-cannot-be-set-from-the).

use serde::{Deserialize, Serialize};
use tonic::service::interceptor::InterceptedService;
use tonic::transport::Channel;
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, AuthInterceptor, Transport, MAX_MESSAGE_BYTES};

use pb::telemetry::telemetry_admin_client::TelemetryAdminClient;

type TelemetryClient = TelemetryAdminClient<InterceptedService<Channel, AuthInterceptor>>;

/// Everything safe to render about the telemetry sink. Never a key.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TelemetryConfig {
    pub host: String,
    pub project: String,
    /// The master switch: does the kernel send traces at all.
    pub enabled: bool,
    pub public_key_configured: bool,
    pub public_key_last_four: String,
    /// Whether a secret is stored. NEVER the secret.
    pub secret_key_configured: bool,
    pub secret_key_last_four: String,
    pub sample_rate: f64,
    pub send_structure_and_timings: bool,
    pub send_prompts_and_outputs: bool,
    pub send_from_enforcing_surfaces: bool,
}

impl From<pb::telemetry::TelemetryConfig> for TelemetryConfig {
    fn from(c: pb::telemetry::TelemetryConfig) -> Self {
        Self {
            host: c.host,
            project: c.project,
            enabled: c.enabled,
            public_key_configured: c.public_key_configured,
            public_key_last_four: c.public_key_last_four,
            secret_key_configured: c.secret_key_configured,
            secret_key_last_four: c.secret_key_last_four,
            sample_rate: c.sample_rate,
            send_structure_and_timings: c.send_structure_and_timings,
            send_prompts_and_outputs: c.send_prompts_and_outputs,
            send_from_enforcing_surfaces: c.send_from_enforcing_surfaces,
        }
    }
}

impl From<TelemetryConfig> for pb::telemetry::TelemetryConfig {
    fn from(c: TelemetryConfig) -> Self {
        Self {
            host: c.host,
            project: c.project,
            enabled: c.enabled,
            public_key_configured: c.public_key_configured,
            public_key_last_four: c.public_key_last_four,
            secret_key_configured: c.secret_key_configured,
            secret_key_last_four: c.secret_key_last_four,
            sample_rate: c.sample_rate,
            send_structure_and_timings: c.send_structure_and_timings,
            send_prompts_and_outputs: c.send_prompts_and_outputs,
            send_from_enforcing_surfaces: c.send_from_enforcing_surfaces,
        }
    }
}

/// The outcome of a write. A refusal ("reason required", "host must be https") is a
/// normal authoring result carried in `error`; `warning` says what succeeded but is
/// still not effective (e.g. an env key that keeps winning over the stored one).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TelemetryAck {
    pub ok: bool,
    pub error: String,
    pub warning: String,
}

impl From<pb::telemetry::TelemetryAck> for TelemetryAck {
    fn from(a: pb::telemetry::TelemetryAck) -> Self {
        Self { ok: a.ok, error: a.error, warning: a.warning }
    }
}

/// One test trace: the tracer drops what it cannot send, so this is the only way an
/// operator learns that tracing does not work.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TestTraceResult {
    pub ok: bool,
    pub latency_ms: i64,
    pub error: String,
    pub trace_id: String,
    pub host: String,
}

impl From<pb::telemetry::TestTraceResult> for TestTraceResult {
    fn from(r: pb::telemetry::TestTraceResult) -> Self {
        Self { ok: r.ok, latency_ms: r.latency_ms, error: r.error, trace_id: r.trace_id, host: r.host }
    }
}

impl Transport {
    async fn telemetry_client(&self) -> Result<TelemetryClient, String> {
        let (channel, interceptor) = self.authed_channel().await?;
        Ok(TelemetryAdminClient::with_interceptor(channel, interceptor)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES))
    }

    pub async fn telemetry_get_config(&self) -> Result<TelemetryConfig, String> {
        let mut client = self.telemetry_client().await?;
        let c = client
            .get_telemetry_config(Request::new(pb::telemetry::GetTelemetryConfigRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(c.into())
    }

    /// Save the whole config, `enabled` included. `reason` is mandatory.
    pub async fn telemetry_set_config(
        &self,
        config: TelemetryConfig,
        reason: String,
    ) -> Result<TelemetryAck, String> {
        let mut client = self.telemetry_client().await?;
        let ack = client
            .set_telemetry_config(Request::new(pb::telemetry::SetTelemetryConfigRequest {
                config: Some(config.into()),
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.into())
    }

    /// Store the secret key. The value is passed straight through and never retained,
    /// echoed, or logged on this side.
    pub async fn telemetry_set_secret_key(
        &self,
        key: String,
        reason: String,
    ) -> Result<TelemetryAck, String> {
        let mut client = self.telemetry_client().await?;
        let ack = client
            .set_telemetry_secret_key(Request::new(pb::telemetry::SetTelemetrySecretKeyRequest {
                key,
                reason,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.into())
    }

    pub async fn telemetry_send_test_trace(&self) -> Result<TestTraceResult, String> {
        let mut client = self.telemetry_client().await?;
        let r = client
            .send_test_trace(Request::new(pb::telemetry::SendTestTraceRequest {}))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(r.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> TelemetryConfig {
        TelemetryConfig {
            host: "https://cloud.langfuse.com".into(),
            project: "ops".into(),
            enabled: true,
            public_key_configured: true,
            public_key_last_four: "7c1e".into(),
            secret_key_configured: true,
            secret_key_last_four: "a9f0".into(),
            sample_rate: 0.25,
            send_structure_and_timings: true,
            send_prompts_and_outputs: false,
            send_from_enforcing_surfaces: false,
        }
    }

    /// The bug this module exists to avoid: a save that loses `enabled` turns
    /// tracing off. Every field must survive DTO → proto → DTO.
    #[test]
    fn config_round_trips_through_the_proto_with_enabled() {
        let c = sample();
        let back: TelemetryConfig = pb::telemetry::TelemetryConfig::from(c.clone()).into();
        assert_eq!(back, c);
        let off = TelemetryConfig { enabled: false, ..sample() };
        let p: pb::telemetry::TelemetryConfig = off.into();
        assert!(!p.enabled);
    }

    #[test]
    fn config_serializes_with_the_webview_field_names() {
        let v = serde_json::to_value(sample()).unwrap();
        for k in ["enabled", "secret_key_last_four", "send_from_enforcing_surfaces"] {
            assert!(v.get(k).is_some(), "missing {k}");
        }
    }

    #[test]
    fn ack_and_test_result_map_every_field() {
        let a: TelemetryAck = pb::telemetry::TelemetryAck {
            ok: true,
            error: String::new(),
            warning: "env key wins".into(),
        }
        .into();
        assert_eq!(a, TelemetryAck { ok: true, error: String::new(), warning: "env key wins".into() });
        let r: TestTraceResult = pb::telemetry::TestTraceResult {
            ok: true,
            latency_ms: 38,
            error: String::new(),
            trace_id: "t1".into(),
            host: "h".into(),
        }
        .into();
        assert_eq!(r.latency_ms, 38);
        assert_eq!(r.trace_id, "t1");
        assert_eq!(r.host, "h");
    }
}
