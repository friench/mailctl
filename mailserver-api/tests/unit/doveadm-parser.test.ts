import { describe, it, expect } from 'vitest';
import { countSearchResults, parseJunkFetch } from '../../src/lib/doveadm-parser';

// Representative `doveadm fetch` output: one `field: value` line per requested
// field, messages separated by a form-feed (\f) on its own line.
const SAMPLE = [
  'uid: 5',
  'guid: aaaa1111',
  'size.physical: 4096',
  'date.received: 2026-07-01 12:34:56',
  'hdr.from: Spammer <spam@bad.example>',
  'hdr.subject: You won a prize',
  'hdr.x-spam-score: 12.5',
  '\f',
  'uid: 9',
  'guid: bbbb2222',
  'size.physical: 2048',
  'date.received: 2026-07-02 08:00:00',
  'hdr.from: Newsletter <news@example.com>',
  'hdr.subject: Weekly digest',
  'hdr.x-spam-score: ',
].join('\n');

describe('parseJunkFetch', () => {
  it('parses each message block into a typed record', () => {
    const msgs = parseJunkFetch(SAMPLE);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      uid: 5,
      guid: 'aaaa1111',
      from: 'Spammer <spam@bad.example>',
      subject: 'You won a prize',
      date: '2026-07-01 12:34:56',
      sizeBytes: 4096,
      score: 12.5,
    });
  });

  it('parses Dovecot 2.4 output (maildir guid, bare empty header)', () => {
    // Captured from docker-mailserver 16.0.1 (Dovecot 2.4.1), SpamAssassin off.
    const dump = [
      'uid: 1',
      'guid: 1790670967.M389539P2907.mail.example.org,S=1154,W=1180',
      'size.physical: 1154',
      'date.received: 2026-09-29 08:36:07',
      'hdr.from: smoke@example.org',
      'hdr.subject: dms16 smoke',
      'hdr.x-spam-score:',
      '',
    ].join('\n');
    expect(parseJunkFetch(dump)).toEqual([
      {
        uid: 1,
        guid: '1790670967.M389539P2907.mail.example.org,S=1154,W=1180',
        from: 'smoke@example.org',
        subject: 'dms16 smoke',
        date: '2026-09-29 08:36:07',
        sizeBytes: 1154,
        score: null,
      },
    ]);
  });

  it('leaves score null when the header is absent or empty', () => {
    const msgs = parseJunkFetch(SAMPLE);
    expect(msgs[1]!.score).toBeNull();
    expect(msgs[1]!.uid).toBe(9);
  });

  it('returns an empty array for empty output', () => {
    expect(parseJunkFetch('')).toEqual([]);
    expect(parseJunkFetch('\n\n')).toEqual([]);
  });

  it('skips blocks with no usable uid', () => {
    expect(parseJunkFetch('guid: x\nhdr.subject: no uid here')).toEqual([]);
  });

  it('joins folded header continuation lines', () => {
    const folded = ['uid: 1', 'guid: g', 'hdr.subject: A very long', '  wrapped subject'].join(
      '\n',
    );
    expect(parseJunkFetch(folded)[0]!.subject).toBe('A very long wrapped subject');
  });

  it('tolerates CRLF line endings', () => {
    const msgs = parseJunkFetch('uid: 3\r\nguid: g3\r\nhdr.subject: hi\r\n');
    expect(msgs[0]!.uid).toBe(3);
    expect(msgs[0]!.subject).toBe('hi');
  });
});

describe('countSearchResults', () => {
  it('counts non-empty lines', () => {
    expect(countSearchResults('guid1 5\nguid2 9\nguid3 11\n')).toBe(3);
  });

  it('returns 0 for empty output', () => {
    expect(countSearchResults('')).toBe(0);
    expect(countSearchResults('\n  \n')).toBe(0);
  });
});
