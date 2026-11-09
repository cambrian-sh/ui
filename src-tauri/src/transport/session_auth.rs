//! ADR-0142 D1 on the transport: which sign-in methods a kernel offers
//! (`DescribeAuth`), the OIDC session (sign-in, refresh, resume, logout), the
//! plane-role probe, and the MEMBER lane.
//!
//! A child module of `transport` so it can use the Transport's private fields
//! and helpers without widening them for the rest of the crate.
//!
//! ## The member lane
//!
//! A person with no console role (`member`) may call only their own surfaces
//! (kernel `memberMethods`): the conversation lane, their own accounts, their
//! own approvals, Logout. `Snapshot` and `StreamEvents` are refused, so the feed
//! loop cannot run for them — it would retry a PermissionDenied forever. The
//! member lane replaces it: it learns which member surfaces exist by calling
//! them (the handshake is closed to members), marks the connection live, and
//! streams `WatchMyApprovals` into the pending set the Inbox renders.

use std::sync::atomic::Ordering;

use super::*;
use crate::oidc::{self, OidcSession};
use crate::state::Identity;

/// What a kernel offers for sign-in (DescribeAuth), for the login screen.
#[derive(Clone, serde::Serialize, Debug, Default, PartialEq)]
pub struct AuthMethods {
    pub password_login: bool,
    pub oidc_issuer: String,
    pub oidc_client_id: String,
    /// False when the kernel predates DescribeAuth (Unimplemented): it can only
    /// take a password, which is what the login screen then offers.
    pub describe_supported: bool,
}

/// Map a DescribeAuth answer (or its absence) to the methods to offer.
pub(crate) fn auth_methods(r: Result<pb::DescribeAuthResponse, Status>) -> Result<AuthMethods, String> {
    match r {
        Ok(d) => Ok(AuthMethods {
            password_login: d.password_login,
            oidc_issuer: d.oidc_issuer,
            oidc_client_id: d.oidc_client_id,
            describe_supported: true,
        }),
        Err(s) if s.code() == tonic::Code::Unimplemented => Ok(AuthMethods {
            password_login: true,
            describe_supported: false,
            ..Default::default()
        }),
        Err(s) => Err(format!("could not ask the kernel how to sign in: {}", s.message())),
    }
}

/// The plane role a bearer has, from two harmless reads (no WhoAmI exists:
/// T-20261106-operator-plane-has-no-whoami-an-oidc-signed-in).
/// - `Snapshot` is open to operator and viewer, refused to member.
/// - `ListScheduledTasks` is an operator-only READ (kernel `operatorOnlyReads`),
///   so it tells an operator from a viewer without changing anything.
pub(crate) fn plane_role(snapshot: Result<(), Status>, operator_read: Result<(), Status>) -> Result<String, String> {
    match snapshot {
        Ok(()) => {}
        Err(s) if s.code() == tonic::Code::PermissionDenied => return Ok("member".into()),
        Err(s) if s.code() == tonic::Code::Unauthenticated => {
            return Err("the kernel refused the identity provider's access token. Its `aud` must name \
                 the console's client id (Keycloak: add an Audience protocol mapper to the client), \
                 and the person must not be suspended."
                .into())
        }
        Err(s) => return Err(format!("the kernel did not accept the sign-in: {}", s.message())),
    }
    match operator_read {
        Err(s) if s.code() == tonic::Code::PermissionDenied => Ok("viewer".into()),
        // Ok, or a kernel without the RPC (Unimplemented): Operator. The kernel
        // still enforces every mutation, so a wrong guess shows a control that is
        // refused on use, never one that works when it should not.
        _ => Ok("operator".into()),
    }
}

// ---- The remembered OIDC sign-in (OS keychain) ------------------------------
//
// Only the REFRESH token is kept, and only with "Remember this instance": it is
// what lets the next launch resume without a browser round trip. Access tokens
// are never written anywhere but memory (the bearer slot's keychain mirror
// aside, which `set_token` has always kept and `disconnect` clears).

const SAVED_OIDC: &str = "saved-oidc";

pub(crate) fn save_oidc(endpoint: &str, s: &OidcSession) {
    let Some(rt) = s.tokens.refresh_token.as_deref() else {
        return; // nothing that could resume a session; do not pretend
    };
    match keyring::Entry::new("cambrian-ui", SAVED_OIDC) {
        Ok(entry) => {
            let blob = format!("{endpoint}\n{}\n{}\n{rt}", s.issuer, s.client_id);
            if let Err(err) = entry.set_password(&blob) {
                tracing::warn!(?err, "keychain write failed; this sign-in will not be remembered");
            }
        }
        Err(err) => tracing::warn!(?err, "keychain unavailable; this sign-in will not be remembered"),
    }
}

