//! Kernel logs on the operator plane (contract 0082).
//!
//! Two shapes, because they answer different questions. `query_logs` reads the
//! kernel's retention window — history, filtered, bounded. `start_log_tail`
//! holds a server stream open and emits each record to the webview, the same way
//! the event feed does, so the console never polls.
//!
//! Both are OPERATOR-ONLY at the kernel. A Viewer's token is refused with
//! `PermissionDenied`, because a log line carries whatever the kernel happened
//! to write and bypasses the access-policy plane entirely.

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, Transport};

/// One retained log line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogRecord {
    /// Monotonic within a boot — the resume cursor.
    pub seq: u64,
    pub at_unix_ms: i64,
    /// "debug" | "info" | "warn" | "error"
    pub level: String,
    /// An agent's logger name, or the message's own prefix ("ADR-0074").
    pub component: String,
    pub message: String,
    pub attrs: Vec<LogAttr>,
    /// Changes on every kernel start — how a reader tells a restart happened.
    pub boot_id: String,
    /// The message or an attribute was clipped to keep the window's memory
    /// ceiling real. Never render a clipped value as the whole one.
    pub truncated: bool,
}

/// One attribute, with its type preserved.
///
/// `kind` lets the console compare `status=504` as a number rather than as text
/// — flattening every value to a string is what would put it back to regex.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogAttr {
    pub key: String,
    /// "string" | "int" | "float" | "bool"
    pub kind: String,
    /// Rendered form, always present so a row can draw without a type switch.
    pub value: String,
    /// Numeric form when `kind` is int or float, for comparisons and sorting.
    pub num: Option<f64>,
}

/// What the kernel's window can currently answer for.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LogWindow {
    pub boot_id: String,
    pub capacity: i32,
    pub count: i32,
    /// Records overwritten since boot. Non-zero means the window no longer
    /// reaches back to kernel start, and the console must say so.
    pub dropped: u64,
    pub oldest_unix_ms: i64,
    pub newest_unix_ms: i64,
    /// Newest sequence issued — where a tail resumes from.
    pub last_seq: u64,
}

/// A filter. Every field optional; empty matches the whole window.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LogFilter {
    pub level_at_least: Option<String>,
    pub components: Option<Vec<String>>,
    pub contains: Option<String>,
    pub attr_equals: Option<std::collections::HashMap<String, String>>,
    pub since_unix_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogPage {
    pub records: Vec<LogRecord>,
    pub window: LogWindow,
}

/// The Tauri event each tailed record arrives on.
pub const EV_LOG: &str = "kernel://log";

impl From<LogFilter> for pb::LogFilterOp {
    fn from(f: LogFilter) -> Self {
        pb::LogFilterOp {
            level_at_least: f.level_at_least.unwrap_or_default(),
            components: f.components.unwrap_or_default(),
            contains: f.contains.unwrap_or_default(),
            attr_equals: f.attr_equals.unwrap_or_default(),
            since_unix_ms: f.since_unix_ms.unwrap_or(0),
        }
    }
}

fn attr_from_proto(a: pb::LogAttrOp) -> LogAttr {
    use pb::log_attr_op::Value;
    let key = a.key;
    match a.value {
        Some(Value::S(s)) => LogAttr { key, kind: "string".into(), value: s, num: None },
        Some(Value::I(i)) => LogAttr {
            key,
            kind: "int".into(),
            value: i.to_string(),
            num: Some(i as f64),
        },
        Some(Value::F(f)) => LogAttr {
            key,
            kind: "float".into(),
            value: f.to_string(),
            num: Some(f),
        },
        Some(Value::B(b)) => LogAttr {
            key,
            kind: "bool".into(),
            value: b.to_string(),
            num: None,
        },
        // An attribute the kernel sent with no value set. Rendered as present but
        // empty rather than dropped: its PRESENCE is a fact the filter rail uses.
        None => LogAttr { key, kind: "string".into(), value: String::new(), num: None },
    }
}

