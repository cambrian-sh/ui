//! The identity plane's REVIEW lane (contract 0098) — the link inbox's transport.
//!
//! Unlike the record, policy and studio planes, this one is not premium and not
//! a separate service: `ConfirmLink`, `RetractLink`, `RetractLinksByProducer`
//! and `ListLinkCandidates` are RPCs on `OperatorConsole` itself, so everything
//! here rides [`Transport::client`] — the same connection, token and
//! interceptors as every other operator command. What varies is the kernel: one
//! without a link store never advertises the `links` capability, and the console
//! hides the queue rather than drawing it with dead buttons.
//!
//! **Three things in this file are load-bearing.**
//!
//! First, a [`Link`] is an ASSERTION, not a fact. `from_ref`/`to_ref`/`relation`
//! are the half a reviewer reads; `mechanism`, `producer`, `confidence` and
//! `evidence_id` are the half that decides whether to believe it. Every one of
//! them is carried through unmodified for that reason — a card that renders only
//! the endpoints has hidden the part the review lane exists to weigh.
//!
//! Second, [`LinkConfirmation::link`] is the row that was APPENDED — a new
//! `human`-mechanism assertion — and NOT the candidate that was confirmed. The
//! candidate is still there, untouched. A console that swapped the confirmation
//! into the candidate's place would erase exactly the producer-behaviour record
//! the lane accumulates, so this is returned as its own value rather than folded
//! over the row the operator clicked.
//!
//! Third, every mutation here generates its own `command_id` and carries the
//! caller's `reason`, exactly like the commands in `transport.rs`. The
//! `command_id` never crosses the IPC bridge: a retry from the webview is a
//! second command by design (see `lib/useMutation.ts`), and letting the webview
//! choose the key would make a double-click indistinguishable from a resend.

use serde::{Deserialize, Serialize};
use tonic::Request;

use crate::pb;
use crate::transport::{map_status, new_command_id, Transport};

/// How many candidates one read asks for.
///
/// `ListLinkCandidates` pages on `limit` alone (contract 0098) and the store
/// orders by confidence descending, so this is the top of the queue rather than
/// a window into the middle of it. Generous rather than tight: the screen counts
/// over what it holds, and a cap that silently truncated would make "12 waiting"
/// quietly wrong instead of visibly capped.
const CANDIDATE_LIMIT: i32 = 200;

/// The namespace a request falls back to when the caller names none.
///
/// The kernel applies the same default, but naming it here keeps the webview
/// from having to know the vocabulary in order to ask a plain question.
const DEFAULT_NAMESPACE: &str = "default";

/// One assertion about two typed refs.
///
/// Times stay as unix milliseconds — the wire's own shape (`LinkOp` fields
/// 13-17) — rather than being pre-formatted here, the way `policy.rs` carries
/// its `*_unix_ms` fields. `0` means unset on every one of them, which for
/// `retracted_at_unix_ms` is the difference between a live row and a tombstone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub id: String,
    pub namespace_id: String,
    /// "identity" | "relation" | "lineage".
    pub family: String,
    /// Typed refs — "entity:customer/C-1042", "event:<id>", "evidence:<id>".
    /// Identity-family endpoints arrive canonically ordered (`from_ref <
    /// to_ref`), so symmetry is a read-path property and not two rows.
    pub from_ref: String,
    pub to_ref: String,
    /// The verb. DATA, declared by the deployment's RelationRegistry — nothing
    /// in this console may branch on a specific value.
    pub relation: String,
    /// "candidate" | "confirmed" | "retracted" — the review lane, not a
    /// confidence bucket.
    pub state: String,
    /// HOW the assertion was made. It carries the trust ceiling: `derived`,
    /// `scored` and `correlation` can never write `confirmed`, which is why a
    /// mechanism is worth as much screen space as the endpoints.
    pub mechanism: String,
    /// name@version of the producing pass — the BATCH-REVOCATION key. Without it
    /// a bad pass is undone row by row.
    pub producer: String,
    /// Orders the queue. It does NOT lift a mechanism's ceiling.
    pub confidence: f64,
    pub evidence_id: String,
    pub asserted_by: String,
    pub asserted_at_unix_ms: i64,
    pub recorded_at_unix_ms: i64,
    /// When the described relation HELD, as distinct from when it was asserted.
    /// 0 = unbounded on that side.
    pub valid_from_unix_ms: i64,
    pub valid_to_unix_ms: i64,
    /// 0 for a live row.
    pub retracted_at_unix_ms: i64,
    /// The producing source's native reference, UNQUALIFIED — no `@r<rev>`.
    pub source_ref: String,
}

/// What a confirmation actually did.
///
/// `link` is the appended `human`-mechanism row — see the module note on why it
/// is not the candidate. `deduped` is a replayed `command_id`, which for this
/// RPC also covers a re-confirmation: confirming twice is idempotent and returns
/// the existing row rather than stacking a second human assertion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkConfirmation {
    pub command_id: String,
    pub deduped: bool,
    pub link: Option<Link>,
}

/// What a batch revocation actually revoked.
///
/// `retracted` is the count of unretracted rows the pass stamped. `0` is an
/// ANSWER — the producer key names nothing live — and it is the answer an
/// operator needs before assuming the cleanup worked, which is why it is carried
/// rather than collapsed into a boolean.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProducerRevocation {
    pub command_id: String,
    pub deduped: bool,
    pub retracted: i32,
}

