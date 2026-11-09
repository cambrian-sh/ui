//! Skill lifecycle (ADR-0139 D13, capability `skills-lifecycle`) and per-agent
//! skill grants (decisions/skill-access-grants.md, capability `skill-grants`).
//!
//! Every RPC here is on `OperatorConsole` itself, so it rides
//! [`Transport::client`] — the same connection, token and interceptors as every
//! other operator command. Nothing in this file is premium.
//!
//! Two things are load-bearing:
//!
//! * The catalog read ([`Transport::list_skills_full`]) carries EVERY `SkillOp`
//!   field through. The older `list_skills` maps to the lossy `SkillSummary` the
//!   feed projection holds, which filled `loaded_in_count`/`last_loaded_at` with
//!   zeros the kernel never sent; the skills screen reads this one instead.
//! * Every mutation generates its own `command_id` here and carries the caller's
//!   mandatory `reason`. The `command_id` never crosses the IPC bridge (see
//!   `links.rs` for why a webview-chosen key is wrong).
//!
//! Times are unix milliseconds (`0` = unset), the shape `links.rs` and
//! `policy.rs` already use, so the webview formats them in one place.

use serde::Serialize;
use tonic::Request;

use crate::pb;
use crate::state::ts_millis;
use crate::transport::{map_status, new_command_id, Transport};