pub(crate) fn clear_saved_oidc() {
    if let Ok(entry) = keyring::Entry::new("cambrian-ui", SAVED_OIDC) {
        let _ = entry.delete_credential();
    }
}

/// (endpoint, issuer, client_id, refresh_token)
pub(crate) fn saved_oidc() -> Option<(String, String, String, String)> {
    let entry = keyring::Entry::new("cambrian-ui", SAVED_OIDC).ok()?;
    let blob = match entry.get_password() {
        Ok(v) => v,
        Err(keyring::Error::NoEntry) => return None,
        Err(err) => {
            tracing::warn!(?err, "keychain read failed; cannot resume the sign-in");
            return None;
        }
    };
    let mut p = blob.splitn(4, '\n');
    let (e, i, c, r) = (p.next()?, p.next()?, p.next()?, p.next()?);
    if e.is_empty() || i.is_empty() || r.is_empty() {
        return None;
    }
    Some((e.into(), i.into(), c.into(), r.into()))
}

impl Transport {
    /// Ask a kernel how to sign in. Unauthenticated by design (the kernel's
    /// auth gate exempts DescribeAuth), so it dials without the bearer.
    pub async fn describe_auth(&self, endpoint: &str) -> Result<AuthMethods, String> {
        let channel = Self::dial(endpoint).await?;
        let mut c = OperatorConsoleClient::new(channel);
        let r = tokio::time::timeout(
            Duration::from_secs(10),
            c.describe_auth(Request::new(pb::DescribeAuthRequest {})),
        )
        .await
        .map_err(|_| "the kernel did not answer within 10s".to_string())?;
        auth_methods(r.map(|r| r.into_inner()))
    }

    /// Interactive OIDC sign-in: system browser + loopback redirect.
    pub async fn login_oidc(&self, app: &AppHandle, endpoint: String, remember: bool) -> Result<String, String> {
        let m = self.describe_auth(&endpoint).await?;
        if m.oidc_issuer.is_empty() {
            return Err("this kernel has no single sign-on provider configured".into());
        }
        let opener = app.clone();
        let session = oidc::sign_in(
            &m.oidc_issuer,
            &m.oidc_client_id,
            move |url| {
                use tauri_plugin_opener::OpenerExt;
                // The URL carries state, nonce and the PKCE CHALLENGE (never the
                // verifier); it is handed to the system browser and not logged.
                opener
                    .opener()
                    .open_url(url, None::<&str>)
                    .map_err(|e| format!("could not open the system browser: {e}"))
            },
            oidc::FLOW_TIMEOUT,
        )
        .await?;
        self.begin_oidc_session(app, endpoint, session, remember).await
    }

    /// Resume a remembered OIDC sign-in (launch auto-connect) by refreshing.
    pub async fn login_oidc_saved(&self, app: &AppHandle) -> Result<String, String> {
        let (endpoint, issuer, client_id, rt) = saved_oidc().ok_or("no saved sign-in")?;
        // The kernel decides which issuer it trusts. If that changed, the saved
        // session belongs to a different setup: forget it rather than replay it.
        let m = self.describe_auth(&endpoint).await?;
        if m.oidc_issuer.trim_end_matches('/') != issuer.trim_end_matches('/') || m.oidc_client_id != client_id {
            clear_saved_oidc();
            return Err("this kernel's sign-in provider changed since you last signed in; sign in again".into());
        }
        let session = OidcSession::resume(&issuer, &client_id, rt).await.map_err(|e| {
            // A dead refresh token cannot become alive again.
            clear_saved_oidc();
            format!("your saved sign-in has ended ({e}); sign in again")
        })?;
        self.begin_oidc_session(app, endpoint, session, true).await
    }

    async fn begin_oidc_session(
        &self,
        app: &AppHandle,
        endpoint: String,
        session: OidcSession,
        remember: bool,
    ) -> Result<String, String> {
        let gen = self.auth_gen.fetch_add(1, Ordering::SeqCst) + 1;
        *self.stop_requested.lock().unwrap() = false;
        *self.endpoint.lock().await = Some(endpoint.clone());
        *self.channel.lock().await = None;
        self.set_token(Some(session.tokens.access_token.clone()));
        {
            let mut s = self.state.lock().await;
            s.connection.endpoint = Some(endpoint.clone());
        }
        self.set_connection(app, ConnectionStatus::Reconnecting).await;

        let role = match self.probe_plane_role().await {
            Ok(r) => r,
            Err(e) => {
                self.set_token(None);
                self.set_connection(app, ConnectionStatus::Down).await;
                return Err(e);
            }
        };
        {
            let mut s = self.state.lock().await;
            s.role = Some(role.clone());
            s.identity = Some(Identity::from_oidc(&session));
        }
        if remember {
            save_oidc(&endpoint, &session);
            Self::clear_saved_connection();
        }
        *self.oidc.lock().await = Some(session);
        self.start_refresh(app.clone(), gen);
        self.start_session_loops(app.clone(), &role);
        Ok(role)
    }

