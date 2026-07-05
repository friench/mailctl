import type { JunkMessage } from '../domain/mailboxes/dms-client';

/**
 * Parse the output of
 *   `doveadm fetch "uid guid size.physical date.received hdr.from hdr.subject hdr.x-spam-score" …`
 *
 * doveadm prints one `field: value` line per requested field and separates
 * successive messages with a form-feed (`\f`) on its own line. Header values may
 * be folded across continuation lines (subsequent lines without a `field:` key).
 * Records that carry no usable UID are skipped.
 */
const FIELD_RE = /^([A-Za-z0-9._-]+): ?(.*)$/;

export function parseJunkFetch(stdout: string): JunkMessage[] {
  const normalized = stdout.replace(/\r\n/g, '\n');
  const out: JunkMessage[] = [];

  for (const block of normalized.split('\f')) {
    const fields = new Map<string, string>();
    let lastKey: string | null = null;

    for (const line of block.split('\n')) {
      const m = line.match(FIELD_RE);
      if (m) {
        lastKey = m[1]!.toLowerCase();
        fields.set(lastKey, m[2] ?? '');
      } else if (lastKey && line.trim()) {
        // Folded header continuation — append to the previous field.
        fields.set(lastKey, `${fields.get(lastKey) ?? ''} ${line.trim()}`);
      }
    }

    const uidRaw = fields.get('uid');
    if (!uidRaw) continue;
    const uid = Number.parseInt(uidRaw, 10);
    if (!Number.isFinite(uid)) continue;

    out.push({
      uid,
      guid: fields.get('guid') ?? '',
      from: (fields.get('hdr.from') ?? '').trim(),
      subject: (fields.get('hdr.subject') ?? '').trim(),
      date: (fields.get('date.received') ?? '').trim(),
      sizeBytes: parseIntOrNull(fields.get('size.physical')),
      score: parseFloatOrNull(fields.get('hdr.x-spam-score')),
    });
  }

  return out;
}

/** Count the messages returned by `doveadm search` (one `<mailbox-guid> <uid>` per line). */
export function countSearchResults(stdout: string): number {
  return stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0).length;
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
}
