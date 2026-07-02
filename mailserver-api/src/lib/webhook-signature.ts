import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SECRET_PREFIX = 'whsec_';

export function generateWebhookSecret(): string {
  return WEBHOOK_SECRET_PREFIX + randomBytes(32).toString('hex');
}

/**
 * Sign `${timestamp}.${body}` with HMAC-SHA256, returning hex digest.
 * Consumer verifies the same way; timestamp prevents replay.
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function verifyWebhookSignature(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
