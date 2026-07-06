import type { Logger } from '../../logger';

/** Identity resolved from the IdP's userinfo endpoint after a successful exchange. */
export interface OidcIdentity {
  email: string;
  emailVerified: boolean;
  subject: string;
}

export interface AuthorizationParams {
  state: string;
  nonce: string;
  codeChallenge: string;
}

/** Abstracts the OpenID Connect authorization-code flow. Mockable for tests. */
export interface OidcProvider {
  readonly enabled: boolean;
  readonly label: string;
  /** Build the IdP authorize URL to redirect the browser to. */
  authorizationUrl(params: AuthorizationParams): Promise<string>;
  /** Exchange an authorization code (+ PKCE verifier) and return the identity. */
  exchange(params: { code: string; codeVerifier: string }): Promise<OidcIdentity>;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  label: string;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

/** OidcProvider that is off — used when SSO is not configured. */
export class DisabledOidcProvider implements OidcProvider {
  readonly enabled = false;
  readonly label = '';
  async authorizationUrl(): Promise<string> {
    throw new Error('OIDC is not configured');
  }
  async exchange(): Promise<OidcIdentity> {
    throw new Error('OIDC is not configured');
  }
}

/**
 * HTTP-backed OIDC provider (authorization-code + PKCE). Identity is read from
 * the IdP's `userinfo` endpoint after the code exchange — both are direct
 * server-to-server TLS calls, so no local ID-token signature verification is
 * required (OIDC §3.1.3.7). CSRF is prevented by the `state` check in the route.
 */
export class HttpOidcProvider implements OidcProvider {
  readonly enabled = true;
  readonly label: string;
  private discovery: Discovery | null = null;

  constructor(
    private readonly config: OidcConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly logger?: Logger,
  ) {
    this.label = config.label;
  }

  private async discover(): Promise<Discovery> {
    if (this.discovery) return this.discovery;
    const url = `${this.config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
    const meta = (await res.json()) as Discovery;
    if (!meta.authorization_endpoint || !meta.token_endpoint || !meta.userinfo_endpoint) {
      throw new Error('OIDC discovery document missing required endpoints');
    }
    this.discovery = meta;
    return meta;
  }

  async authorizationUrl(params: AuthorizationParams): Promise<string> {
    const { authorization_endpoint } = await this.discover();
    const url = new URL(authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', this.config.scopes);
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchange(params: { code: string; codeVerifier: string }): Promise<OidcIdentity> {
    const { token_endpoint, userinfo_endpoint } = await this.discover();

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code_verifier: params.codeVerifier,
    });
    const tokenRes = await this.fetchImpl(token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    });
    if (!tokenRes.ok) {
      this.logger?.warn({ status: tokenRes.status }, 'OIDC token exchange failed');
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error('Token response missing access_token');

    const infoRes = await this.fetchImpl(userinfo_endpoint, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
    });
    if (!infoRes.ok) throw new Error(`Userinfo request failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
    };
    if (!info.email) throw new Error('Userinfo response has no email');

    return {
      email: info.email,
      emailVerified: info.email_verified ?? false,
      subject: info.sub ?? '',
    };
  }
}
