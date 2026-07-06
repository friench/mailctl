/** Classification derived from the DSN status class (5.x.x = hard, 4.x.x = soft). */
export type BounceClassification = 'hard' | 'soft' | 'unknown';

export interface DsnRecipient {
  recipient: string;
  /** DSN `Action` field: failed / delayed / delivered / relayed / expanded. */
  action: string;
  /** DSN `Status` code, e.g. `5.1.1`. */
  statusCode: string | null;
  classification: BounceClassification;
  /** The SMTP `Diagnostic-Code` text, if present. */
  diagnostic: string | null;
}

export interface ParsedDsn {
  /** Message-ID of the ORIGINAL (bounced) message, for send-job correlation. */
  originalMessageId: string | null;
  recipients: DsnRecipient[];
}

function classify(statusCode: string | null): BounceClassification {
  if (!statusCode) return 'unknown';
  if (statusCode.startsWith('5')) return 'hard';
  if (statusCode.startsWith('4')) return 'soft';
  return 'unknown';
}

/** `Final-Recipient: rfc822; user@host` → `user@host`. */
function addressOf(field: string): string {
  const afterType = field.includes(';') ? field.slice(field.indexOf(';') + 1) : field;
  return afterType.trim().replace(/^<|>$/g, '');
}

function stripAngle(value: string): string {
  return value.trim().replace(/^<|>$/g, '');
}

/**
 * Parse a delivery-status notification (RFC 3464 `multipart/report`) from a raw
 * bounce email. Extracts each failed recipient's status/diagnostic plus the
 * original Message-ID (for correlation to a send job). Returns null when the
 * message has no recognizable delivery-status content.
 *
 * Deliberately line-oriented (no full MIME parse): DSN fields are greppable and
 * this keeps the parser dependency-free and robust to boundary quirks.
 */
export function parseDsn(raw: string): ParsedDsn | null {
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  const recipients: DsnRecipient[] = [];
  let current: {
    recipient: string;
    action: string;
    statusCode: string | null;
    diagnostic: string | null;
  } | null = null;
  let collectingDiagnostic = false;

  const flush = () => {
    if (current && current.recipient) {
      recipients.push({
        recipient: current.recipient.toLowerCase(),
        action: current.action || 'failed',
        statusCode: current.statusCode,
        classification: classify(current.statusCode),
        diagnostic: current.diagnostic ? current.diagnostic.trim() : null,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const m = line.match(/^([A-Za-z-]+):\s?(.*)$/);
    if (m) {
      const field = m[1]!.toLowerCase();
      const value = m[2]!;
      collectingDiagnostic = false;
      if (field === 'final-recipient' || field === 'original-recipient') {
        // A new recipient block begins (prefer Final-Recipient if both appear).
        if (field === 'final-recipient') {
          flush();
          current = { recipient: addressOf(value), action: '', statusCode: null, diagnostic: null };
        } else if (!current) {
          current = { recipient: addressOf(value), action: '', statusCode: null, diagnostic: null };
        }
      } else if (current && field === 'action') {
        current.action = value.trim().toLowerCase();
      } else if (current && field === 'status') {
        const code = value.trim().match(/\d+\.\d+\.\d+/);
        current.statusCode = code ? code[0] : value.trim() || null;
      } else if (current && field === 'diagnostic-code') {
        const after = value.includes(';') ? value.slice(value.indexOf(';') + 1) : value;
        current.diagnostic = after.trim();
        collectingDiagnostic = true;
      }
    } else if (collectingDiagnostic && /^\s+\S/.test(line) && current) {
      // Folded continuation of the Diagnostic-Code.
      current.diagnostic = `${current.diagnostic ?? ''} ${line.trim()}`.trim();
    } else if (line.trim() === '') {
      collectingDiagnostic = false;
    }
  }
  flush();

  if (recipients.length === 0) return null;

  const explicit = text.match(/^Original-Message-ID:\s*(.+)$/im);
  const allIds = [...text.matchAll(/^Message-ID:\s*(.+)$/gim)];
  const originalMessageId = explicit
    ? stripAngle(explicit[1]!)
    : allIds.length > 0
      ? stripAngle(allIds[allIds.length - 1]![1]!)
      : null;

  return { originalMessageId, recipients };
}
