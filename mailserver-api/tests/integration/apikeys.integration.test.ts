import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDbHandle } from '../helpers/db';

describe('ApiKeyService.generateAndStore', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });

  afterEach(() => {
    h.close();
  });

  it('persists a key and returns plaintext once', () => {
    const created = h.apiKeyService.generateAndStore('Test Key');

    expect(created.name).toBe('Test Key');
    expect(created.plain).toHaveLength(64);
    expect(created.prefix).toHaveLength(8);
    expect(created.scopes).toEqual([]);
    expect(created.expiresAt).toBeNull();

    const stored = h.apiKeyRepo.findByPrefix(created.prefix);
    expect(stored).toBeDefined();
    expect(stored?.name).toBe('Test Key');
    // Stored hash is NOT plaintext
    expect(stored?.hash).not.toBe(created.plain);
    expect(stored?.hash).toHaveLength(64);
  });

  it('stores scopes and expiresAt', () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const created = h.apiKeyService.generateAndStore('Scoped', {
      scopes: ['send', 'admin'],
      expiresAt,
    });

    expect(created.scopes).toEqual(['send', 'admin']);
    expect(created.expiresAt?.toISOString()).toBe(expiresAt.toISOString());

    const stored = h.apiKeyRepo.findByPrefix(created.prefix);
    expect(stored?.scopes).toEqual(['send', 'admin']);
    expect(stored?.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });
});

describe('ApiKeyService.verify', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });

  afterEach(() => {
    h.close();
  });

  it('accepts a valid key', () => {
    const created = h.apiKeyService.generateAndStore('Valid');
    const result = h.apiKeyService.verify(created.plain);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.apiKey.id).toBe(created.id);
    }
  });

  it('rejects malformed input', () => {
    expect(h.apiKeyService.verify('').ok).toBe(false);
    expect(h.apiKeyService.verify(undefined).ok).toBe(false);
    expect(h.apiKeyService.verify('not-hex').ok).toBe(false);
    const r = h.apiKeyService.verify('xxxxxxxx');
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('rejects unknown prefix', () => {
    const fake = 'a'.repeat(64);
    const r = h.apiKeyService.verify(fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
  });

  it('rejects mismatched secret with same prefix', () => {
    const created = h.apiKeyService.generateAndStore('Real');
    // Build a key with the same prefix but different secret bytes.
    const tampered = created.prefix + 'f'.repeat(56);
    if (tampered === created.plain) return; // astronomically unlikely
    const r = h.apiKeyService.verify(tampered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('mismatch');
  });

  it('rejects revoked keys', () => {
    const created = h.apiKeyService.generateAndStore('To revoke');
    h.apiKeyService.revoke(created.id);
    const r = h.apiKeyService.verify(created.plain);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('revoked');
  });

  it('rejects expired keys', () => {
    const expiresAt = new Date('2020-01-01T00:00:00Z');
    const created = h.apiKeyService.generateAndStore('Expired', { expiresAt });
    const r = h.apiKeyService.verify(created.plain);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('accepts a key not yet expired', () => {
    const expiresAt = new Date(Date.now() + 86_400_000);
    const created = h.apiKeyService.generateAndStore('Future', { expiresAt });
    const r = h.apiKeyService.verify(created.plain);
    expect(r.ok).toBe(true);
  });
});

describe('ApiKeyService.touchLastUsed', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });

  afterEach(() => {
    h.close();
  });

  it('updates last_used_at', () => {
    const created = h.apiKeyService.generateAndStore('Tracked');
    expect(h.apiKeyRepo.findById(created.id)?.lastUsedAt).toBeNull();

    h.apiKeyService.touchLastUsed(created.id);

    const after = h.apiKeyRepo.findById(created.id);
    expect(after?.lastUsedAt).toBeInstanceOf(Date);
  });
});
