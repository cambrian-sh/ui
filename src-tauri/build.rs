fn main() {
    // ADR-0047 0047-13: generate the OperatorConsole gRPC client from the
    // vendored, pinned proto. We are a client only — no server stubs. The
    // `google/protobuf/timestamp.proto` import resolves via the vendored
    // protoc's bundled well-known types (mapped to prost_types::Timestamp).
    let protoc =
        protoc_bin_vendored::protoc_bin_path().expect("failed to locate vendored protoc binary");
    std::env::set_var("PROTOC", protoc);

    // ADR-0088: one connection, the OSS plane plus the premium planes.
    // `operator.proto` is the pinned OSS contract; every other proto below is a
    // PREMIUM-owned plane mounted on the same kernel server behind the same
    // operator auth interceptors (ADR-0073). Compiling both here is what lets the UI render a plugin's
    // surface when the kernel advertises its capability, and render nothing when
    // it does not — the client is always present, the SERVER is what varies.
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        // ADR-0142 stage 2: the org-directory messages cross the Tauri bridge
        // as they are (src/org.rs), so they derive serde instead of being
        // copied field by field into ~25 hand-written DTOs that would drift
        // from the proto. `default` makes a field the webview omits its proto
        // default, exactly as on the wire. The other planes keep their DTOs.
        .type_attribute(
            ".cambrian.premium.org",
            "#[derive(serde::Serialize, serde::Deserialize)] #[serde(default)]",
        )
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
                // ADR-0112: the Ingress Studio's operator plane (plan D8) —
                // the full ingress lifecycle over the server-enforced state
                // machine. Premium-owned for the ADR-0073 reason; the client
                // compiles unconditionally and the surface is gated on the
                // "ingress-studio" capability, reported post-Build.
                "../proto/ingress/ingress_studio.proto",
                // ADR-0118: the knowledge substrate's operator plane — the NL
                // ask box (AskKnowledge), the closed query AST (Query), and the
                // explore catalog (Overview/ListEntities). Premium-owned for
                // the ADR-0073 reason; gated on "substrate-query", reported
                // post-Build (a plugin with no Postgres never advertises it).
                "../proto/substrate/substrate.proto",
                // ADR-0141: the premium accounts plane (personal OAuth accounts
                // for per-user integrations; replaced ADR-0140's six
                // OperatorConsole RPCs). Gated on the "accounts" capability.
                "../proto/accounts/accounts.proto",
                // ADR-0142 stage 2: the premium organisation-hierarchy plane
                // (units, people, manager edges, mapping rules, SCIM
                // connections, Keycloak reconcile). Gated on "org-directory".
                "../proto/org/org_directory.proto",
            ],
            &["../proto"],
        )
        .expect("failed to compile the operator-plane protos");

    println!("cargo:rerun-if-changed=../proto/operator.proto");
    println!("cargo:rerun-if-changed=../proto/authz/access_policy.proto");
    println!("cargo:rerun-if-changed=../proto/telegram/telegram_admin.proto");
    println!("cargo:rerun-if-changed=../proto/telemetry/telemetry_admin.proto");
    println!("cargo:rerun-if-changed=../proto/ingress/ingress_studio.proto");
    println!("cargo:rerun-if-changed=../proto/substrate/substrate.proto");
    println!("cargo:rerun-if-changed=../proto/accounts/accounts.proto");
    println!("cargo:rerun-if-changed=../proto/org/org_directory.proto");

    tauri_build::build();
}
