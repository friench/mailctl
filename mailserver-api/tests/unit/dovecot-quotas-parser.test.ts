import { describe, it, expect } from 'vitest';
import { parseDovecotQuotas, quotaToMb } from '../../src/lib/dovecot-quotas-parser';

describe('quotaToMb', () => {
  it('converts unit-suffixed values to MB', () => {
    expect(quotaToMb('256M')).toBe(256);
    expect(quotaToMb('5G')).toBe(5120);
    expect(quotaToMb('1T')).toBe(1024 * 1024);
    expect(quotaToMb('2048K')).toBe(2);
  });

  it('treats a bare number as bytes', () => {
    expect(quotaToMb(String(10 * 1024 * 1024))).toBe(10);
  });

  it('returns null for garbage', () => {
    expect(quotaToMb('abc')).toBeNull();
  });
});

describe('parseDovecotQuotas', () => {
  it('parses address:quota lines', () => {
    const out = parseDovecotQuotas('user@example.com:256M\nbig@example.com:5G\n');
    expect(out).toEqual([
      { address: 'user@example.com', quotaMb: 256 },
      { address: 'big@example.com', quotaMb: 5120 },
    ]);
  });

  it('ignores the optional message-count field after a second colon', () => {
    expect(parseDovecotQuotas('user@example.com:256M:1000')).toEqual([
      { address: 'user@example.com', quotaMb: 256 },
    ]);
  });

  it('skips comments and blanks', () => {
    expect(parseDovecotQuotas('# header\n\nuser@example.com:100M')).toEqual([
      { address: 'user@example.com', quotaMb: 100 },
    ]);
  });
});
