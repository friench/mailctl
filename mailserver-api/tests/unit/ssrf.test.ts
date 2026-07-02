import { describe, it, expect } from 'vitest';
import { isBlockedAddress, assertPublicUrl } from '../../src/lib/ssrf';

describe('isBlockedAddress', () => {
  it('blocks loopback, private, CGNAT, link-local, and unspecified IPv4', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('172.16.5.4')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true); // cloud metadata
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
  });

  it('allows public IPv4', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('blocks loopback, link-local, unique-local, and unspecified IPv6', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456::1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
  });

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('fails closed on invalid input', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('assertPublicUrl', () => {
  const publicLookup = async () => ['93.184.216.34'];
  const privateLookup = async () => ['127.0.0.1'];

  it('resolves for a public host', async () => {
    await expect(
      assertPublicUrl('https://example.com/hook', {
        allowPrivate: false,
        lookup: publicLookup,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when the host resolves to a private/loopback address', async () => {
    await expect(
      assertPublicUrl('https://internal.example.com', {
        allowPrivate: false,
        lookup: privateLookup,
      }),
    ).rejects.toThrow(/Blocked SSRF target/);
  });

  it('throws when ANY resolved address is blocked', async () => {
    await expect(
      assertPublicUrl('https://mixed.example.com', {
        allowPrivate: false,
        lookup: async () => ['8.8.8.8', '10.0.0.1'],
      }),
    ).rejects.toThrow(/Blocked SSRF target/);
  });

  it('bypasses all checks when allowPrivate is true', async () => {
    await expect(
      assertPublicUrl('http://localhost:3000/hook', {
        allowPrivate: true,
        lookup: privateLookup,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(
      assertPublicUrl('ftp://example.com/file', {
        allowPrivate: false,
        lookup: publicLookup,
      }),
    ).rejects.toThrow(/unsupported protocol/);
  });

  it('rejects malformed URLs', async () => {
    await expect(
      assertPublicUrl('not a url', { allowPrivate: false, lookup: publicLookup }),
    ).rejects.toThrow(/invalid URL/);
  });

  it('checks IP-literal hosts directly without a lookup', async () => {
    let called = false;
    const lookup = async () => {
      called = true;
      return ['8.8.8.8'];
    };
    await expect(
      assertPublicUrl('http://169.254.169.254/latest/meta-data', {
        allowPrivate: false,
        lookup,
      }),
    ).rejects.toThrow(/Blocked SSRF target/);
    expect(called).toBe(false);

    await assertPublicUrl('http://8.8.8.8/x', { allowPrivate: false, lookup });
    expect(called).toBe(false);
  });

  it('checks bracketed IPv6-literal hosts', async () => {
    await expect(assertPublicUrl('http://[::1]/x', { allowPrivate: false })).rejects.toThrow(
      /Blocked SSRF target/,
    );
  });
});
