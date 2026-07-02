import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

/** Resolve a hostname to a list of IP address strings. */
export type LookupFn = (host: string) => Promise<string[]>;

const defaultLookup: LookupFn = async (host) => {
  const results = await dns.lookup(host, { all: true });
  return results.map((r) => r.address);
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as blocked (fail closed)

  const inRange = (base: string, prefix: number): boolean => {
    const baseInt = ipv4ToInt(base)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (n & mask) === (baseInt & mask);
  };

  return (
    inRange('0.0.0.0', 8) || // "this" network / unspecified
    inRange('10.0.0.0', 8) || // private
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local incl. cloud metadata
    inRange('172.16.0.0', 12) || // private
    inRange('192.168.0.0', 16) // private
  );
}

/** Expand an IPv6 address into 8 groups of 16-bit values. Returns null if unparseable. */
function expandIpv6(ip: string): number[] | null {
  // Strip zone id (e.g. fe80::1%eth0)
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (s: string): string[] => (s === '' ? [] : s.split(':'));

  const head = parseGroups(halves[0]!);
  const tail = halves.length === 2 ? parseGroups(halves[1]!) : [];

  // A trailing IPv4-mapped tail (e.g. ::ffff:1.2.3.4) — convert last group.
  const convertTail = (groups: string[]): string[] | null => {
    if (groups.length === 0) return groups;
    const last = groups[groups.length - 1]!;
    if (last.includes('.')) {
      const n = ipv4ToInt(last);
      if (n === null) return null;
      const g1 = ((n >>> 16) & 0xffff).toString(16);
      const g2 = (n & 0xffff).toString(16);
      return [...groups.slice(0, -1), g1, g2];
    }
    return groups;
  };

  const headC = convertTail(head);
  const tailC = convertTail(tail);
  if (headC === null || tailC === null) return null;

  const missing = 8 - (headC.length + tailC.length);
  if (halves.length === 2) {
    if (missing < 0) return null;
  } else if (missing !== 0) {
    return null;
  }

  const full = [...headC, ...Array(Math.max(0, missing)).fill('0'), ...tailC];
  if (full.length !== 8) return null;

  const out: number[] = [];
  for (const group of full) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    out.push(parseInt(group, 16));
  }
  return out;
}

function isBlockedIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (groups === null) return true; // fail closed

  // Unspecified ::
  if (groups.every((g) => g === 0)) return true;
  // Loopback ::1
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;

  const first = groups[0]!;
  // Link-local fe80::/10
  if ((first & 0xffc0) === 0xfe80) return true;
  // Unique-local fc00::/7
  if ((first & 0xfe00) === 0xfc00) return true;

  // IPv4-mapped ::ffff:0:0/96 — check the embedded IPv4.
  const isV4Mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (isV4Mapped) {
    const v4 = `${(groups[6]! >>> 8) & 0xff}.${groups[6]! & 0xff}.${(groups[7]! >>> 8) & 0xff}.${groups[7]! & 0xff}`;
    return isBlockedIpv4(v4);
  }

  return false;
}

/**
 * Returns true if `ip` is a loopback, link-local (incl. cloud metadata),
 * private, CGNAT, unique-local, or unspecified address.
 */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP → fail closed
}

export interface AssertPublicUrlOptions {
  /** When true, all checks are skipped (operator opt-out). */
  allowPrivate: boolean;
  /** Injectable resolver so tests need no real DNS. */
  lookup?: LookupFn;
}

/**
 * Throws if `url` is not http(s) or resolves to a private/loopback/internal address.
 * A no-op when `opts.allowPrivate` is true.
 */
export async function assertPublicUrl(url: string, opts: AssertPublicUrlOptions): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Blocked SSRF target: invalid URL "${url}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked SSRF target: unsupported protocol "${parsed.protocol}"`);
  }

  if (opts.allowPrivate) return;

  // URL hostname keeps IPv6 literals bracketed; strip brackets for isIP/checks.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const lookup = opts.lookup ?? defaultLookup;
    addresses = await lookup(host);
    if (addresses.length === 0) {
      throw new Error(`Blocked SSRF target: ${host} did not resolve to any address`);
    }
  }

  for (const addr of addresses) {
    if (isBlockedAddress(addr)) {
      throw new Error(
        `Blocked SSRF target: ${host} resolves to a private/loopback address (${addr})`,
      );
    }
  }
}
