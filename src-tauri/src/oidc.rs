//! OIDC sign-in for the operator console: authorization code + PKCE in the
//! SYSTEM browser (ADR-0142 D1; RFC 6749, RFC 7636, RFC 8252, OIDC Core 1.0 §3.1).
//!
//! The kernel never issues tokens to people. Its unauthenticated `DescribeAuth`
//! names ONE issuer and client id; the console runs the flow against that
//! issuer and presents the resulting ACCESS token as its operator bearer, which
//! the kernel's OIDC verifier checks (signature, iss, aud = client id, exp).
//!
//! ## Redirect: loopback, not a custom scheme (RFC 8252 §7.3 over §7.1)
//!
//! Decision (logged on T-20261106-console-has-no-oidc-authorization-code-pkce):
//! the redirect URI is `http://127.0.0.1:<ephemeral>/callback`.
//! - It needs no OS registration. A private-use scheme needs an installer-time
//!   registration on Windows, macOS and Linux, and ANY app can register the same
//!   scheme and receive the code (RFC 8252 §8.10) — PKCE limits the damage, the
//!   loopback socket avoids it.
//! - Every IdP we target accepts it: Keycloak, Entra ID and Okta allow a
//!   loopback redirect with a variable port (RFC 8252 §7.3).
//! - We bind the IP LITERAL `127.0.0.1`, not `localhost` (RFC 8252 §8.3), so a
//!   hosts-file or IPv6 resolution difference cannot send the code elsewhere.
//!
//! ## What is verified here, and what is not
//!
//! - `state` (CSRF) is compared in constant time; a callback with the wrong state
//!   is answered and IGNORED, so a stray local request cannot abort the flow.
//! - PKCE S256 binds the code to this process (an intercepted code is useless).
//! - The ID token's `iss`, `aud` (and `azp`), `exp` and `nonce` are checked. Its
//!   SIGNATURE is not: the token came straight from the token endpoint over TLS,
//!   which OIDC Core 3.1.3.7 (6) allows in place of signature validation, and the
//!   ID token is used only to DISPLAY who signed in. Authority is the kernel's:
//!   it verifies the access token's signature against the issuer's JWKS.
//! - The issuer in discovery must equal the configured one (mix-up defence), and
//!   every endpoint must be https — plain http only on a loopback host (tests,
//!   a developer's local Keycloak).
//!
//! ## Where tokens live
//!
//! Only here, in the Rust core. The webview gets the person's display name,
//! email, issuer and expiry — never a token, a code, a verifier, state or nonce.
//! Nothing in this module logs a URL that carries a code or a token.

use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::Bytes;
use hyper_util::rt::TokioIo;
use rand::RngCore;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// Scopes requested. No `offline_access`: Keycloak turns it into an offline
/// token that outlives the SSO session, which is not what a console sign-in is.
pub const SCOPE: &str = "openid profile email";
pub const CALLBACK_PATH: &str = "/callback";
/// How long the person has to finish signing in at the IdP.
pub const FLOW_TIMEOUT: Duration = Duration::from_secs(300);
/// Refresh this long before the access token expires.
pub const REFRESH_SKEW_SECS: i64 = 60;
/// Clock skew tolerated on the ID token's `exp`.
const EXP_LEEWAY_SECS: i64 = 60;
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BODY: usize = 1 << 20;
const MAX_CALLBACK_HEAD: usize = 8 * 1024;

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---- PKCE, state, nonce ----------------------------------------------------

/// `bytes` of OS randomness, base64url without padding.
pub fn random_b64(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}

/// A PKCE pair (RFC 7636 §4.1-4.2). The verifier is 32 random bytes encoded to
/// 43 unreserved characters — the minimum length, maximum entropy per char.
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

impl Pkce {
    pub fn new() -> Self {
        let verifier = random_b64(32);
        let challenge = s256(&verifier);
        Self { verifier, challenge }
    }
}

/// `BASE64URL(SHA256(ascii(verifier)))` — the S256 transform.
pub fn s256(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Constant-time equality, so a state comparison leaks no prefix length.
pub fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// ---- Discovery ---------------------------------------------------------------

#[derive(serde::Deserialize, Clone, Debug)]
pub struct Discovery {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default)]
    pub end_session_endpoint: Option<String>,
    #[serde(default)]
    pub revocation_endpoint: Option<String>,
    #[serde(default)]
    pub code_challenge_methods_supported: Vec<String>,
}

fn norm_issuer(s: &str) -> &str {
    s.trim().trim_end_matches('/')
}

pub fn discovery_url(issuer: &str) -> String {
    format!("{}/.well-known/openid-configuration", norm_issuer(issuer))
}

