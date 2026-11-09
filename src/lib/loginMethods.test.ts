import { describe, expect, it } from 'vitest';
import { expiresIn, issuerHost, loginMethods } from '@/lib/loginMethods';
import type { AuthMethods } from '@/ipc/types';

const m = (over: Partial<AuthMethods> = {}): AuthMethods => ({
  password_login: false,
  oidc_issuer: '',
  oidc_client_id: '',
  describe_supported: true,
  ...over,
});

describe('loginMethods', () => {
  it('offers nothing until there is an endpoint, and waits while checking', () => {
    expect(loginMethods({ endpoint: ' ', checking: false, methods: null, error: null }).kind).toBe('unknown');
    expect(loginMethods({ endpoint: 'k:1', checking: true, methods: null, error: null }).kind).toBe('checking');
  });

  it('shows exactly the methods the kernel names', () => {
    const both = loginMethods({
      endpoint: 'k:1',
      checking: false,
      error: null,
      methods: m({ password_login: true, oidc_issuer: 'https://id.example.org/realms/c', oidc_client_id: 'console' }),
    });
    expect(both).toMatchObject({ kind: 'known', password: true, none: false, legacy: false });
    expect(both.kind === 'known' && both.oidc?.issuerHost).toBe('id.example.org');

    const ssoOnly = loginMethods({
      endpoint: 'k:1',
      checking: false,
      error: null,
      methods: m({ oidc_issuer: 'https://id.example.org', oidc_client_id: 'console' }),
    });
    expect(ssoOnly).toMatchObject({ kind: 'known', password: false });

    const pwOnly = loginMethods({ endpoint: 'k:1', checking: false, error: null, methods: m({ password_login: true }) });
    expect(pwOnly).toMatchObject({ kind: 'known', password: true, oidc: null });
  });

  it('an issuer without a client id is not a usable SSO option', () => {
    const v = loginMethods({ endpoint: 'k:1', checking: false, error: null, methods: m({ oidc_issuer: 'https://x' }) });
    expect(v).toMatchObject({ kind: 'known', oidc: null, none: true });
  });

  it('an older kernel (no DescribeAuth) is password-only', () => {
    const v = loginMethods({ endpoint: 'k:1', checking: false, error: null, methods: m({ describe_supported: false }) });
    expect(v).toMatchObject({ kind: 'known', password: true, oidc: null, legacy: true });
  });

  it('a describe failure never locks the person out of the password form', () => {
    const v = loginMethods({ endpoint: 'k:1', checking: false, methods: null, error: 'unreachable' });
    expect(v).toEqual({ kind: 'failed', error: 'unreachable', password: true });
  });

  it('formats the issuer and the remaining token lifetime', () => {
    expect(issuerHost('https://login.microsoftonline.com/t/v2.0')).toBe('login.microsoftonline.com');
    expect(issuerHost('not a url')).toBe('not a url');
    expect(expiresIn(0)).toBe('');
    expect(expiresIn(1000, 2000)).toBe('expired');
    expect(expiresIn(45_000, 0)).toBe('45s');
    expect(expiresIn(5 * 60_000, 0)).toBe('5m');
    expect(expiresIn(65 * 60_000, 0)).toBe('1h 5m');
  });
});
