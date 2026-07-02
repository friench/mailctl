import { describe, it, expect } from 'vitest';
import {
  API_KEY_PREFIX_HEX_LENGTH,
  API_KEY_TOTAL_HEX_LENGTH,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
} from '../../src/lib/crypto';

describe('generateApiKey', () => {
  it('produces a 64-char hex plain key', () => {
    const { plain } = generateApiKey();
    expect(plain).toHaveLength(API_KEY_TOTAL_HEX_LENGTH);
    expect(plain).toMatch(/^[0-9a-f]+$/);
  });

  it('extracts the first 8 chars as prefix', () => {
    const { plain, prefix } = generateApiKey();
    expect(prefix).toHaveLength(API_KEY_PREFIX_HEX_LENGTH);
    expect(plain.startsWith(prefix)).toBe(true);
  });

  it('hash matches sha256(plain)', () => {
    const { plain, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(plain));
    expect(hash).toHaveLength(64); // sha256 hex
  });

  it('produces unique keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plain).not.toBe(b.plain);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('parseApiKey', () => {
  it('accepts a valid 64-hex string', () => {
    const valid = 'a'.repeat(64);
    expect(parseApiKey(valid)).toEqual({ prefix: 'aaaaaaaa' });
  });

  it('rejects wrong length', () => {
    expect(parseApiKey('a'.repeat(63))).toBeNull();
    expect(parseApiKey('a'.repeat(65))).toBeNull();
    expect(parseApiKey('')).toBeNull();
  });

  it('rejects non-hex chars', () => {
    expect(parseApiKey('z'.repeat(64))).toBeNull();
    expect(parseApiKey('A'.repeat(64))).toBeNull(); // uppercase rejected
  });

  it('rejects non-string input', () => {
    expect(parseApiKey(undefined)).toBeNull();
    expect(parseApiKey(null)).toBeNull();
    expect(parseApiKey(123)).toBeNull();
    expect(parseApiKey({})).toBeNull();
    expect(parseApiKey([])).toBeNull();
  });
});

describe('verifyApiKey', () => {
  it('returns true for a matching key', () => {
    const { plain, hash } = generateApiKey();
    expect(verifyApiKey(plain, hash)).toBe(true);
  });

  it('returns false for a tampered key', () => {
    const { plain, hash } = generateApiKey();
    const tampered = plain.slice(0, -1) + (plain.endsWith('a') ? 'b' : 'a');
    expect(verifyApiKey(tampered, hash)).toBe(false);
  });

  it('returns false for unrelated key', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(verifyApiKey(a.plain, b.hash)).toBe(false);
  });

  it('returns false for malformed hash', () => {
    const { plain } = generateApiKey();
    expect(verifyApiKey(plain, 'short')).toBe(false);
  });
});