fn is_loopback_host(u: &url::Url) -> bool {
    match u.host() {
        Some(url::Host::Domain(d)) => d.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

/// An IdP endpoint must be https; plain http is allowed only on a loopback host.
pub fn check_endpoint_url(raw: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(raw).map_err(|e| format!("bad identity-provider URL: {e}"))?;
    match u.scheme() {
        "https" => Ok(u),
        "http" if is_loopback_host(&u) => Ok(u),
        "http" => Err(format!(
            "the identity provider at {} is not https; refusing to send credentials over plain http",
            u.host_str().unwrap_or("?")
        )),
        s => Err(format!("unsupported identity-provider URL scheme {s:?}")),
    }
}

/// Validate a discovery document against the issuer the KERNEL named.
pub fn check_discovery(expected_issuer: &str, d: &Discovery) -> Result<(), String> {
    // OIDC Discovery §4.3: the issuer MUST match, or a mix-up attack can point
    // the console at another provider's endpoints.
    if norm_issuer(&d.issuer) != norm_issuer(expected_issuer) {
        return Err(format!(
            "issuer mismatch: the kernel names {expected_issuer:?}, its discovery document says {:?}",
            d.issuer
        ));
    }
    check_endpoint_url(&d.authorization_endpoint)?;
    check_endpoint_url(&d.token_endpoint)?;
    if let Some(e) = &d.end_session_endpoint {
        check_endpoint_url(e)?;
    }
    if let Some(e) = &d.revocation_endpoint {
        check_endpoint_url(e)?;
    }
    // An issuer that lists methods without S256 cannot do PKCE the safe way;
    // `plain` would put the verifier in the browser URL.
    if !d.code_challenge_methods_supported.is_empty()
        && !d.code_challenge_methods_supported.iter().any(|m| m == "S256")
    {
        return Err("the identity provider does not support PKCE S256".into());
    }
    Ok(())
}

pub async fn fetch_discovery(issuer: &str) -> Result<Discovery, String> {
    let (status, body, _) = http_request("GET", &discovery_url(issuer), None).await?;
    if status != 200 {
        return Err(format!("identity-provider discovery answered HTTP {status}"));
    }
    let d: Discovery = serde_json::from_slice(&body)
        .map_err(|e| format!("identity-provider discovery is not valid JSON: {e}"))?;
    check_discovery(issuer, &d)?;
    Ok(d)
}

// ---- Authorization request + callback ---------------------------------------

pub struct AuthRequest<'a> {
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub state: &'a str,
    pub nonce: &'a str,
    pub challenge: &'a str,
}

pub fn authorization_url(d: &Discovery, r: &AuthRequest<'_>) -> Result<String, String> {
    let mut u = check_endpoint_url(&d.authorization_endpoint)?;
    u.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", r.client_id)
        .append_pair("redirect_uri", r.redirect_uri)
        .append_pair("scope", SCOPE)
        .append_pair("state", r.state)
        .append_pair("nonce", r.nonce)
        .append_pair("code_challenge", r.challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(u.to_string())
}

#[derive(Debug, PartialEq)]
pub enum CallbackOutcome {
    /// Not the callback path (a favicon request, a probe): keep waiting.
    NotOurs,
    /// The callback path with a state we did not issue: answer and keep waiting,
    /// so a stray or hostile local request cannot abort the real flow.
    StateMismatch,
    /// The IdP returned an error (RFC 6749 §4.1.2.1) for OUR state.
    Error(String),
    Code(String),
}

/// Parse a loopback request target (`/callback?code=…&state=…`).
pub fn parse_callback(target: &str, expected_state: &str) -> CallbackOutcome {
    let Ok(u) = url::Url::parse(&format!("http://127.0.0.1{target}")) else {
        return CallbackOutcome::NotOurs;
    };
    if u.path() != CALLBACK_PATH {
        return CallbackOutcome::NotOurs;
    }
    let (mut code, mut state, mut error, mut desc) = (None, None, None, None);
    for (k, v) in u.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => error = Some(v.into_owned()),
            "error_description" => desc = Some(v.into_owned()),
            _ => {}
        }
    }
    match state {
        Some(s) if ct_eq(&s, expected_state) => {}
        _ => return CallbackOutcome::StateMismatch,
    }
    if let Some(e) = error {
        return CallbackOutcome::Error(match desc {
            Some(d) => format!("the identity provider refused the sign-in: {e} ({d})"),
            None => format!("the identity provider refused the sign-in: {e}"),
        });
    }
    match code {
        Some(c) if !c.is_empty() => CallbackOutcome::Code(c),
        _ => CallbackOutcome::Error("the identity provider returned no authorization code".into()),
    }
}

/// The loopback redirect listener (RFC 8252 §7.3).
pub struct Loopback {
    listener: TcpListener,
    pub port: u16,
}

impl Loopback {
    pub async fn bind() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| format!("could not open the sign-in callback port: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        Ok(Self { listener, port })
    }

    pub fn redirect_uri(&self) -> String {
        format!("http://127.0.0.1:{}{CALLBACK_PATH}", self.port)
    }

    /// Wait for the browser to deliver the code for `expected_state`.
    pub async fn wait_for_code(&self, expected_state: &str, timeout: Duration) -> Result<String, String> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let accepted = tokio::time::timeout_at(deadline, self.listener.accept())
                .await
                .map_err(|_| "sign-in timed out: the browser never returned to the console".to_string())?;
            let Ok((mut sock, peer)) = accepted else { continue };
            if !peer.ip().is_loopback() {
                continue;
            }
            let Some(target) = read_request_target(&mut sock).await else {
                continue;
            };
            let outcome = parse_callback(&target, expected_state);
            let (status, msg) = match &outcome {
                CallbackOutcome::NotOurs => ("404 Not Found", "Not found."),
                CallbackOutcome::StateMismatch => (
                    "400 Bad Request",
                    "This sign-in response does not belong to the console's current sign-in. Start again from the console.",
                ),
                CallbackOutcome::Error(_) => (
                    "200 OK",
                    "Sign-in was not completed. Return to the Cambrian console for details.",
                ),
                CallbackOutcome::Code(_) => (
                    "200 OK",
                    "Signed in. You can close this tab and return to the Cambrian console.",
                ),
            };
            // A fixed page: nothing from the request is reflected into it.
            let body = format!(
                "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Cambrian console</title><body style=\"font-family:system-ui;padding:2rem\"><p>{msg}</p></body></html>"
            );
            let resp = format!(
                "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = sock.write_all(resp.as_bytes()).await;
            let _ = sock.shutdown().await;
            match outcome {
                CallbackOutcome::NotOurs => {}
                CallbackOutcome::StateMismatch => {
                    tracing::warn!("oidc: ignored a loopback callback with an unknown state");
                }
                CallbackOutcome::Error(e) => return Err(e),
                CallbackOutcome::Code(c) => return Ok(c),
            }
        }
    }
}

/// Read one request head and return its target. Bounded in size and time.
async fn read_request_target(sock: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    let read = async {
        loop {
            let n = sock.read(&mut chunk).await.ok()?;
            if n == 0 {
                return None;
            }
            buf.extend_from_slice(&chunk[..n]);
            if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() >= MAX_CALLBACK_HEAD {
                return Some(());
            }
        }
    };
    tokio::time::timeout(Duration::from_secs(5), read).await.ok()??;
    let head = String::from_utf8_lossy(&buf);
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    (method == "GET" && target.starts_with('/')).then(|| target.to_string())
}

