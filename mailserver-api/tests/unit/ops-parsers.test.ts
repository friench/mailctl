import { describe, it, expect } from 'vitest';
import { filterLogLines, parseDoveadmWho, parsePostqueue } from '../../src/lib/ops-parsers';

const QUEUE = `-Queue ID-  --Size-- ----Arrival Time---- -Sender/Recipient-------
A1B2C3D4E5     1234 Tue Jul  1 12:00:00  sender@example.com
(host mx.dest.com said: 451 4.3.0 temporary failure)
                                         rcpt@dest.com

F6G7H8I9J0*    5678 Tue Jul  1 12:05:00  sender2@example.com
                                         rcpt2@dest.com
                                         rcpt3@dest.com

-- 6 Kbytes in 2 Requests.`;

describe('parsePostqueue', () => {
  it('parses entries with size, sender, reason, recipients and status', () => {
    const q = parsePostqueue(QUEUE);
    expect(q.entries).toHaveLength(2);
    expect(q.entries[0]).toMatchObject({
      queueId: 'A1B2C3D4E5',
      sizeBytes: 1234,
      sender: 'sender@example.com',
      status: 'deferred',
      reason: 'host mx.dest.com said: 451 4.3.0 temporary failure',
      recipients: ['rcpt@dest.com'],
    });
    expect(q.entries[1]!.status).toBe('active');
    expect(q.entries[1]!.recipients).toEqual(['rcpt2@dest.com', 'rcpt3@dest.com']);
    expect(q.summary).toBe('6 Kbytes in 2 Requests.');
  });

  it('returns an empty queue', () => {
    expect(parsePostqueue('Mail queue is empty')).toEqual({ entries: [], summary: null });
    expect(parsePostqueue('')).toEqual({ entries: [], summary: null });
  });
});

describe('parseDoveadmWho', () => {
  it('parses user, connection count, proto and ips', () => {
    const dump = `username                    # proto (pids)                (ips)
foo@example.org             2 imap  (12345 12346)          (10.0.0.1 10.0.0.2)
bar@example.org             1 pop3  (22222)                (203.0.113.9)`;
    const sessions = parseDoveadmWho(dump);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({
      user: 'foo@example.org',
      connections: 2,
      proto: 'imap',
      ips: ['10.0.0.1', '10.0.0.2'],
    });
    expect(sessions[1]!.proto).toBe('pop3');
  });

  it('returns empty for no sessions', () => {
    expect(parseDoveadmWho('username # proto (pids) (ips)\n')).toEqual([]);
    expect(parseDoveadmWho('')).toEqual([]);
  });
});

describe('filterLogLines', () => {
  const raw = ['line one warn', 'line two ok', 'line three WARN', ''].join('\n');

  it('drops blank lines and returns all when no query', () => {
    expect(filterLogLines(raw, null, 100)).toEqual([
      'line one warn',
      'line two ok',
      'line three WARN',
    ]);
  });

  it('filters case-insensitively by query', () => {
    expect(filterLogLines(raw, 'warn', 100)).toEqual(['line one warn', 'line three WARN']);
  });

  it('caps to the last N lines', () => {
    expect(filterLogLines(raw, null, 1)).toEqual(['line three WARN']);
  });
});
