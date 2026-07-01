fn main() {
    // ADR-0047 0047-13: generate the OperatorConsole gRPC client from the
    // vendored, pinned proto. We are a client only — no server stubs. The
    // `google/protobuf/timestamp.proto` import resolves via the vendored
    // protoc's bundled well-known types (mapped to prost_types::Timestamp).
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .expect("failed to locate vendored protoc binary");
    std::env::set_var("PROTOC", protoc);

    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile_protos(&["../proto/operator.proto"], &["../proto"])
        .expect("failed to compile operator.proto");

    println!("cargo:rerun-if-changed=../proto/operator.proto");

    tauri_build::build();
}