// ---- Tokens ------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    token_type: String,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
}

#[derive(serde::Deserialize)]
struct TokenError {
    error: String,
    #[serde(default)]
    error_description: Option<String>,
}

/// The tokens of one session. Never serialized, never sent to the webview.
#[derive(Clone)]
pub struct TokenSet {
    pub access_token: String,
    pub id_token: Option<String>,
    pub refresh_token: Option<String>,
    /// Unix seconds when the access token expires.
    pub expires_at: i64,
}

impl std::fmt::Debug for TokenSet {
    // Redacted: a Debug print of a session must never be a credential leak.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TokenSet")
            .field("access_token", &"<redacted>")
            .field("id_token", &self.id_token.as_ref().map(|_| "<redacted>"))
            .field("refresh_token", &self.refresh_token.as_ref().map(|_| "<redacted>"))
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

impl TokenSet {
    /// Build from a token response. On a refresh (`prev`), a missing refresh or
    /// ID token keeps the previous one (RFC 6749 §6: rotation is optional).
    fn from_response(r: TokenResponse, now: i64, prev: Option<&TokenSet>) -> Result<Self, String> {
        if !r.token_type.eq_ignore_ascii_case("bearer") {
            return Err(format!("unsupported token type {:?} (expected Bearer)", r.token_type));
        }
        if r.access_token.is_empty() {
            return Err("the identity provider returned an empty access token".into());
        }
        let lifetime = r
            .expires_in
            .filter(|s| *s > 0)
            .or_else(|| jwt_exp(&r.access_token).map(|exp| exp - now))
            .unwrap_or(300);
        Ok(Self {
            access_token: r.access_token,
            id_token: r.id_token.or_else(|| prev.and_then(|p| p.id_token.clone())),
            refresh_token: r.refresh_token.or_else(|| prev.and_then(|p| p.refresh_token.clone())),
            expires_at: now + lifetime,
        })
    }

    /// True when the access token is within the refresh skew of expiring.
    pub fn needs_refresh(&self, now: i64) -> bool {
        now >= self.expires_at - REFRESH_SKEW_SECS
    }

    /// How long to wait before refreshing (never less than 5 s, so a token with
    /// a tiny lifetime cannot spin the refresh loop).
    pub fn refresh_delay(&self, now: i64) -> Duration {
        Duration::from_secs((self.expires_at - REFRESH_SKEW_SECS - now).max(5) as u64)
    }
}

fn b64_json(segment: &str) -> Option<serde_json::Value> {
    let bytes = URL_SAFE_NO_PAD.decode(segment.trim_end_matches('=')).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// The (unverified) claims of a compact JWS. Display and sanity checks only.
pub fn jwt_claims(jwt: &str) -> Option<serde_json::Value> {
    let mut parts = jwt.split('.');
    let (_h, p, _s) = (parts.next()?, parts.next()?, parts.next()?);
    b64_json(p)
}

fn jwt_exp(jwt: &str) -> Option<i64> {
    jwt_claims(jwt)?.get("exp")?.as_i64()
}

/// Who signed in, from the ID token. For DISPLAY: authority is the kernel's.
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct IdClaims {
    pub sub: String,
    pub name: String,
    pub email: String,
    pub preferred_username: String,
    pub exp: i64,
    /// The nonce the token carried (never sent to the webview).
    #[serde(skip)]
    pub nonce: String,
}

pub enum NonceCheck<'a> {
    /// The initial sign-in: the nonce MUST be present and equal.
    Required(&'a str),
    /// A refreshed ID token: if a nonce is present it MUST equal the original
    /// one (OIDC Core §12.2).
    IfPresent(&'a str),
    /// A session resumed from a stored refresh token: the original nonce was
    /// not kept, so the first refreshed ID token's nonce becomes the reference.
    Unknown,
}

pub fn check_id_token(
    jwt: &str,
    issuer: &str,
    client_id: &str,
    nonce: NonceCheck<'_>,
    now: i64,
) -> Result<IdClaims, String> {
    let c = jwt_claims(jwt).ok_or("the ID token is not a JWT")?;
    let s = |k: &str| c.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    if norm_issuer(&s("iss")) != norm_issuer(issuer) {
        return Err("ID token issuer does not match".into());
    }
    let auds: Vec<String> = match c.get("aud") {
        Some(serde_json::Value::String(a)) => vec![a.clone()],
        Some(serde_json::Value::Array(a)) => a.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => vec![],
    };
    if !auds.iter().any(|a| a == client_id) {
        return Err("ID token audience does not include the console's client id".into());
    }
    // OIDC Core 3.1.3.7 (4)-(5): with several audiences, azp must name us.
    let azp = s("azp");
    if auds.len() > 1 && !azp.is_empty() && azp != client_id {
        return Err("ID token azp names another client".into());
    }
    let exp = c.get("exp").and_then(|v| v.as_i64()).ok_or("ID token has no exp")?;
    if exp + EXP_LEEWAY_SECS < now {
        return Err("ID token has expired".into());
    }
    let got = c.get("nonce").and_then(|v| v.as_str());
    match nonce {
        NonceCheck::Required(want) => match got {
            Some(g) if ct_eq(g, want) => {}
            _ => return Err("ID token nonce does not match this sign-in (possible replay)".into()),
        },
        NonceCheck::IfPresent(want) => {
            if let Some(g) = got {
                if !ct_eq(g, want) {
                    return Err("refreshed ID token carries a different nonce".into());
                }
            }
        }
        NonceCheck::Unknown => {}
    }
    let sub = s("sub");
    if sub.is_empty() {
        return Err("ID token has no subject".into());
    }
    Ok(IdClaims {
        sub,
        name: s("name"),
        email: s("email"),
        preferred_username: s("preferred_username"),
        exp,
        nonce: got.unwrap_or("").to_string(),
    })
}

async fn token_request(d: &Discovery, form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let (status, body, _) = http_request("POST", &d.token_endpoint, Some(form)).await?;
    if status != 200 {
        // RFC 6749 §5.2. The error code is safe to show; the body is not logged.
        return Err(match serde_json::from_slice::<TokenError>(&body) {
            Ok(e) => match e.error_description {
                Some(d) => format!("the identity provider refused the token request: {} ({d})", e.error),
                None => format!("the identity provider refused the token request: {}", e.error),
            },
            Err(_) => format!("the token endpoint answered HTTP {status}"),
        });
    }
    serde_json::from_slice(&body).map_err(|e| format!("token response is not valid JSON: {e}"))
}

// ---- The session -------------------------------------------------------------

/// One signed-in OIDC session. Held by the Rust core only.
#[derive(Clone, Debug)]
pub struct OidcSession {
    pub issuer: String,
    pub client_id: String,
    pub discovery: Discovery,
    pub tokens: TokenSet,
    pub claims: IdClaims,
    /// The nonce of the original authentication (OIDC Core §12.2).
    nonce: String,
}

/// Run the whole interactive flow. `open` shows the authorization URL to the
/// person — the system browser in production, a simulated browser in tests.
pub async fn sign_in<F>(issuer: &str, client_id: &str, open: F, timeout: Duration) -> Result<OidcSession, String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    if client_id.is_empty() {
        return Err("the kernel names an issuer but no client id".into());
    }
    let discovery = fetch_discovery(issuer).await?;
    let pkce = Pkce::new();
    let state = random_b64(32);
    let nonce = random_b64(32);
    let lb = Loopback::bind().await?;
    let redirect_uri = lb.redirect_uri();
    let url = authorization_url(
        &discovery,
        &AuthRequest {
            client_id,
            redirect_uri: &redirect_uri,
            state: &state,
            nonce: &nonce,
            challenge: &pkce.challenge,
        },
    )?;
    open(&url)?;
    let code = lb.wait_for_code(&state, timeout).await?;
    drop(lb); // the port closes as soon as the code is in hand
    let resp = token_request(
        &discovery,
        &[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &redirect_uri),
            ("client_id", client_id),
            ("code_verifier", &pkce.verifier),
        ],
    )
    .await?;
    let now = now_unix();
    let tokens = TokenSet::from_response(resp, now, None)?;
    let id_token = tokens
        .id_token
        .as_deref()
        .ok_or("the identity provider returned no ID token (is the client an OpenID Connect client?)")?;
    let claims = check_id_token(id_token, issuer, client_id, NonceCheck::Required(&nonce), now)?;
    Ok(OidcSession {
        issuer: issuer.to_string(),
        client_id: client_id.to_string(),
        discovery,
        tokens,
        claims,
        nonce,
    })
}

impl OidcSession {
    /// Rebuild a session from a refresh token kept in the OS keychain
    /// ("remember this instance"), by refreshing it.
    pub async fn resume(issuer: &str, client_id: &str, refresh_token: String) -> Result<Self, String> {
        let discovery = fetch_discovery(issuer).await?;
        let seed = OidcSession {
            issuer: issuer.to_string(),
            client_id: client_id.to_string(),
            discovery,
            tokens: TokenSet {
                access_token: String::new(),
                id_token: None,
                refresh_token: Some(refresh_token),
                expires_at: 0,
            },
            claims: IdClaims::default(),
            nonce: String::new(),
        };
        seed.refresh().await
    }