impl Transport {
    /// The review inbox: unretracted proposals, highest confidence first.
    ///
    /// Poll-only. Candidates are not on the operator event feed, so the screen
    /// re-reads after a decision rather than waiting for a fold — and it must
    /// say so rather than draw a live indicator over a poll.
    pub async fn list_link_candidates(
        &self,
        namespace_id: String,
        limit: i32,
    ) -> Result<Vec<Link>, String> {
        let mut client = self.client().await?;
        let resp = client
            .list_link_candidates(Request::new(pb::ListLinkCandidatesOpRequest {
                namespace_id: namespace_of(namespace_id),
                limit: if limit > 0 { limit } else { CANDIDATE_LIMIT },
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(resp.candidates.into_iter().map(map_link).collect())
    }

    /// Promote one candidate. APPENDS a human-mechanism row; the candidate is
    /// left exactly as it was.
    pub async fn confirm_link(
        &self,
        link_id: String,
        reason: String,
        namespace_id: String,
    ) -> Result<LinkConfirmation, String> {
        let mut client = self.client().await?;
        let resp = client
            .confirm_link(Request::new(pb::ConfirmLinkOpRequest {
                command_id: new_command_id(),
                reason,
                namespace_id: namespace_of(namespace_id),
                link_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(LinkConfirmation {
            command_id: resp.command_id,
            deduped: resp.deduped,
            link: resp.link.map(map_link),
        })
    }

    /// Reject one candidate. Stamps `state` + `retracted_at` and touches nothing
    /// else — never a delete (ADR-0093 D6), because a rejected proposal has to
    /// stay queryable or the producer that made it proposes it again forever.
    pub async fn retract_link(
        &self,
        link_id: String,
        reason: String,
        namespace_id: String,
    ) -> Result<bool, String> {
        let mut client = self.client().await?;
        let ack = client
            .retract_link(Request::new(pb::RetractLinkOpRequest {
                command_id: new_command_id(),
                reason,
                namespace_id: namespace_of(namespace_id),
                link_id,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ack.deduped)
    }

    /// Undo a whole producing pass.
    ///
    /// `producer` is the EXACT `name@version` key, never a prefix or a pattern:
    /// revocation is destructive enough that a typo matching more than intended
    /// must be impossible to express.
    pub async fn retract_links_by_producer(
        &self,
        producer: String,
        reason: String,
        namespace_id: String,
    ) -> Result<ProducerRevocation, String> {
        let mut client = self.client().await?;
        let resp = client
            .retract_links_by_producer(Request::new(pb::RetractLinksByProducerOpRequest {
                command_id: new_command_id(),
                reason,
                namespace_id: namespace_of(namespace_id),
                producer,
            }))
            .await
            .map_err(map_status)?
            .into_inner();
        Ok(ProducerRevocation {
            command_id: resp.command_id,
            deduped: resp.deduped,
            retracted: resp.retracted,
        })
    }
}

/// An empty namespace means "the default one", not "every namespace".
///
/// The kernel already defaults it, so this changes no behaviour — it makes the
/// value the console sent visible in a trace instead of blank, which is the
/// difference between reading a request and guessing what it meant.
fn namespace_of(namespace_id: String) -> String {
    if namespace_id.trim().is_empty() {
        DEFAULT_NAMESPACE.to_string()
    } else {
        namespace_id
    }
}

fn map_link(l: pb::LinkOp) -> Link {
    Link {
        id: l.id,
        namespace_id: l.namespace_id,
        family: l.family,
        from_ref: l.from_ref,
        to_ref: l.to_ref,
        relation: l.relation,
        state: l.state,
        mechanism: l.mechanism,
        producer: l.producer,
        confidence: l.confidence,
        evidence_id: l.evidence_id,
        asserted_by: l.asserted_by,
        asserted_at_unix_ms: l.asserted_at_unix_ms,
        recorded_at_unix_ms: l.recorded_at_unix_ms,
        valid_from_unix_ms: l.valid_from_unix_ms,
        valid_to_unix_ms: l.valid_to_unix_ms,
        retracted_at_unix_ms: l.retracted_at_unix_ms,
        source_ref: l.source_ref,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blank_namespace_becomes_the_default_one() {
        // Blank is the webview's "I did not choose", and the only correct
        // reading of it is the default namespace. Sending "" would be a request
        // whose scope nothing downstream can name.
        assert_eq!(namespace_of(String::new()), "default");
        assert_eq!(namespace_of("   ".to_string()), "default");
        assert_eq!(namespace_of("vantis".to_string()), "vantis");
    }

    #[test]
    fn every_field_of_the_assertion_survives_the_projection() {
        // The mechanism/producer/confidence/evidence half is what a reviewer
        // weighs. Dropping any of it here would leave the card rendering only
        // the endpoints, which is the failure the LinkOp doc comment names.
        let l = map_link(pb::LinkOp {
            id: "lnk_1".into(),
            namespace_id: "default".into(),
            family: "identity".into(),
            from_ref: "entity:customer/C-1042".into(),
            to_ref: "entity:customer/C-9001".into(),
            relation: "same_as".into(),
            state: "candidate".into(),
            mechanism: "derived".into(),
            producer: "normalizer@1".into(),
            confidence: 0.62,
            evidence_id: "ev_77".into(),
            asserted_by: "identity-producers".into(),
            asserted_at_unix_ms: 1_700_000_000_000,
            recorded_at_unix_ms: 1_700_000_000_500,
            valid_from_unix_ms: 0,
            valid_to_unix_ms: 0,
            retracted_at_unix_ms: 0,
            source_ref: "norm:C-1042".into(),
        });
        assert_eq!(l.mechanism, "derived");
        assert_eq!(l.producer, "normalizer@1");
        assert_eq!(l.evidence_id, "ev_77");
        assert!((l.confidence - 0.62).abs() < f64::EPSILON);
        // 0 is "live", not "retracted at the epoch".
        assert_eq!(l.retracted_at_unix_ms, 0);
    }
}
