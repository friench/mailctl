import { createHash, randomBytes } from 'node:crypto';

/** A URL-safe random token for OAuth state / nonce / PKCE verifier. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** PKCE S256 code challenge = base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