    /// Exchange the refresh token for new tokens (RFC 6749 §6). A public client:
    /// no secret, the client id identifies it.
    pub async fn refresh(&self) -> Result<Self, String> {
        let rt = self
            .tokens
            .refresh_token
            .as_deref()
            .ok_or("the identity provider issued no refresh token; sign in again")?;
        let resp = token_request(
            &self.discovery,
            &[("grant_type", "refresh_token"), ("refresh_token", rt), ("client_id", &self.client_id)],
        )
        .await?;
        let now = now_unix();
        let tokens = TokenSet::from_response(resp, now, Some(&self.tokens))?;
        let mut claims = self.claims.clone();
        let mut nonce = self.nonce.clone();
        if let Some(id) = tokens.id_token.as_deref() {
            if self.tokens.id_token.as_deref() != Some(id) {
                let check = if self.nonce.is_empty() { NonceCheck::Unknown } else { NonceCheck::IfPresent(&self.nonce) };
                let fresh = check_id_token(id, &self.issuer, &self.client_id, check, now)?;
                if nonce.is_empty() {
                    nonce = fresh.nonce.clone();
                }
                // OIDC Core §12.2: the subject must not change across a refresh.
                if !claims.sub.is_empty() && fresh.sub != claims.sub {
                    return Err("the refreshed ID token names a different person".into());
                }
                claims = fresh;
            }
        }
        if claims.sub.is_empty() {
            return Err("the identity provider returned no ID token on refresh; sign in again".into());
        }
        Ok(Self { tokens, claims, nonce, ..self.clone() })
    }

    /// Best-effort refresh-token revocation at the IdP (RFC 7009). Returns
    /// whether the IdP has a revocation endpoint and accepted the call.
    pub async fn revoke_refresh_token(&self) -> bool {
        let (Some(ep), Some(rt)) = (&self.discovery.revocation_endpoint, &self.tokens.refresh_token) else {
            return false;
        };
        matches!(
            http_request(
                "POST",
                ep,
                Some(&[("token", rt), ("token_type_hint", "refresh_token"), ("client_id", &self.client_id)]),
            )
            .await,
            Ok((200, _, _))
        )
    }

