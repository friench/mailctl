import { describe, it, expect } from 'vitest';
import { parseDsn } from '../../src/lib/dsn-parser';

const HARD_BOUNCE = `From: MAILER-DAEMON@mail.example.com
To: sender@example.com
Subject: Undelivered Mail Returned to Sender
Content-Type: multipart/report; report-type=delivery-status; boundary="B"
Message-ID: <bounce-999@mail.example.com>

--B
Content-Type: text/plain

Delivery to the following recipient failed permanently.

--B
Content-Type: message/delivery-status

Reporting-MTA: dns; mail.example.com

Final-Recipient: rfc822; NoUser@dest.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 <nouser@dest.com>: Recipient address rejected:
 User unknown in virtual mailbox table

--B
Content-Type: message/rfc822

Received: from app by mail.example.com
Message-ID: <original-abc@example.com>
From: sender@example.com
To: nouser@dest.com
Subject: Hello

--B--
`;

describe('parseDsn', () => {
  it('parses a hard bounce with recipient, status, diagnostic and original message id', () => {
    const dsn = parseDsn(HARD_BOUNCE)!;
    expect(dsn.recipients).toHaveLength(1);
    const r = dsn.recipients[0]!;
    expect(r.recipient).toBe('nouser@dest.com');
    expect(r.action).toBe('failed');
    expect(r.statusCode).toBe('5.1.1');
    expect(r.classification).toBe('hard');
    expect(r.diagnostic).toContain('User unknown in virtual mailbox table'); // folded line joined
    expect(dsn.originalMessageId).toBe('original-abc@example.com');
  });

  it('classifies a 4.x status as a soft bounce', () => {
    const soft = HARD_BOUNCE.replace('Status: 5.1.1', 'Status: 4.4.1').replace(
      '550 5.1.1',
      '451 4.4.1',
    );
    expect(parseDsn(soft)!.recipients[0]!.classification).toBe('soft');
  });

  it('parses multiple recipients', () => {
    const multi = `Content-Type: message/delivery-status

Final-Recipient: rfc822; a@dest.com
Action: failed
Status: 5.0.0

Final-Recipient: rfc822; b@dest.com
Action: failed
Status: 4.2.2
`;
    const dsn = parseDsn(multi)!;
    expect(dsn.recipients.map((r) => r.recipient)).toEqual(['a@dest.com', 'b@dest.com']);
    expect(dsn.recipients.map((r) => r.classification)).toEqual(['hard', 'soft']);
  });

  it('prefers an explicit Original-Message-ID header', () => {
    const withExplicit = HARD_BOUNCE.replace(
      'Content-Type: message/rfc822',
      'Original-Message-ID: <explicit-id@example.com>\nContent-Type: message/rfc822',
    );
    expect(parseDsn(withExplicit)!.originalMessageId).toBe('explicit-id@example.com');
  });

  it('returns null for a non-DSN message', () => {
    expect(parseDsn('Subject: hi\n\njust a normal email')).toBeNull();
    expect(parseDsn('')).toBeNull();
  });
});
