import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  assessStrength,
  createPwnedChecker,
  PolicyPasswordValidator,
} from '../../src/lib/password-policy';

const sha1Upper = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').toUpperCase();

describe('assessStrength', () => {
  it('rejects passwords shorter than the minimum', () => {
    expect(assessStrength('abcde1', { minLength: 10 })).toMatch(/at least 10/);
  });

  it('rejects a single repeated character', () => {
    expect(assessStrength('aaaaaaaaaa')).toMatch(/repeated/);
  });

  it('rejects too few distinct characters', () => {
    expect(assessStrength('ababababab')).toMatch(/distinct/);
  });

  it('rejects a common password', () => {
    expect(assessStrength('password1', { minLength: 8 })).toMatch(/common/);
  });

  it('accepts a strong password', () => {
    expect(assessStrength('Gh7$kLmn92xQ')).toBeNull();
  });
});

describe('createPwnedChecker (k-anonymity)', () => {
  it('detects a breached password when the suffix is present in the range', async () => {
    const pw = 'breached-example';
    const suffix = sha1Upper(pw).slice(5);
    const checker = createPwnedChecker(async () => `${suffix}:42\r\nDEADBEEFDEADBEEF:1`);
    expect(await checker.isBreached(pw)).toBe(true);
  });

  it('returns false when the suffix is absent', async () => {
    const checker = createPwnedChecker(async () => 'AAAAAAAAAAAAAAAAAAAA:1\r\nBBBBBBBBBB:2');
    expect(await checker.isBreached('some-unique-password')).toBe(false);
  });

  it('fails open (false) when the lookup throws', async () => {
    const checker = createPwnedChecker(async () => {
      throw new Error('HIBP down');
    });
    expect(await checker.isBreached('anything')).toBe(false);
  });
});

describe('PolicyPasswordValidator', () => {
  it('reports the strength error before hitting HIBP', async () => {
    const v = new PolicyPasswordValidator({ minLength: 10, hibp: false });
    expect(await v.validate('short')).toMatch(/at least 10/);
  });

  it('flags breached passwords via the injected checker', async () => {
    const v = new PolicyPasswordValidator({
      minLength: 8,
      hibp: true,
      pwnedChecker: { isBreached: async () => true },
    });
    expect(await v.validate('Gh7$kLmn92xQ')).toMatch(/data breach/);
  });

  it('accepts a strong, non-breached password', async () => {
    const v = new PolicyPasswordValidator({
      hibp: true,
      pwnedChecker: { isBreached: async () => false },
    });
    expect(await v.validate('Gh7$kLmn92xQ')).toBeNull();
  });

  it('skips the breach check when hibp is disabled', async () => {
    const v = new PolicyPasswordValidator({
      hibp: false,
      pwnedChecker: {
        isBreached: async () => {
          throw new Error('should not be called');
        },
      },
    });
    expect(await v.validate('Gh7$kLmn92xQ')).toBeNull();
  });
});