    async fn probe_plane_role(&self) -> Result<String, String> {
        let mut c = self.client().await?;
        let snap = c.snapshot(Request::new(pb::SnapshotRequest {})).await.map(|_| ());
        let op_read = if snap.is_ok() {
            c.list_scheduled_tasks(Request::new(pb::ListScheduledTasksOpRequest::default()))
                .await
                .map(|_| ())
        } else {
            Ok(())
        };
        plane_role(snap, op_read)
    }

    /// The feed for console roles; the member lane for a member.
    pub(super) fn start_session_loops(&self, app: AppHandle, role: &str) {
        if role == "member" {
            self.start_member(app);
        } else {
            self.start_feed(app);
        }
    }

    // ---- refresh ---------------------------------------------------------------

    fn start_refresh(&self, app: AppHandle, gen: u64) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                let delay = match this.oidc.lock().await.as_ref() {
                    Some(s) => s.tokens.refresh_delay(oidc::now_unix()),
                    None => return,
                };
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    _ = this.stop_notify.notified() => return,
                }
                if this.auth_gen.load(Ordering::SeqCst) != gen || this.stop_requested() {
                    return;
                }
                if !this.refresh_oidc(&app, gen).await {
                    return;
                }
            }
        });
    }

    /// Refresh now. True when a fresh access token is installed.
    pub(super) async fn refresh_oidc(&self, app: &AppHandle, gen: u64) -> bool {
        let Some(cur) = self.oidc.lock().await.clone() else {
            return false;
        };
        match cur.refresh().await {
            Ok(next) => {
                // A sign-out or a new sign-in raced us: drop the result.
                if self.auth_gen.load(Ordering::SeqCst) != gen {
                    return false;
                }
                self.set_token(Some(next.tokens.access_token.clone()));
                // Refresh tokens rotate: a remembered sign-in must keep the NEW one,
                // or the next launch replays a token the IdP has already retired.
                if let Some((endpoint, ..)) = saved_oidc() {
                    save_oidc(&endpoint, &next);
                }
                {
                    let mut s = self.state.lock().await;
                    if let Some(id) = s.identity.as_mut() {
                        let fresh = Identity::from_oidc(&next);
                        id.expires_at_unix_ms = fresh.expires_at_unix_ms;
                        id.display_name = fresh.display_name;
                        id.email = fresh.email;
                    }
                }
                *self.oidc.lock().await = Some(next);
                self.emit_state(app).await;
                true
            }
            Err(e) => {
                tracing::warn!("oidc refresh failed: {e}");
                if self.auth_gen.load(Ordering::SeqCst) != gen {
                    return false;
                }
                self.set_fault(app, format!("your sign-in has ended ({e}) -- sign in again")).await;
                self.set_connection(app, ConnectionStatus::Down).await;
                false
            }
        }
    }

    /// RFC 7009 revocation + RP-initiated logout in the system browser.
    pub(super) async fn end_idp_session(&self, app: &AppHandle, s: &OidcSession) -> String {
        let revoked = s.revoke_refresh_token().await;
        let mut notes = Vec::new();
        if !revoked {
            notes.push(
                "the identity provider has no revocation endpoint (or refused the call); \
                 its refresh token lapses on its own schedule"
                    .to_string(),
            );
        }
        match s.end_session_url() {
            Some(url) => {
                use tauri_plugin_opener::OpenerExt;
                if let Err(e) = app.opener().open_url(url, None::<&str>) {
                    notes.push(format!("could not open the identity provider's sign-out page: {e}"));
                }
            }
            None => notes.push(
                "the identity provider offers no sign-out page, so your session THERE stays open; \
                 the next sign-in may not ask for a password"
                    .into(),
            ),
        }
        notes.join("; ")
    }

    // ---- the member lane ---------------------------------------------------------

    fn start_member(&self, app: AppHandle) {
        {
            let mut running = self.member_running.lock().unwrap();
            if *running {
                return;
            }
            *running = true;
        }
        let this = self.clone();
        tokio::spawn(async move {
            this.run_member(app).await;
            *this.member_running.lock().unwrap() = false;
        });
    }

    /// The member surfaces this kernel serves, learned by calling them — the
    /// handshake is closed to members. Err carries the code of a failure that
    /// says nothing about any surface (an expired token, an unreachable kernel).
    async fn member_capabilities(&self) -> Result<Vec<String>, (tonic::Code, String)> {
        let mut c = self.client().await.map_err(|e| (tonic::Code::Unavailable, e))?;
        let mut caps = Vec::new();
        let classify = |r: Result<(), Status>, cap: &str, caps: &mut Vec<String>| -> Result<(), (tonic::Code, String)> {
            match r {
                Ok(()) => {
                    caps.push(cap.to_string());
                    Ok(())
                }
                Err(s) if matches!(s.code(), tonic::Code::Unauthenticated | tonic::Code::Unavailable) => {
                    Err((s.code(), s.message().to_string()))
                }
                Err(_) => Ok(()), // Unimplemented / PermissionDenied: not this kernel's
            }
        };
        let conv = c
            .list_conversations(Request::new(pb::ListConversationsOpRequest { limit: 1, on_behalf_of: String::new() }))
            .await
            .map(|_| ());
        classify(conv, "chat", &mut caps)?;
        let appr = c
            .list_approvals(Request::new(pb::ListApprovalsOpRequest::default()))
            .await
            .map(|_| ());
        classify(appr, "addressed-approvals", &mut caps)?;
        if self.list_my_accounts().await.is_ok() {
            caps.push("accounts".into());
        }
        // Every kernel that has DescribeAuth (stage 1) is past contract 0099.
        caps.push("logout".into());
        Ok(caps)
    }

    async fn run_member(&self, app: AppHandle) {
        let mut attempt: u32 = 0;
        let mut waited = Duration::ZERO;
        loop {
            if self.stop_requested() {
                return;
            }
            self.set_connection(&app, ConnectionStatus::Reconnecting).await;
            match self.member_capabilities().await {
                Ok(caps) => {
                    let mut s = self.state.lock().await;
                    s.capabilities = caps;
                }
                Err((code, e)) => {
                    if code == tonic::Code::Unauthenticated && self.reauthenticate(&app).await {
                        continue;
                    }
                    self.set_fault(&app, e).await;
                    if self.backoff(&app, &mut attempt, &mut waited).await {
                        return;
                    }
                    continue;
                }
            }
            attempt = 0;
            waited = Duration::ZERO;
            self.set_connection(&app, ConnectionStatus::Live).await;

            let mut client = match self.client().await {
                Ok(c) => c,
                Err(e) => {
                    self.set_fault(&app, e).await;
                    if self.backoff(&app, &mut attempt, &mut waited).await {
                        return;
                    }
                    continue;
                }
            };
            match client
                .watch_my_approvals(Request::new(pb::WatchMyApprovalsOpRequest { audit: false }))
                .await
            {
                Ok(stream) => {
                    let mut stream = stream.into_inner();
                    loop {
                        let next = tokio::select! {
                            m = stream.message() => m,
                            _ = self.stop_notify.notified() => return,
                        };
                        match next {
                            Ok(Some(a)) => {
                                {
                                    let mut s = self.state.lock().await;
                                    crate::state::merge_approval(&mut s, &a);
                                }
                                self.emit_state(&app).await;
                            }
                            Ok(None) => break,
                            Err(e) => {
                                tracing::warn!("member approval stream: {}", e.message());
                                break;
                            }
                        }
                    }
                }
                Err(e) if e.code() == tonic::Code::Unauthenticated => {
                    if !self.reauthenticate(&app).await {
                        return;
                    }
                    continue;
                }
                Err(_) => {
                    // No approvals stream on this kernel: stay live (chat works)
                    // and re-check the member surfaces now and then.
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(60)) => {}
                        _ = self.stop_notify.notified() => return,
                    }
                    continue;
                }
            }
            if self.stop_requested() {
                return;
            }
            *self.channel.lock().await = None;
            if self.backoff(&app, &mut attempt, &mut waited).await {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describe_auth_maps_methods_and_an_older_kernel_to_password() {
        let both = auth_methods(Ok(pb::DescribeAuthResponse {
            password_login: true,
            oidc_issuer: "https://idp/realms/x".into(),
            oidc_client_id: "console".into(),
        }))
        .unwrap();
        assert!(both.password_login && both.describe_supported);
        assert_eq!(both.oidc_client_id, "console");

        let older = auth_methods(Err(Status::unimplemented("no"))).unwrap();
        assert_eq!(older, AuthMethods { password_login: true, describe_supported: false, ..Default::default() });

        assert!(auth_methods(Err(Status::unavailable("down"))).is_err());
    }

    #[test]
    fn the_plane_role_probe() {
        let ok = || Ok(());
        let denied = || Err(Status::permission_denied("no"));
        assert_eq!(plane_role(ok(), ok()).unwrap(), "operator");
        assert_eq!(plane_role(ok(), denied()).unwrap(), "viewer");
        assert_eq!(plane_role(ok(), Err(Status::unimplemented("old"))).unwrap(), "operator");
        assert_eq!(plane_role(denied(), ok()).unwrap(), "member");
        let e = plane_role(Err(Status::unauthenticated("bad aud")), ok()).unwrap_err();
        assert!(e.contains("Audience"), "{e}");
        assert!(plane_role(Err(Status::internal("x")), ok()).is_err());
    }
}
