import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// API key format: 64 hex chars (32 random bytes).
// First 8 chars = `prefix`, used as DB lookup index.
// Stored: sha256(plain) hex + prefix (plain). Plain key is shown to the
// user once on creation and never persisted.
export const API_KEY_PREFIX_HEX_LENGTH = 8;
export const API_KEY_TOTAL_HEX_LENGTH = 64;
const API_KEY_BYTES = API_KEY_TOTAL_HEX_LENGTH / 2;
const HEX_RE = /^[0-9a-f]+$/;

export interface GeneratedApiKey {
  /** Plain key shown to user once. Format: 64 hex chars. */
  plain: string;
  /** First 8 hex chars; non-secret, used as DB lookup index. */
  prefix: string;
  /** sha256(plain) as hex; what gets stored. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plain = randomBytes(API_KEY_BYTES).toString('hex');
  return {
    plain,
    prefix: plain.slice(0, API_KEY_PREFIX_HEX_LENGTH),
    hash: hashApiKey(plain),
  };
}

export function hashApiKey(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function parseApiKey(input: unknown): { prefix: string } | null {
  if (typeof input !== 'string') return null;
  if (input.length !== API_KEY_TOTAL_HEX_LENGTH) return null;
  if (!HEX_RE.test(input)) return null;
  return { prefix: input.slice(0, API_KEY_PREFIX_HEX_LENGTH) };
}

export function verifyApiKey(plain: string, expectedHashHex: string): boolean {
  const computed = Buffer.from(hashApiKey(plain), 'hex');
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}
