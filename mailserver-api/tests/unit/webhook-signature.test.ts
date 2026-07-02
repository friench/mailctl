import { describe, it, expect } from 'vitest';
import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_SECRET_PREFIX,
} from '../../src/lib/webhook-signature';

describe('generateWebhookSecret', () => {
  it('starts with whsec_ prefix and is 64 hex chars after', () => {
    const s = generateWebhookSecret();
    expect(s.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    const hex = s.slice(WEBHOOK_SECRET_PREFIX.length);
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('produces unique secrets', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe('signWebhookPayload', () => {
  it('returns deterministic 64-char hex digest', () => {
    const sig1 = signWebhookPayload('secret', 1700000000, '{"event":"x"}');
    const sig2 = signWebhookPayload('secret', 1700000000, '{"event":"x"}');
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
    expect(sig1).toMatch(/^[0-9a-f]+$/);
  });

  it('changes when timestamp changes', () => {
    const a = signWebhookPayload('secret', 1700000000, '{}');
    const b = signWebhookPayload('secret', 1700000001, '{}');
    expect(a).not.toBe(b);
  });

  it('changes when body changes', () => {
    const a = signWebhookPayload('secret', 1700000000, '{}');
    const b = signWebhookPayload('secret', 1700000000, '{"a":1}');
    expect(a).not.toBe(b);
  });

  it('changes when secret changes', () => {
    const a = signWebhookPayload('secret-a', 1700000000, '{}');
    const b = signWebhookPayload('secret-b', 1700000000, '{}');
    expect(a).not.toBe(b);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a matching signature', () => {
    const sig = signWebhookPayload('secret', 1, '{}');
    expect(verifyWebhookSignature(sig, sig)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const sig = signWebhookPayload('secret', 1, '{}');
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyWebhookSignature(sig, tampered)).toBe(false);
  });

  it('rejects different lengths', () => {
    expect(verifyWebhookSignature('a'.repeat(64), 'a'.repeat(62))).toBe(false);
  });
});