    /// The RP-initiated logout URL (OIDC RP-Initiated Logout 1.0), when the
    /// issuer advertises an end-session endpoint.
    ///
    /// Decision: `client_id`, NOT `id_token_hint`. The URL is opened in the
    /// system browser and lands in its history; the kernel's verifier does not
    /// distinguish an ID token from an access token (both carry aud = client
    /// id), so an ID token in browser history would be a usable bearer until it
    /// expires. The cost is that some IdPs ask "log out?" once more.
    pub fn end_session_url(&self) -> Option<String> {
        let ep = self.discovery.end_session_endpoint.as_deref()?;
        let mut u = check_endpoint_url(ep).ok()?;
        u.query_pairs_mut().append_pair("client_id", &self.client_id);
        Some(u.to_string())
    }
}

// ---- A minimal HTTP/1.1 client -------------------------------------------------
//
// hyper's connection API over a TCP or rustls stream: GET discovery, POST the
// token and revocation forms. No redirects are followed (an IdP endpoint that
// redirects is misconfigured, and following one could leak a form body).

fn tls_config() -> Arc<tokio_rustls::rustls::ClientConfig> {
    static CONFIG: OnceLock<Arc<tokio_rustls::rustls::ClientConfig>> = OnceLock::new();
    CONFIG
        .get_or_init(|| {
            use tokio_rustls::rustls;
            let mut roots = rustls::RootCertStore::empty();
            for cert in rustls_native_certs::load_native_certs().certs {
                let _ = roots.add(cert);
            }
            let provider = Arc::new(rustls::crypto::ring::default_provider());
            let cfg = rustls::ClientConfig::builder_with_provider(provider)
                .with_safe_default_protocol_versions()
                .expect("ring supports the default protocol versions")
                .with_root_certificates(roots)
                .with_no_client_auth();
            Arc::new(cfg)
        })
        .clone()
}

async fn send<S>(io: S, req: hyper::Request<Full<Bytes>>) -> Result<(u16, Vec<u8>, Option<String>), String>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (mut sender, conn) = hyper::client::conn::http1::handshake(TokioIo::new(io))
        .await
        .map_err(|e| format!("http: {e}"))?;
    tokio::spawn(async move {
        let _ = conn.await;
    });
    let resp = sender.send_request(req).await.map_err(|e| format!("http: {e}"))?;
    let status = resp.status().as_u16();
    let location = resp
        .headers()
        .get(hyper::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let body = Limited::new(resp.into_body(), MAX_BODY)
        .collect()
        .await
        .map_err(|e| format!("http body: {e}"))?
        .to_bytes()
        .to_vec();
    Ok((status, body, location))
}

/// One request. Returns (status, body, Location header).
pub(crate) async fn http_request(
    method: &str,
    url: &str,
    form: Option<&[(&str, &str)]>,
) -> Result<(u16, Vec<u8>, Option<String>), String> {
    let u = check_endpoint_url(url)?;
    let host = u.host_str().ok_or("URL has no host")?.to_string();
    let port = u.port_or_known_default().ok_or("URL has no port")?;
    let host_header = match u.port() {
        Some(p) => format!("{host}:{p}"),
        None => host.clone(),
    };
    let target = &u[url::Position::BeforePath..];
    let mut b = hyper::Request::builder()
        .method(method)
        .uri(target)
        .header(hyper::header::HOST, host_header)
        .header(hyper::header::ACCEPT, "application/json")
        .header(hyper::header::USER_AGENT, "cambrian-console");
    let body = match form {
        Some(pairs) => {
            b = b.header(hyper::header::CONTENT_TYPE, "application/x-www-form-urlencoded");
            url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(pairs.iter())
                .finish()
        }
        None => String::new(),
    };
    let req = b.body(Full::new(Bytes::from(body))).map_err(|e| format!("http: {e}"))?;
    let https = u.scheme() == "https";
    let fut = async move {
        let connect_host = host.trim_start_matches('[').trim_end_matches(']').to_string();
        let tcp = TcpStream::connect((connect_host.as_str(), port))
            .await
            .map_err(|e| format!("could not reach the identity provider: {e}"))?;
        if https {
            let name = tokio_rustls::rustls::pki_types::ServerName::try_from(connect_host)
                .map_err(|e| format!("tls name: {e}"))?;
            let tls = tokio_rustls::TlsConnector::from(tls_config())
                .connect(name, tcp)
                .await
                .map_err(|e| format!("tls: {e}"))?;
            send(tls, req).await
        } else {
            send(tcp, req).await
        }
    };
    tokio::time::timeout(HTTP_TIMEOUT, fut)
        .await
        .map_err(|_| "the identity provider did not answer within 15s".to_string())?
}

// ---- Tests: PKCE / state / nonce, refresh and expiry, against a mock issuer ----

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    // ---- pure pieces ----

    #[test]
    fn s256_matches_the_rfc7636_appendix_b_vector() {
        assert_eq!(
            s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn pkce_verifier_is_43_unreserved_chars_and_unique() {
        let a = Pkce::new();
        let b = Pkce::new();
        assert_eq!(a.verifier.len(), 43);
        assert!(a.verifier.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(a.verifier, b.verifier);
        assert_eq!(a.challenge, s256(&a.verifier));
        assert_ne!(random_b64(32), random_b64(32));
    }

    #[test]
    fn callback_requires_our_state() {
        assert_eq!(parse_callback("/callback?code=abc&state=S1", "S1"), CallbackOutcome::Code("abc".into()));
        assert_eq!(parse_callback("/callback?code=abc&state=S2", "S1"), CallbackOutcome::StateMismatch);
        assert_eq!(parse_callback("/callback?code=abc", "S1"), CallbackOutcome::StateMismatch);
        assert_eq!(parse_callback("/favicon.ico", "S1"), CallbackOutcome::NotOurs);
        assert!(matches!(
            parse_callback("/callback?error=access_denied&state=S1", "S1"),
            CallbackOutcome::Error(e) if e.contains("access_denied")
        ));
        // An error for SOMEONE ELSE's state must not abort our flow.
        assert_eq!(parse_callback("/callback?error=access_denied&state=X", "S1"), CallbackOutcome::StateMismatch);
        assert!(matches!(parse_callback("/callback?state=S1", "S1"), CallbackOutcome::Error(_)));
    }

    #[test]
    fn ct_eq_is_equality() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "abd"));
        assert!(!ct_eq("abc", "abcd"));
    }

    fn jwt(claims: serde_json::Value) -> String {
        format!(
            "{}.{}.sig",
            URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","typ":"JWT"}"#),
            URL_SAFE_NO_PAD.encode(claims.to_string())
        )
    }