fn record_from_proto(r: pb::LogRecordOp) -> LogRecord {
    LogRecord {
        seq: r.seq,
        at_unix_ms: r.at_unix_ms,
        level: r.level,
        component: r.component,
        message: r.message,
        attrs: r.attrs.into_iter().map(attr_from_proto).collect(),
        boot_id: r.boot_id,
        truncated: r.truncated,
    }
}

fn window_from_proto(w: Option<pb::LogWindowOp>) -> LogWindow {
    let w = match w {
        Some(w) => w,
        None => return LogWindow::default(),
    };
    LogWindow {
        boot_id: w.boot_id,
        capacity: w.capacity,
        count: w.count,
        dropped: w.dropped,
        oldest_unix_ms: w.oldest_unix_ms,
        newest_unix_ms: w.newest_unix_ms,
        last_seq: w.last_seq,
    }
}

/// Tracks the running tail so a second start replaces the first rather than
/// stacking two streams onto one event channel.
#[derive(Clone, Default)]
pub struct LogTail {
    stop: Arc<Mutex<Option<Arc<Notify>>>>,
}

impl LogTail {
    /// Stops the running tail, if any. Idempotent.
    pub fn stop(&self) {
        if let Some(n) = self.stop.lock().unwrap().take() {
            n.notify_waiters();
        }
    }

    fn swap(&self, next: Arc<Notify>) {
        // Replace under the same lock the stopper uses, so a start racing a stop
        // cannot leave an orphaned stream emitting into the console.
        let mut guard = self.stop.lock().unwrap();
        if let Some(prev) = guard.take() {
            prev.notify_waiters();
        }
        *guard = Some(next);
    }
}

impl Transport {
    /// Read the kernel's retention window.
    pub async fn query_logs(
        &self,
        filter: LogFilter,
        after_seq: u64,
        limit: i32,
    ) -> Result<LogPage, String> {
        let mut client = self.client().await?;
        let resp = client
            .query_logs(Request::new(pb::QueryLogsOpRequest {
                filter: Some(filter.into()),
                after_seq,
                limit,
            }))
            .await
            .map_err(map_status)?
            .into_inner();

        Ok(LogPage {
            records: resp.records.into_iter().map(record_from_proto).collect(),
            window: window_from_proto(resp.window),
        })
    }

    /// Hold a tail open, emitting each record to the webview.
    ///
    /// `after_seq` of 0 starts at the kernel's live edge rather than replaying
    /// the window — the console asks for history with `query_logs` first, then
    /// tails from the sequence it received.
    pub fn start_log_tail(
        &self,
        app: AppHandle,
        tail: LogTail,
        filter: LogFilter,
        after_seq: u64,
    ) {
        let stop = Arc::new(Notify::new());
        tail.swap(stop.clone());

        let this = self.clone();
        tokio::spawn(async move {
            let mut client = match this.client().await {
                Ok(c) => c,
                Err(e) => {
                    // Surfaced rather than swallowed: a console showing nothing
                    // must be able to tell "quiet kernel" from "never connected".
                    let _ = app.emit(EV_LOG_ERROR, e);
                    return;
                }
            };
            let stream = client
                .tail_logs(Request::new(pb::TailLogsOpRequest {
                    filter: Some(filter.into()),
                    after_seq,
                }))
                .await;

            let mut stream = match stream {
                Ok(s) => s.into_inner(),
                Err(st) => {
                    let _ = app.emit(EV_LOG_ERROR, map_status(st));
                    return;
                }
            };

            loop {
                tokio::select! {
                    _ = stop.notified() => return,
                    next = stream.message() => match next {
                        Ok(Some(rec)) => {
                            let _ = app.emit(EV_LOG, record_from_proto(rec));
                        }
                        // The kernel ended the stream, or it failed. Either way the
                        // tail is over; the console keeps what it has and says the
                        // tail stopped rather than pretending it is still live.
                        Ok(None) => return,
                        Err(st) => {
                            let _ = app.emit(EV_LOG_ERROR, map_status(st));
                            return;
                        }
                    },
                }
            }
        });
    }
}

/// Where a tail reports that it stopped and why.
pub const EV_LOG_ERROR: &str = "kernel://log-error";
