fn main() {
    // ADR-0047 0047-13: generate the OperatorConsole gRPC client from the
    // vendored, pinned proto. We are a client only — no server stubs. The
    // `google/protobuf/timestamp.proto` import resolves via the vendored
    // protoc's bundled well-known types (mapped to prost_types::Timestamp).
    let protoc =
        protoc_bin_vendored::protoc_bin_path().expect("failed to locate vendored protoc binary");
    std::env::set_var("PROTOC", protoc);

    // ADR-0088: two planes, one connection. `operator.proto` is the pinned OSS
    // contract; `authz/access_policy.proto` is a PREMIUM-owned plane mounted on
    // the same kernel server behind the same operator auth interceptors
    // (ADR-0073). Compiling both here is what lets the UI render a plugin's
    // surface when the kernel advertises its capability, and render nothing when
    // it does not — the client is always present, the SERVER is what varies.
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile_protos(
            &[
                "../proto/operator.proto",
                "../proto/authz/access_policy.proto",
                // ADR-0090: the Telegram ingress's operator plane. Same reasoning as
                // authz — the client is always compiled, the SERVER is what varies with
                // which plugins the kernel was built with.
                "../proto/telegram/telegram_admin.proto",
                // Contract 0078: the telemetry (Langfuse) administration plane. Premium
                // owns it for the same reason authz does — ADR-0057 D5 keeps Langfuse out
                // of the OSS config schema, so it could not live on operator.proto. The
                // client compiles unconditionally; an OSS kernel simply never advertises
                // the "telemetry-admin" capability and the surface stays hidden.
                "../proto/telemetry/telemetry_admin.proto",
                // ADR-0102: the premium RECORD LANE plane, which carries the drift
                // product's own output — alerts, the outcome tally, refusals and
                // retention runs. It is deliberately NOT on operator.proto:
                // operator.proto is a held-stable contract, and an unproven product
                // feature should not become a permanent commitment on it. Same
                // reasoning, and the same mounting, as authz above.
                "../proto/records/records.proto",
                // ADR-0112: the Ingress Studio's operator plane (plan D8) —
                // the full ingress lifecycle over the server-enforced state
                // machine. Premium-owned for the ADR-0073 reason; the client
                // compiles unconditionally and the surface is gated on the
                // "ingress-studio" capability, reported post-Build.
                "../proto/ingress/ingress_studio.proto",
            ],
            &["../proto"],
        )
        .expect("failed to compile the operator + access-policy protos");

    println!("cargo:rerun-if-changed=../proto/operator.proto");
    println!("cargo:rerun-if-changed=../proto/authz/access_policy.proto");
    println!("cargo:rerun-if-changed=../proto/telegram/telegram_admin.proto");
    println!("cargo:rerun-if-changed=../proto/telemetry/telemetry_admin.proto");
    println!("cargo:rerun-if-changed=../proto/records/records.proto");
    println!("cargo:rerun-if-changed=../proto/ingress/ingress_studio.proto");

    tauri_build::build();
}
