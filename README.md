# Cambrian Studio

The desktop app for a Cambrian kernel: start tasks, watch plans run, approve
decisions, explore memory, and configure agents, access and integrations.

Cambrian Studio is a Tauri 2 app — a Rust core that speaks the kernel's
operator-plane gRPC contract, and a React 19 + TypeScript webview. See
[`CONTEXT.md`](CONTEXT.md) for the architecture and [`AGENTS.md`](AGENTS.md)
for the development rules.

Studio serves engineers and operators running agent systems, and research
collaborators inspecting execution and memory. **Status: pre-1.0, under active
development.** The package version is `0.1.0`; screens and integration behavior
continue to evolve.

## Relationship to Core

[Cambrian Core](https://github.com/cambrian-sh/core) owns execution, policy,
memory, and durable runtime state. Studio is a client of that kernel. Its Rust
core authenticates human operators, maintains the connection and recovered
client state, and sends projections to the webview over Tauri IPC:

```text
React webview <-- Tauri IPC --> Rust core <-- authenticated gRPC --> Cambrian Core
```

The webview does not connect directly to the kernel. Operator and Viewer roles
are enforced by Core. Plugin panels appear only when the connected kernel
advertises their capabilities, so available screens depend on the deployment.

## Preview in a browser

For frontend development, you can use mock data without Rust or a running kernel.
Install [Bun](https://bun.sh), then run these commands in a POSIX shell:

```sh
git clone https://github.com/cambrian-sh/ui.git
cd ui
bun install
VITE_USE_MOCK_IPC=1 bun run dev
```

Open `http://localhost:1420`. This mode uses simulated IPC responses; it is for
developing and reviewing the interface, and does not execute tasks on Core.
In PowerShell, set `$env:VITE_USE_MOCK_IPC = "1"` before `bun run dev`.

## Run the desktop app

In addition to Bun, install Rust/Cargo and the
[Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/):
WebKitGTK and native build libraries on Linux, Xcode Command Line Tools on macOS,
or Microsoft C++ Build Tools and WebView2 on Windows. For remembered logins,
Studio uses the OS credential store; Linux needs a working Secret Service.

Start a kernel separately using the
[Core setup instructions](https://github.com/cambrian-sh/core#run-a-local-kernel).
Have its endpoint and operator username/password available. The local default
is `http://localhost:50051`; remote connections need the deployment's endpoint
and TLS configuration. A kernel without an operator account cannot accept a login.

From the Studio checkout, in a shell where `VITE_USE_MOCK_IPC` is unset:

```sh
bun install
bun run tauri dev
```

The project-local Tauri CLI starts Vite and builds the Rust app. Configure the
kernel connection in Studio and log in with the kernel's credentials. Studio
checks the pinned operator contract and surfaces version skew; use compatible
Core and Studio revisions when testing integration.

### Live Studio in a browser tab (dev bridge)

```sh
bun run studio
```

This starts the local kernel if one is not already listening on `:50051`
(`~/.cambrian/bin/cambrian start`), then runs the desktop app with the dev
bridge on. The bridge is a localhost WebSocket (`127.0.0.1:1430`) that relays the
webview's IPC to the running Rust core, so `http://localhost:1420` in any browser
shows the same live session as the native window: useful for browser devtools
and automated UI review against a real kernel. Sign in once in the native window
with **Remember** ticked; both then reconnect on launch. Set
`CAMBRIAN_KERNEL_PORT=0` to skip the local kernel when Studio connects to a remote
one.

The bridge is compiled only into debug builds with the `dev-bridge` feature,
starts only when `CAMBRIAN_STUDIO_BRIDGE=1`, and accepts only the Vite dev
server's origin. In a browser tab the native file picker is unavailable. After
adding or changing a Tauri command, run `bun run gen:dev-bridge` (a Rust test
fails while the bridge is stale).

## Development checks

Run from the repository root:

```sh
bun run typecheck
bun run test
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
```

The webview production build does not package a desktop app. Use
`bun run tauri build` for native packaging after installing the platform
prerequisites. Browser mock checks do not validate native transport, keychain,
or live kernel behavior.

## Architecture and contribution

Read the [contributor rules](AGENTS.md) and [repository context](CONTEXT.md)
before changing behavior. The [documentation index](docs/README.md) leads to the
[product specification](docs/prd/web-ui-prd.md),
[thematic PRDs](docs/prd/README.md), and
[technical design](docs/tech/web-ui-tech-doc.md).

The [Rust core context](src-tauri/CONTEXT.md) explains transport and recovery;
the [webview context](src/CONTEXT.md) explains projection state and presentation.
The pinned [operator contract](proto/operator.proto) is vendored from Core:
contract changes originate there rather than being hand-edited in Studio.
Keep changes focused and describe the checks and live integration scenarios
you exercised in your pull request.

## License

See [LICENSE](LICENSE) for the GNU Affero General Public License v3.0 terms.