    #[test]
    fn id_token_checks_iss_aud_azp_exp_nonce() {
        let now = 1_000_000;
        let good = serde_json::json!({"iss":"https://idp/realms/x","aud":"console","sub":"u1","exp":now+300,"nonce":"N","name":"Ada"});
        let c = check_id_token(&jwt(good.clone()), "https://idp/realms/x/", "console", NonceCheck::Required("N"), now).unwrap();
        assert_eq!((c.sub.as_str(), c.name.as_str()), ("u1", "Ada"));

        let with = |k: &str, v: serde_json::Value| {
            let mut g = good.clone();
            g[k] = v;
            jwt(g)
        };
        let req = NonceCheck::Required("N");
        assert!(check_id_token(&with("iss", "https://evil".into()), "https://idp/realms/x", "console", req, now).is_err());
        assert!(check_id_token(&with("aud", "other".into()), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err());
        assert!(check_id_token(&with("aud", serde_json::json!(["console", "other"])), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_ok());
        let mut multi = good.clone();
        multi["aud"] = serde_json::json!(["console", "other"]);
        multi["azp"] = "other".into();
        assert!(check_id_token(&jwt(multi), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err());
        assert!(check_id_token(&with("exp", (now - 61).into()), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err());
        assert!(check_id_token(&with("exp", (now - 30).into()), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_ok(), "within leeway");
        assert!(check_id_token(&with("nonce", "M".into()), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err());
        let mut no_nonce = good.clone();
        no_nonce.as_object_mut().unwrap().remove("nonce");
        assert!(check_id_token(&jwt(no_nonce.clone()), "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err(), "initial sign-in requires the nonce");
        assert!(check_id_token(&jwt(no_nonce), "https://idp/realms/x", "console", NonceCheck::IfPresent("N"), now).is_ok(), "a refresh may omit it");
        assert!(check_id_token(&with("nonce", "M".into()), "https://idp/realms/x", "console", NonceCheck::IfPresent("N"), now).is_err());
        assert!(check_id_token("not-a-jwt", "https://idp/realms/x", "console", NonceCheck::Required("N"), now).is_err());
    }

    #[test]
    fn token_set_expiry_and_refresh_timing() {
        let now = 10_000;
        let t = TokenSet::from_response(
            TokenResponse { access_token: "a".into(), token_type: "Bearer".into(), expires_in: Some(300), refresh_token: Some("r".into()), id_token: None },
            now,
            None,
        )
        .unwrap();
        assert_eq!(t.expires_at, now + 300);
        assert!(!t.needs_refresh(now));
        assert!(!t.needs_refresh(now + 239));
        assert!(t.needs_refresh(now + 240), "refresh 60 s before expiry");
        assert_eq!(t.refresh_delay(now), Duration::from_secs(240));
        assert_eq!(t.refresh_delay(now + 1000), Duration::from_secs(5), "never a hot loop");

        // A refresh without rotation keeps the previous refresh token.
        let t2 = TokenSet::from_response(
            TokenResponse { access_token: "b".into(), token_type: "bearer".into(), expires_in: None, refresh_token: None, id_token: None },
            now,
            Some(&t),
        )
        .unwrap();
        assert_eq!(t2.refresh_token.as_deref(), Some("r"));
        assert_eq!(t2.expires_at, now + 300, "default lifetime when neither expires_in nor a JWT exp");
        // expires_in absent: the access token's own exp is used.
        let t3 = TokenSet::from_response(
            TokenResponse { access_token: jwt(serde_json::json!({"exp": now + 120})), token_type: "Bearer".into(), expires_in: None, refresh_token: None, id_token: None },
            now,
            None,
        )
        .unwrap();
        assert_eq!(t3.expires_at, now + 120);
        // Not a bearer token: refused.
        assert!(TokenSet::from_response(
            TokenResponse { access_token: "a".into(), token_type: "DPoP".into(), expires_in: None, refresh_token: None, id_token: None },
            now,
            None
        )
        .is_err());
        // Debug never prints a token.
        assert!(!format!("{t:?}").contains("\"a\"") && format!("{t:?}").contains("redacted"));
    }

    #[test]
    fn endpoints_must_be_https_except_loopback() {
        assert!(check_endpoint_url("https://idp.example/x").is_ok());
        assert!(check_endpoint_url("http://127.0.0.1:8080/x").is_ok());
        assert!(check_endpoint_url("http://localhost:8080/x").is_ok());
        assert!(check_endpoint_url("http://idp.example/x").is_err());
        assert!(check_endpoint_url("ftp://idp.example/x").is_err());
    }

    #[test]
    fn discovery_issuer_and_s256_are_enforced() {
        let d = Discovery {
            issuer: "https://idp/realms/x".into(),
            authorization_endpoint: "https://idp/auth".into(),
            token_endpoint: "https://idp/token".into(),
            end_session_endpoint: None,
            revocation_endpoint: None,
            code_challenge_methods_supported: vec!["plain".into(), "S256".into()],
        };
        assert!(check_discovery("https://idp/realms/x/", &d).is_ok());
        assert!(check_discovery("https://other/realms/x", &d).is_err());
        let plain_only = Discovery { code_challenge_methods_supported: vec!["plain".into()], ..d.clone() };
        assert!(check_discovery("https://idp/realms/x", &plain_only).is_err());
        let http_token = Discovery { token_endpoint: "http://idp/token".into(), ..d };
        assert!(check_discovery("https://idp/realms/x", &http_token).is_err());
    }

    // ---- a mock issuer: a tiny HTTP/1.1 server on 127.0.0.1 ----

    #[derive(Default)]
    struct IssuerState {
        /// code -> (challenge, nonce, redirect_uri, client_id)
        codes: HashMap<String, (String, String, String, String)>,
        refresh_tokens: HashMap<String, String>, // refresh token -> nonce
        token_calls: u32,
        revoked: Vec<String>,
        /// When set, /authorize redirects with this state instead of the real one.
        forge_state_first: bool,
        expires_in: i64,
    }

    struct MockIssuer {
        base: String,
        state: Arc<Mutex<IssuerState>>,
    }

    async fn read_http(sock: &mut TcpStream) -> Option<(String, String, String)> {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        let head_end;
        loop {
            let n = sock.read(&mut chunk).await.ok()?;
            if n == 0 {
                return None;
            }
            buf.extend_from_slice(&chunk[..n]);
            if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                head_end = i + 4;
                break;
            }
        }
        let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
        let len: usize = head
            .lines()
            .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap_or(0)))
            .unwrap_or(0);
        while buf.len() < head_end + len {
            let n = sock.read(&mut chunk).await.ok()?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
        }
        let mut first = head.lines().next()?.split_whitespace();
        let method = first.next()?.to_string();
        let target = first.next()?.to_string();
        Some((method, target, String::from_utf8_lossy(&buf[head_end..]).to_string()))
    }

    fn form(s: &str) -> HashMap<String, String> {
        url::form_urlencoded::parse(s.as_bytes()).into_owned().collect()
    }

    impl MockIssuer {
        async fn start() -> Self {
            let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
            let base = format!("http://127.0.0.1:{}/realms/test", listener.local_addr().unwrap().port());
            let state = Arc::new(Mutex::new(IssuerState { expires_in: 300, ..Default::default() }));
            let (b, st) = (base.clone(), state.clone());
            tokio::spawn(async move {
                loop {
                    let Ok((mut sock, _)) = listener.accept().await else { return };
                    let (b, st) = (b.clone(), st.clone());
                    tokio::spawn(async move {
                        let Some((method, target, body)) = read_http(&mut sock).await else { return };
                        let (status, ctype, extra, out) = Self::route(&b, &st, &method, &target, &body);
                        let resp = format!(
                            "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{out}",
                            out.len()
                        );
                        let _ = sock.write_all(resp.as_bytes()).await;
                        let _ = sock.shutdown().await;
                    });
                }
            });
            Self { base, state }
        }

        fn id_token(base: &str, sub: &str, nonce: Option<&str>) -> String {
            let mut c = serde_json::json!({"iss": base, "aud": "console", "sub": sub, "exp": now_unix() + 300, "name": "Ada Lovelace", "email": "ada@example.org"});
            if let Some(n) = nonce {
                c["nonce"] = n.into();
            }
            jwt(c)
        }

        fn route(base: &str, st: &Mutex<IssuerState>, method: &str, target: &str, body: &str) -> (&'static str, &'static str, String, String) {
            let json = "application/json";
            let path = target.split('?').next().unwrap_or("");
            let prefix = url::Url::parse(base).unwrap().path().to_string();
            let rel = path.strip_prefix(&prefix).unwrap_or(path);
            match (method, rel) {
                ("GET", "/.well-known/openid-configuration") => (
                    "200 OK",
                    json,
                    String::new(),
                    serde_json::json!({
                        "issuer": base,
                        "authorization_endpoint": format!("{base}/authorize"),
                        "token_endpoint": format!("{base}/token"),
                        "end_session_endpoint": format!("{base}/logout"),
                        "revocation_endpoint": format!("{base}/revoke"),
                        "code_challenge_methods_supported": ["S256"],
                    })
                    .to_string(),
                ),
                ("GET", "/authorize") => {
                    let q = form(target.split_once('?').map(|x| x.1).unwrap_or(""));
                    assert_eq!(q.get("code_challenge_method").map(String::as_str), Some("S256"));
                    assert_eq!(q.get("response_type").map(String::as_str), Some("code"));
                    let redirect = q["redirect_uri"].clone();
                    assert!(redirect.starts_with("http://127.0.0.1:") && redirect.ends_with("/callback"));
                    let code = random_b64(16);
                    let mut s = st.lock().unwrap();
                    s.codes.insert(code.clone(), (q["code_challenge"].clone(), q["nonce"].clone(), redirect.clone(), q["client_id"].clone()));
                    let state = if s.forge_state_first { "forged".to_string() } else { q["state"].clone() };
                    let mut loc = url::Url::parse(&redirect).unwrap();
                    loc.query_pairs_mut().append_pair("code", &code).append_pair("state", &state);
                    // The real state rides along so the simulated browser can retry.
                    ("302 Found", "text/plain", format!("Location: {loc}\r\nX-Real-State: {}\r\n", q["state"]), String::new())
                }
                ("POST", "/token") => {
                    let f = form(body);
                    let mut s = st.lock().unwrap();
                    s.token_calls += 1;
                    let bad = |e: &str| ("400 Bad Request", json, String::new(), serde_json::json!({"error": e}).to_string());
                    let expires_in = s.expires_in;
                    match f.get("grant_type").map(String::as_str) {
                        Some("authorization_code") => {
                            let Some((challenge, nonce, redirect, client)) = s.codes.remove(&f["code"]) else { return bad("invalid_grant") };
                            // PKCE: the verifier must hash to the challenge.
                            if f.get("code_verifier").map(|v| s256(v)) != Some(challenge) {
                                return bad("invalid_grant");
                            }
                            if f.get("redirect_uri") != Some(&redirect) || f.get("client_id") != Some(&client) {
                                return bad("invalid_grant");
                            }
                            let rt = random_b64(16);
                            s.refresh_tokens.insert(rt.clone(), nonce.clone());
                            ("200 OK", json, String::new(), serde_json::json!({
                                "access_token": jwt(serde_json::json!({"iss": base, "aud": "console", "sub": "u1", "exp": now_unix() + expires_in})),
                                "token_type": "Bearer", "expires_in": expires_in, "refresh_token": rt,
                                "id_token": Self::id_token(base, "u1", Some(&nonce)),
                            }).to_string())
                        }
                        Some("refresh_token") => {
                            let Some(nonce) = s.refresh_tokens.remove(&f["refresh_token"]) else { return bad("invalid_grant") };
                            let rt = random_b64(16); // rotation
                            s.refresh_tokens.insert(rt.clone(), nonce.clone());
                            ("200 OK", json, String::new(), serde_json::json!({
                                "access_token": format!("access-{}", s.token_calls), "token_type": "Bearer", "expires_in": expires_in,
                                "refresh_token": rt, "id_token": Self::id_token(base, "u1", Some(&nonce)),
                            }).to_string())
                        }
                        _ => bad("unsupported_grant_type"),
                    }
                }
                ("POST", "/revoke") => {
                    let f = form(body);
                    st.lock().unwrap().revoked.push(f["token"].clone());
                    ("200 OK", json, String::new(), String::new())
                }
                _ => ("404 Not Found", "text/plain", String::new(), String::new()),
            }
        }
    }

    /// A simulated system browser: follow the IdP's redirect to the loopback
    /// callback, as a browser would after the person signs in.
    fn browser(retry_with_real_state: bool) -> impl FnOnce(&str) -> Result<(), String> {
        move |auth_url: &str| {
            let auth_url = auth_url.to_string();
            tokio::spawn(async move {
                let (status, _, loc) = http_request("GET", &auth_url, None).await.unwrap();
                assert_eq!(status, 302);
                let loc = loc.unwrap();
                let (s, _, _) = http_request("GET", &loc, None).await.unwrap();
                if retry_with_real_state {
                    assert_eq!(s, 400, "a forged state is answered, not accepted");
                    // The legitimate redirect arrives afterwards and completes the flow.
                    let mut u = url::Url::parse(&loc).unwrap();
                    let code: String = u.query_pairs().find(|(k, _)| k == "code").unwrap().1.into_owned();
                    let real = REAL_STATE.lock().unwrap().clone();
                    u.query_pairs_mut().clear().append_pair("code", &code).append_pair("state", &real);
                    let (s2, _, _) = http_request("GET", u.as_str(), None).await.unwrap();
                    assert_eq!(s2, 200);
                } else {
                    assert_eq!(s, 200);
                }
            });
            Ok(())
        }
    }
    static REAL_STATE: Mutex<String> = Mutex::new(String::new());

    #[tokio::test]
    async fn full_pkce_flow_against_a_mock_issuer_then_refresh_and_revoke() {
        let idp = MockIssuer::start().await;
        let s = sign_in(&idp.base, "console", browser(false), Duration::from_secs(10)).await.unwrap();
        assert_eq!(s.claims.sub, "u1");
        assert_eq!(s.claims.name, "Ada Lovelace");
        assert!(s.tokens.refresh_token.is_some());
        assert!(s.tokens.expires_at > now_unix());

        // Refresh rotates the refresh token and replaces the access token.
        let r = s.refresh().await.unwrap();
        assert_ne!(r.tokens.access_token, s.tokens.access_token);
        assert_ne!(r.tokens.refresh_token, s.tokens.refresh_token);
        assert_eq!(r.claims.sub, "u1");
        // The rotated-away refresh token is dead: reusing it fails cleanly.
        let err = s.refresh().await.unwrap_err();
        assert!(err.contains("invalid_grant"), "{err}");

        // Resume from a stored refresh token ("remember this instance").
        let resumed = OidcSession::resume(&idp.base, "console", r.tokens.refresh_token.clone().unwrap()).await.unwrap();
        assert_eq!(resumed.claims.sub, "u1");

        // Logout: RFC 7009 revocation + an end-session URL without the ID token.
        assert!(resumed.revoke_refresh_token().await);
        assert_eq!(idp.state.lock().unwrap().revoked, vec![resumed.tokens.refresh_token.clone().unwrap()]);
        let end = resumed.end_session_url().unwrap();
        assert!(end.starts_with(&format!("{}/logout?", idp.base)) && end.contains("client_id=console"));
        assert!(!end.contains("id_token_hint"));
    }

    #[tokio::test]
    async fn a_forged_state_is_ignored_and_the_real_callback_still_completes() {
        let idp = MockIssuer::start().await;
        idp.state.lock().unwrap().forge_state_first = true;
        // Capture the real state from the authorization URL before the browser runs.
        let open = |url: &str| {
            let u = url::Url::parse(url).unwrap();
            *REAL_STATE.lock().unwrap() = u.query_pairs().find(|(k, _)| k == "state").unwrap().1.into_owned();
            browser(true)(url)
        };
        let s = sign_in(&idp.base, "console", open, Duration::from_secs(10)).await.unwrap();
        assert_eq!(s.claims.sub, "u1");
    }

    #[tokio::test]
    async fn a_wrong_pkce_verifier_is_refused_by_the_token_endpoint() {
        let idp = MockIssuer::start().await;
        let d = fetch_discovery(&idp.base).await.unwrap();
        let pkce = Pkce::new();
        let lb = Loopback::bind().await.unwrap();
        let url = authorization_url(&d, &AuthRequest { client_id: "console", redirect_uri: &lb.redirect_uri(), state: "S", nonce: "N", challenge: &pkce.challenge }).unwrap();
        let (_, _, loc) = http_request("GET", &url, None).await.unwrap();
        let code: String = url::Url::parse(&loc.unwrap()).unwrap().query_pairs().find(|(k, _)| k == "code").unwrap().1.into_owned();
        let other = Pkce::new();
        let err = token_request(&d, &[("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &lb.redirect_uri()), ("client_id", "console"), ("code_verifier", &other.verifier)])
            .await
            .err()
            .unwrap();
        assert!(err.contains("invalid_grant"), "{err}");
    }

    #[tokio::test]
    async fn the_flow_times_out_when_the_browser_never_returns() {
        let idp = MockIssuer::start().await;
        let err = sign_in(&idp.base, "console", |_| Ok(()), Duration::from_millis(200)).await.unwrap_err();
        assert!(err.contains("timed out"), "{err}");
    }

    #[tokio::test]
    async fn an_issuer_mismatch_in_discovery_is_refused() {
        let idp = MockIssuer::start().await;
        let other = idp.base.replace("/realms/test", "/realms/test2");
        // Discovery at the other path 404s; at the right path but named
        // differently it is a mismatch.
        assert!(fetch_discovery(&other).await.is_err());
        let d = fetch_discovery(&idp.base).await.unwrap();
        assert!(check_discovery(&other, &d).unwrap_err().contains("issuer mismatch"));
    }
}
