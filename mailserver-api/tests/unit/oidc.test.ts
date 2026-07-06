import { describe, it, expect } from 'vitest';
import { pkceChallenge, randomToken } from '../../src/lib/oidc';

describe('pkceChallenge', () => {
  it('matches the RFC 7636 test vector', () => {
    // From RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('is deterministic and url-safe (no +/=)', () => {
    const c = pkceChallenge('some-verifier-value');
    expect(c).toBe(pkceChallenge('some-verifier-value'));
    expect(c).not.toMatch(/[+/=]/);
  });
});

describe('randomToken', () => {
  it('produces distinct url-safe tokens', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[+/=]/);
    expect(a.length).toBeGreaterThan(20);
  });
});
