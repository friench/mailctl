import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, TEST_ENV } from '../helpers/server';
import type {
  OidcIdentity,
  OidcProvider,
  AuthorizationParams,
} from '../../src/domain/auth/oidc-provider';
import type { OidcRouteOptions } from '../../src/http/routes/auth';

class FakeOidcProvider implements OidcProvider {
  readonly enabled = true;
  readonly label = 'Login with Test IdP';
  public identity: OidcIdentity = {
    email: 'sso@example.org',
    emailVerified: true,
    subject: 'sub-1',
  };
  public lastVerifier: string | null = null;

  async authorizationUrl(p: AuthorizationParams): Promise<string> {
    return `https://idp.example/authorize?state=${p.state}&nonce=${p.nonce}&code_challenge=${p.codeChallenge}`;
  }
  async exchange(p: { code: string; codeVerifier: string }): Promise<OidcIdentity> {
    this.lastVerifier = p.codeVerifier;
    return this.identity;
  }
}

function oidcOptions(provider: OidcProvider, autoProvision = false): OidcRouteOptions {
  return {
    provider,
    provision: { autoProvision, defaultRole: 'read_only', adminEmails: ['boss@example.org'] },
    requireVerifiedEmail: true,
  };
}

/** Drive /oidc/start and return the agent + the state the server issued. */
async function startFlow(app: Express) {
  const agent = request.agent(app);
  const res = await agent.get('/admin/auth/oidc/start');
  expect(res.status).toBe(302);
  const state = new URL(String(res.headers.location)).searchParams.get('state');
  expect(state).toBeTruthy();
  return { agent, state: state! };
}

describe('OIDC/SSO login', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });
  afterEach(() => h.close());

  it('reports SSO disabled by default', async () => {
    const app = createTestApp(h).app;
    const res = await request(app).get('/admin/auth/config');
    expect(res.body.oidc.enabled).toBe(false);
    expect((await request(app).get('/admin/auth/oidc/start')).status).toBe(404);
  });

  it('advertises SSO when enabled', async () => {
    const app = createTestApp(h, TEST_ENV, oidcOptions(new FakeOidcProvider())).app;
    const res = await request(app).get('/admin/auth/config');
    expect(res.body.oidc).toEqual({ enabled: true, label: 'Login with Test IdP' });
  });

  it('completes a login for an existing user and opens a session', async () => {
    await h.userService.create('sso@example.org', 'unused-password', 'read_only');
    const provider = new FakeOidcProvider();
    const app = createTestApp(h, TEST_ENV, oidcOptions(provider)).app;

    const { agent, state } = await startFlow(app);
    const cb = await agent.get(`/admin/auth/oidc/callback?code=abc&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('/admin/');
    expect(provider.lastVerifier).toBeTruthy(); // PKCE verifier was passed through

    // The session is usable.
    const me = await agent.get('/admin/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('sso@example.org');
  });

  it('rejects an unknown user when auto-provision is off', async () => {
    const app = createTestApp(h, TEST_ENV, oidcOptions(new FakeOidcProvider(), false)).app;
    const { agent, state } = await startFlow(app);
    const cb = await agent.get(`/admin/auth/oidc/callback?code=abc&state=${state}`);
    expect(cb.headers.location).toBe('/admin/login?error=sso_no_account');
    expect(h.userRepo.findByEmail('sso@example.org')).toBeUndefined();
  });

  it('auto-provisions an unknown user with the default role', async () => {
    const app = createTestApp(h, TEST_ENV, oidcOptions(new FakeOidcProvider(), true)).app;
    const { agent, state } = await startFlow(app);
    const cb = await agent.get(`/admin/auth/oidc/callback?code=abc&state=${state}`);
    expect(cb.headers.location).toBe('/admin/');
    const created = h.userRepo.findByEmail('sso@example.org');
    expect(created?.role).toBe('read_only');
  });

  it('grants admin to an allow-listed email on provision', async () => {
    const provider = new FakeOidcProvider();
    provider.identity = { email: 'boss@example.org', emailVerified: true, subject: 's' };
    const app = createTestApp(h, TEST_ENV, oidcOptions(provider, true)).app;
    const { agent, state } = await startFlow(app);
    await agent.get(`/admin/auth/oidc/callback?code=abc&state=${state}`);
    expect(h.userRepo.findByEmail('boss@example.org')?.role).toBe('admin');
  });

  it('rejects a state mismatch (CSRF guard)', async () => {
    const app = createTestApp(h, TEST_ENV, oidcOptions(new FakeOidcProvider(), true)).app;
    const { agent } = await startFlow(app);
    const cb = await agent.get('/admin/auth/oidc/callback?code=abc&state=wrong-state');
    expect(cb.headers.location).toBe('/admin/login?error=sso_state');
  });

  it('rejects an unverified email', async () => {
    const provider = new FakeOidcProvider();
    provider.identity = { email: 'sso@example.org', emailVerified: false, subject: 's' };
    const app = createTestApp(h, TEST_ENV, oidcOptions(provider, true)).app;
    const { agent, state } = await startFlow(app);
    const cb = await agent.get(`/admin/auth/oidc/callback?code=abc&state=${state}`);
    expect(cb.headers.location).toBe('/admin/login?error=sso_unverified');
  });
});
