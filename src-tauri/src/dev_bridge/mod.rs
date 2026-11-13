//! Dev bridge: drive this running Studio from a plain browser tab.
//!
//! Development only. Compiled only into debug builds with the `dev-bridge`
//! feature, and started only when `CAMBRIAN_STUDIO_BRIDGE=1`. It serves one
//! WebSocket on 127.0.0.1 that relays the webview's IPC — the same Tauri
//! commands and `kernel://*` events — so the webview can be reviewed against a
//! live kernel from a browser (and by browser automation) without the native
//! window. The kernel connection and its credentials stay in this process,
//! exactly as they do for the native webview; nothing new reaches the kernel.
//!
//! Wire format, one JSON object per text frame:
//! - browser → core: `{"id": 1, "cmd": "op_get_state", "args": {...}}`
//! - core → browser: `{"id": 1, "ok": true, "value": ...}` or
//!   `{"id": 1, "ok": false, "error": "..."}`
//! - core → browser: `{"event": "kernel://state", "payload": ...}`
//!
//! A WebSocket is not covered by CORS, so the upgrade is refused unless the
//! `Origin` is the Vite dev server: an unrelated web page in some browser on
//! this machine cannot reach the operator session through it.

mod dispatch;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State as AxState;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use tauri::{AppHandle, Listener};
use tokio::sync::{broadcast, mpsc};

/// Port of the bridge. 1420 is Vite and 1421 its HMR socket.
pub const PORT: u16 = 1430;

/// Events the core emits to the webview; the bridge forwards each one.
const EVENTS: &[&str] = &["kernel://state", "kernel://token", "kernel://log", "kernel://log-error"];

const ALLOWED_ORIGINS: &[&str] = &["http://localhost:1420", "http://127.0.0.1:1420"];

#[derive(Clone)]
struct Bridge {
    app: AppHandle,
    events: broadcast::Sender<String>,
}

/// Start the bridge if `CAMBRIAN_STUDIO_BRIDGE=1`. Called once from setup.
pub fn start(app: &AppHandle) {
    if std::env::var("CAMBRIAN_STUDIO_BRIDGE").as_deref() != Ok("1") {
        return;
    }
    let (events, _) = broadcast::channel::<String>(256);
    for &name in EVENTS {
        let tx = events.clone();
        app.listen_any(name, move |event| {
            // The payload is already JSON; splice it in rather than re-parse.
            let _ = tx.send(format!(r#"{{"event":"{name}","payload":{}}}"#, event.payload()));
        });
    }
    let bridge = Bridge { app: app.clone(), events };
    tauri::async_runtime::spawn(async move {
        let router = Router::new().route("/", get(upgrade)).with_state(bridge);
        match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
            Ok(listener) => {
                eprintln!("[dev-bridge] listening on ws://127.0.0.1:{PORT}");
                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("[dev-bridge] stopped: {e}");
                }
            }
            Err(e) => eprintln!("[dev-bridge] could not bind 127.0.0.1:{PORT}: {e}"),
        }
    });
}

async fn upgrade(
    AxState(bridge): AxState<Bridge>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let origin = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !ALLOWED_ORIGINS.contains(&origin) {
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.on_upgrade(move |socket| session(bridge, socket))
}

#[derive(serde::Deserialize)]
struct Request {
    id: u64,
    cmd: String,
    #[serde(default)]
    args: serde_json::Value,
}

async fn session(bridge: Bridge, mut socket: WebSocket) {
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let mut events = bridge.events.subscribe();
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                let Message::Text(text) = msg else { continue };
                let req: Request = match serde_json::from_str(&text) {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("[dev-bridge] bad frame: {e}");
                        continue;
                    }
                };
                let app = bridge.app.clone();
                let tx = out_tx.clone();
                // Each call runs on its own task: a slow command (a long query,
                // a blocking SendTurn) must not hold up the others or the events.
                tokio::spawn(async move {
                    let args = if req.args.is_null() { serde_json::json!({}) } else { req.args };
                    let frame = match dispatch::dispatch(app, &req.cmd, args).await {
                        Ok(value) => serde_json::json!({ "id": req.id, "ok": true, "value": value }),
                        Err(error) => serde_json::json!({ "id": req.id, "ok": false, "error": error }),
                    };
                    let _ = tx.send(frame.to_string());
                });
            }
            Some(frame) = out_rx.recv() => {
                if socket.send(Message::Text(frame)).await.is_err() { break }
            }
            event = events.recv() => match event {
                Ok(frame) => {
                    if socket.send(Message::Text(frame)).await.is_err() { break }
                }
                // A slow tab missed some events. State is a full snapshot each
                // time, so the next one heals it; keep going.
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    /// The dispatcher is generated from lib.rs. If a command is added or
    /// removed without regenerating, the browser silently loses it.
    #[test]
    fn dispatcher_covers_every_registered_command() {
        let lib = include_str!("../lib.rs");
        let start = lib.find("generate_handler![").expect("generate_handler! in lib.rs");
        let end = start + lib[start..].find(']').expect("closing bracket");
        let registered: Vec<&str> = lib[start + "generate_handler![".len()..end]
            .split(',')
            .map(|s| s.trim().rsplit("::").next().unwrap_or("").trim())
            .filter(|s| !s.is_empty())
            .collect();
        let mut missing: Vec<&str> =
            registered.iter().copied().filter(|c| !super::dispatch::COMMANDS.contains(c)).collect();
        missing.sort();
        assert!(
            missing.is_empty(),
            "dev bridge is stale; run `python3 scripts/gen-dev-bridge.py`. Missing: {missing:?}"
        );
    }
}
