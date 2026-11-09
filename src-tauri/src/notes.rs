//! Principal memory notes (ADR-0139 D14, capability `memory-notes`).
//!
//! A notes document is addressed by `(scope, owner_id)`: scope is "personal"
//! (owner = a principal id) or "org" (owner = an org id). An operator edit lands
//! for the principal's NEXT run; a run in flight keeps its frozen snapshot.
//!
//! The write path is optimistic-concurrency: `SetMemoryNotes` takes the etag the
//! editor started from as `if_match`, and a mismatch comes back as
//! `accepted = false, rejection = "conflict"` — an ANSWER, not a gRPC error. That
//! is why [`NotesWriteResult`] carries `accepted`/`rejection` instead of mapping
//! them to `Err`: the screen has to tell "someone else saved first" (offer a
//! merge) apart from "the kernel refused this content" (over budget, injection
//! flagged) and from a transport failure.

use serde::Serialize;
use tonic::Request;

use crate::pb;
use crate::state::ts_millis;
use crate::transport::{map_status, new_command_id, Transport};

#[derive(Debug, Clone, Serialize)]
pub struct NotesSummary {
    pub scope: String,
    pub owner_id: String,
    pub size_chars: i32,
    pub budget_chars: i32,
    pub etag: String,
    pub updated_at_unix_ms: i64,
    pub updated_by: String,
    pub over_budget: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesDocument {
    pub scope: String,
    pub owner_id: String,
    pub content: String,
    pub size_chars: i32,
    pub budget_chars: i32,
    pub etag: String,
    pub updated_at_unix_ms: i64,
    pub updated_by: String,
    pub budget_overridden: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesWriteResult {
    pub deduped: bool,
    pub accepted: bool,
    /// "over_budget" | "injection_flagged" | "scope_denied" | "conflict" | "".
    pub rejection: String,
    pub detail: String,
    pub etag: String,
    pub size_chars: i32,
    pub budget_chars: i32,
}

impl Transport {
    pub async fn list_memory_notes(&self, scope: String, owner_id: String) -> Result<Vec<NotesSummary>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_memory_notes(Request::new(pb::ListMemoryNotesOpRequest {
                scope,
                owner_id,
                page: 0,
                page_size: 500,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp
            .notes
            .into_iter()
            .map(|n| NotesSummary {
                updated_at_unix_ms: ts_millis(&n.updated_at),
                scope: n.scope,
                owner_id: n.owner_id,
                size_chars: n.size_chars,
                budget_chars: n.budget_chars,
                etag: n.etag,
                updated_by: n.updated_by,
                over_budget: n.over_budget,
            })
            .collect())
    }

    pub async fn get_memory_notes(&self, scope: String, owner_id: String) -> Result<NotesDocument, String> {
        let mut client = self.client().await?;
        let n = client
            .get_memory_notes(Request::new(pb::GetMemoryNotesOpRequest { scope, owner_id }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(NotesDocument {
            updated_at_unix_ms: ts_millis(&n.updated_at),
            scope: n.scope,
            owner_id: n.owner_id,
            content: n.content,
            size_chars: n.size_chars,
            budget_chars: n.budget_chars,
            etag: n.etag,
            updated_by: n.updated_by,
            budget_overridden: n.budget_overridden,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn set_memory_notes(
        &self,
        scope: String,
        owner_id: String,
        content: String,
        if_match: String,
        override_injection_flag: bool,
        reason: String,
    ) -> Result<NotesWriteResult, String> {
        let mut client = self.client().await?;
        let r = client
            .set_memory_notes(Request::new(pb::SetMemoryNotesOpRequest {
                command_id: new_command_id(),
                reason,
                scope,
                owner_id,
                content,
                if_match,
                override_injection_flag,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(NotesWriteResult {
            deduped: r.deduped,
            accepted: r.accepted,
            rejection: r.rejection,
            detail: r.detail,
            etag: r.etag,
            size_chars: r.size_chars,
            budget_chars: r.budget_chars,
        })
    }

    pub async fn delete_memory_notes(&self, scope: String, owner_id: String, reason: String) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .delete_memory_notes(Request::new(pb::DeleteMemoryNotesOpRequest {
                command_id: new_command_id(),
                reason,
                scope,
                owner_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn set_memory_notes_budget(
        &self,
        scope: String,
        owner_id: String,
        budget_chars: i32,
        clear_override: bool,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_memory_notes_budget(Request::new(pb::SetMemoryNotesBudgetOpRequest {
                command_id: new_command_id(),
                reason,
                scope,
                owner_id,
                budget_chars,
                clear_override,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }
}
