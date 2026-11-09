import type { AuthMethods } from '@/ipc/types';

/**
 * Which sign-in methods the login screen offers (ADR-0142 D1).
 *
 * The kernel's unauthenticated DescribeAuth decides, not the console: a kernel
 * names one OIDC issuer + client id and/or says it takes a password (local
 * accounts). Three cases the screen must not blur:
 *
 * - DescribeAuth not asked yet / in flight: offer nothing yet, the endpoint is
 *   what is being decided.
 * - The kernel predates DescribeAuth (Unimplemented → `describe_supported:
 *   false`): password, as before.
 * - DescribeAuth failed (unreachable kernel): we do not know. Offer the password
 *   form so a person is never locked out by a describe failure, and say why the
 *   single-sign-on button is missing.
 */
export type LoginMethodsView =
  | { kind: 'unknown' }
  | { kind: 'checking' }
  | {
      kind: 'known';
      password: boolean;
      /** The issuer to name on the button, or null when SSO is not configured. */
      oidc: { issuer: string; issuerHost: string; clientId: string } | null;
      /** The kernel takes neither: nothing can sign in (a misconfiguration). */
      none: boolean;
      /** The kernel is older than DescribeAuth. */
      legacy: boolean;
    }
  | { kind: 'failed'; error: string; password: true };

export function issuerHost(issuer: string): string {
  try {
    return new URL(issuer).host || issuer;
  } catch {
    return issuer;
  }
}

export function loginMethods(input: {
  endpoint: string;
  checking: boolean;
  methods: AuthMethods | null;
  error: string | null;
}): LoginMethodsView {
  if (!input.endpoint.trim()) return { kind: 'unknown' };
  if (input.checking) return { kind: 'checking' };
  if (input.error) return { kind: 'failed', error: input.error, password: true };
  const m = input.methods;
  if (!m) return { kind: 'unknown' };
  // An issuer without a client id cannot run a code flow; treat it as absent
  // rather than offer a button that can only fail.
  const oidc =
    m.oidc_issuer && m.oidc_client_id
      ? { issuer: m.oidc_issuer, issuerHost: issuerHost(m.oidc_issuer), clientId: m.oidc_client_id }
      : null;
  const password = m.password_login || !m.describe_supported;
  return { kind: 'known', password, oidc, none: !password && !oidc, legacy: !m.describe_supported };
}

/** "4m", "1h 5m" until the token expires; '' when no expiry is known. */
export function expiresIn(expiresAtMs: number, now = Date.now()): string {
  if (!expiresAtMs) return '';
  const s = Math.round((expiresAtMs - now) / 1000);
  if (s <= 0) return 'expired';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
