/** One quota parsed from docker-mailserver's `dovecot-quotas.cf`. */
export interface ParsedQuota {
  address: string;
  quotaMb: number;
}

/** Convert a quota value like `5G`, `256M`, `512000K`, or raw bytes to megabytes. */
export function quotaToMb(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? '').toUpperCase()) {
    case 'T':
      return Math.round(n * 1024 * 1024);
    case 'G':
      return Math.round(n * 1024);
    case 'M':
      return Math.round(n);
    case 'K':
      return Math.max(0, Math.round(n / 1024));
    default:
      // No unit → interpret as raw bytes.
      return Math.max(0, Math.round(n / (1024 * 1024)));
  }
}

/**
 * Parse a `dovecot-quotas.cf` file. Each non-comment line is
 * `user@domain:<quota>[:<messages>]`; only the storage quota is returned.
 */
export function parseDovecotQuotas(content: string): ParsedQuota[] {
  const out: ParsedQuota[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const address = line.slice(0, idx).trim().toLowerCase();
    const rawValue =
      line
        .slice(idx + 1)
        .split(':')[0]
        ?.trim() ?? '';
    if (!address || !rawValue) continue;
    const mb = quotaToMb(rawValue);
    if (mb === null) continue;
    out.push({ address, quotaMb: mb });
  }
  return out;
}