/// One skill, unabridged (`SkillOp`, contract 0074 + ADR-0139 D13 fields).
#[derive(Debug, Clone, Serialize)]
pub struct SkillRecord {
    pub name: String,
    pub description: String,
    pub tool_grants: Vec<String>,
    pub scope_tags: Vec<String>,
    pub body: String,
    pub source_path: String,
    /// Empty on a kernel without `skills-lifecycle`.
    pub version: String,
    /// "builtin" | "official" | "hub" | "agent-proposed" — shown as-is.
    pub source: String,
    /// "active" | "stale" | "archived" — "" on an older kernel.
    pub lifecycle_state: String,
    pub state_changed_at_unix_ms: i64,
    pub locked: bool,
    /// "pinned" | "pipeline" | "schedule" | "".
    pub exempt_reason: String,
    pub use_count: i64,
    pub success_count: i64,
    pub last_used_at_unix_ms: i64,
    pub ledger_entry_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillProposal {
    pub id: String,
    pub name: String,
    pub skill_md: String,
    pub rationale: String,
    /// "pending" | "approved" | "rejected".
    pub state: String,
    pub proposer_agent_id: String,
    pub principal_id: String,
    pub source_run_id: String,
    pub evidence_cids: Vec<String>,
    pub base_version: String,
    pub current_version: String,
    /// "clean" | "suspicious" | "dangerous".
    pub scan_verdict: String,
    pub scan_findings: Vec<String>,
    pub created_at_unix_ms: i64,
    pub decided_at_unix_ms: i64,
    pub decided_by: String,
    pub decision_note: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillProposalDecision {
    pub deduped: bool,
    pub skill_version: String,
    pub ledger_entry_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillLedgerEntry {
    pub id: String,
    pub skill_name: String,
    pub mutation: String,
    pub from_version: String,
    pub to_version: String,
    pub from_state: String,
    pub to_state: String,
    pub actor: String,
    pub reason: String,
    pub at_unix_ms: i64,
    pub proposal_id: String,
    pub rollback_of: String,
    pub restorable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillRollback {
    pub deduped: bool,
    pub ledger_entry_id: String,
    pub skill_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillGrant {
    pub id: String,
    pub agent_id: String,
    pub skill_name: String,
    /// "request" | "proposal" | "operator".
    pub source: String,
    pub granted_by: String,
    pub granted_at_unix_ms: i64,
    pub reason: String,
    /// 0 = active.
    pub revoked_at_unix_ms: i64,
    pub revoked_by: String,
    pub revoke_reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillAccessRequest {
    pub id: String,
    pub agent_id: String,
    pub skill_name: String,
    pub run_id: String,
    pub rationale: String,
    /// "pending" | "granted" | "denied".
    pub state: String,
    pub requested_at_unix_ms: i64,
    pub decided_at_unix_ms: i64,
    pub decided_by: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillGrants {
    pub grants: Vec<SkillGrant>,
    pub requests: Vec<SkillAccessRequest>,
}

/// A page cap generous enough that the screen counts over what it holds rather
/// than over a silent window. The kernel caps it again on its side.
const PAGE_SIZE: i32 = 500;

fn skill_record(s: pb::SkillOp) -> SkillRecord {
    SkillRecord {
        state_changed_at_unix_ms: ts_millis(&s.state_changed_at),
        last_used_at_unix_ms: ts_millis(&s.last_used_at),
        name: s.name,
        description: s.description,
        tool_grants: s.tool_grants,
        scope_tags: s.scope_tags,
        body: s.body,
        source_path: s.source_path,
        version: s.version,
        source: s.source,
        lifecycle_state: s.lifecycle_state,
        locked: s.locked,
        exempt_reason: s.exempt_reason,
        use_count: s.use_count,
        success_count: s.success_count,
        ledger_entry_id: s.ledger_entry_id,
    }
}

fn proposal(p: pb::SkillProposalOp) -> SkillProposal {
    SkillProposal {
        created_at_unix_ms: ts_millis(&p.created_at),
        decided_at_unix_ms: ts_millis(&p.decided_at),
        id: p.id,
        name: p.name,
        skill_md: p.skill_md,
        rationale: p.rationale,
        state: p.state,
        proposer_agent_id: p.proposer_agent_id,
        principal_id: p.principal_id,
        source_run_id: p.source_run_id,
        evidence_cids: p.evidence_cids,
        base_version: p.base_version,
        current_version: p.current_version,
        scan_verdict: p.scan_verdict,
        scan_findings: p.scan_findings,
        decided_by: p.decided_by,
        decision_note: p.decision_note,
    }
}

fn ledger_entry(e: pb::SkillLedgerEntryOp) -> SkillLedgerEntry {
    SkillLedgerEntry {
        at_unix_ms: ts_millis(&e.at),
        id: e.id,
        skill_name: e.skill_name,
        mutation: e.mutation,
        from_version: e.from_version,
        to_version: e.to_version,
        from_state: e.from_state,
        to_state: e.to_state,
        actor: e.actor,
        reason: e.reason,
        proposal_id: e.proposal_id,
        rollback_of: e.rollback_of,
        restorable: e.restorable,
    }
}

fn grant(g: pb::SkillGrantOp) -> SkillGrant {
    SkillGrant {
        granted_at_unix_ms: ts_millis(&g.granted_at),
        revoked_at_unix_ms: ts_millis(&g.revoked_at),
        id: g.id,
        agent_id: g.agent_id,
        skill_name: g.skill_name,
        source: g.source,
        granted_by: g.granted_by,
        reason: g.reason,
        revoked_by: g.revoked_by,
        revoke_reason: g.revoke_reason,
    }
}

fn access_request(r: pb::SkillAccessRequestOp) -> SkillAccessRequest {
    SkillAccessRequest {
        requested_at_unix_ms: ts_millis(&r.requested_at),
        decided_at_unix_ms: ts_millis(&r.decided_at),
        id: r.id,
        agent_id: r.agent_id,
        skill_name: r.skill_name,
        run_id: r.run_id,
        rationale: r.rationale,
        state: r.state,
        decided_by: r.decided_by,
    }
}

impl Transport {
    /// The whole catalog, every field. `include_archived` adds archived skills
    /// (the kernel's default listing is active + stale).
    pub async fn list_skills_full(&self, include_archived: bool) -> Result<Vec<SkillRecord>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_skills(Request::new(pb::ListSkillsOpRequest {
                page: 0,
                page_size: PAGE_SIZE,
                include_archived,
                ..Default::default()
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.skills.into_iter().map(skill_record).collect())
    }

    pub async fn list_skill_proposals(
        &self,
        state: String,
        skill_name: String,
    ) -> Result<Vec<SkillProposal>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_skill_proposals(Request::new(pb::ListSkillProposalsOpRequest {
                state,
                skill_name,
                page: 0,
                page_size: PAGE_SIZE,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.proposals.into_iter().map(proposal).collect())
    }

    pub async fn decide_skill_proposal(
        &self,
        proposal_id: String,
        approve: bool,
        lock_after_approve: bool,
        reason: String,
    ) -> Result<SkillProposalDecision, String> {
        let mut client = self.client().await?;
        let resp = client
            .decide_skill_proposal(Request::new(pb::DecideSkillProposalOpRequest {
                command_id: new_command_id(),
                reason,
                proposal_id,
                approve,
                lock_after_approve,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SkillProposalDecision {
            deduped: resp.deduped,
            skill_version: resp.skill_version,
            ledger_entry_id: resp.ledger_entry_id,
        })
    }

    pub async fn set_skill_lock(&self, skill_name: String, locked: bool, reason: String) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .set_skill_lock(Request::new(pb::SetSkillLockOpRequest {
                command_id: new_command_id(),
                reason,
                skill_name,
                locked,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn list_skill_ledger(&self, skill_name: String) -> Result<Vec<SkillLedgerEntry>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_skill_ledger(Request::new(pb::ListSkillLedgerOpRequest {
                skill_name,
                page: 0,
                page_size: PAGE_SIZE,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.entries.into_iter().map(ledger_entry).collect())
    }

    pub async fn rollback_skill(
        &self,
        skill_name: String,
        ledger_entry_id: String,
        reason: String,
    ) -> Result<SkillRollback, String> {
        let mut client = self.client().await?;
        let resp = client
            .rollback_skill(Request::new(pb::RollbackSkillOpRequest {
                command_id: new_command_id(),
                reason,
                skill_name,
                ledger_entry_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SkillRollback {
            deduped: resp.deduped,
            ledger_entry_id: resp.ledger_entry_id,
            skill_version: resp.skill_version,
        })
    }

    pub async fn list_skill_grants(
        &self,
        agent_id: String,
        skill_name: String,
        include_revoked: bool,
        request_state: String,
    ) -> Result<SkillGrants, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_skill_grants(Request::new(pb::ListSkillGrantsOpRequest {
                agent_id,
                skill_name,
                include_revoked,
                request_state,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(SkillGrants {
            grants: resp.grants.into_iter().map(grant).collect(),
            requests: resp.requests.into_iter().map(access_request).collect(),
        })
    }

    pub async fn grant_skill(&self, agent_id: String, skill_name: String, reason: String) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .grant_skill(Request::new(pb::GrantSkillOpRequest {
                command_id: new_command_id(),
                reason,
                agent_id,
                skill_name,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    pub async fn revoke_skill_grant(
        &self,
        agent_id: String,
        skill_name: String,
        reason: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .revoke_skill_grant(Request::new(pb::RevokeSkillGrantOpRequest {
                command_id: new_command_id(),
                reason,
                agent_id,
                skill_name,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }
}
