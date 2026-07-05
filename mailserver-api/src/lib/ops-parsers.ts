/** Parsers for the operational read-only views (mail queue, sessions, logs). */

export interface QueueEntry {
  queueId: string;
  sizeBytes: number;
  arrivalTime: string;
  sender: string;
  /** active (`*`), hold (`!`), or deferred (has a delay reason). */
  status: 'active' | 'hold' | 'deferred';
  /** The parenthesized delivery-delay reason, when Postfix reported one. */
  reason: string | null;
  recipients: string[];
}

export interface MailQueue {
  entries: QueueEntry[];
  /** The trailing `-- N Kbytes in M Requests.` summary, if present. */
  summary: string | null;
}

export interface Session {
  user: string;
  connections: number;
  proto: string;
  ips: string[];
}

// Queue IDs are short hex or long base-52; accept both alphanumeric forms.
const QUEUE_HEAD_RE = /^([0-9A-Za-z]+)([*!]?)\s+(\d+)\s+(\w{3} \w{3}\s+\d+ [\d:]+)\s+(\S+)?/;

/**
 * Parse `postqueue -p` / `mailq`. Entries are separated by blank lines: a header
 * line (queue id, size, arrival time, sender), an optional `(reason)` line, then
 * one recipient per following line.
 */
export function parsePostqueue(stdout: string): MailQueue {
  const text = stdout.replace(/\r\n/g, '\n').trim();
  if (text === '' || /Mail queue is empty/i.test(text)) {
    return { entries: [], summary: null };
  }

  const entries: QueueEntry[] = [];
  let summary: string | null = null;
  let current: QueueEntry | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('--')) {
      summary = line.replace(/^--\s*/, '').trim();
      continue;
    }
    if (line.trim() === '') {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('-Queue ID-')) continue; // column header

    const head = line.match(QUEUE_HEAD_RE);
    if (head) {
      if (current) entries.push(current);
      const flag = head[2];
      current = {
        queueId: head[1]!,
        sizeBytes: Number.parseInt(head[3]!, 10),
        arrivalTime: head[4]!.replace(/\s+/g, ' ').trim(),
        sender: head[5] ?? '',
        status: flag === '*' ? 'active' : flag === '!' ? 'hold' : 'deferred',
        reason: null,
        recipients: [],
      };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      current.reason = trimmed.slice(1, -1);
    } else if (trimmed) {
      current.recipients.push(trimmed);
    }
  }
  if (current) entries.push(current);

  return { entries, summary };
}

/**
 * Parse `doveadm who` — one row per logged-in user:
 *   `username   # proto (pids)   (ips)`
 * The header row and unparseable lines are skipped.
 */
export function parseDoveadmWho(stdout: string): Session[] {
  const out: Session[] = [];
  for (const raw of stdout.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('username')) continue;
    const m = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+\(([^)]*)\)\s+\(([^)]*)\)/);
    if (!m) continue;
    out.push({
      user: m[1]!,
      connections: Number.parseInt(m[2]!, 10),
      proto: m[3]!,
      ips: m[5]!.split(/\s+/).filter(Boolean),
    });
  }
  return out;
}

/** Split a raw log tail into non-empty lines, filter by `query`, and cap to `limit`. */
export function filterLogLines(raw: string, query: string | null, limit: number): string[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.length > 0);
  const q = query?.trim().toLowerCase();
  const matched = q ? lines.filter((l) => l.toLowerCase().includes(q)) : lines;
  return matched.slice(-limit);
}
