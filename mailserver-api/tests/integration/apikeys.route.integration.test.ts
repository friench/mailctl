import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/api-keys', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('requires admin auth', async () => {
    const res = await request(app).get('/admin/api/api-keys');
    expect(res.status).toBe(401);
  });

  it('creates a key and returns the plaintext once', async () => {
    const res = await request(app)
      .post('/admin/api/api-keys')
      .set('X-Api-Key', adminKey)
      .send({ name: 'first-test', scopes: ['send'] });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('first-test');
    expect(res.body.scopes).toEqual(['send']);
    expect(res.body.plain).toHaveLength(64);
    expect(res.body.prefix).toHaveLength(8);

    // The freshly minted key actually works.
    const verify = h.apiKeyService.verify(res.body.plain);
    expect(verify.ok).toBe(true);
  });

  it('stores expiresAt from an ISO string', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await request(app)
      .post('/admin/api/api-keys')
      .set('X-Api-Key', adminKey)
      .send({ name: 'expiring', expiresAt });

    expect(res.status).toBe(201);
    const stored = h.apiKeyRepo.findById(res.body.id);
    // Stored as a unix-second timestamp, so compare at second granularity.
    expect(Math.floor((stored?.expiresAt?.getTime() ?? 0) / 1000)).toBe(
      Math.floor(Date.parse(expiresAt) / 1000),
    );
  });

  it('rejects a body without a name', async () => {
    const res = await request(app)
      .post('/admin/api/api-keys')
      .set('X-Api-Key', adminKey)
      .send({ scopes: ['send'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation error/);
  });

  it('lists created keys (without secrets)', async () => {
    await request(app)
      .post('/admin/api/api-keys')
      .set('X-Api-Key', adminKey)
      .send({ name: 'listed', scopes: ['send'] });

    const res = await request(app).get('/admin/api/api-keys').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    const names = res.body.map((k: { name: string }) => k.name);
    expect(names).toContain('listed');
    // No serialized field leaks the hash or plaintext.
    expect(res.body[0]).not.toHaveProperty('hash');
    expect(res.body[0]).not.toHaveProperty('plain');
  });

  it('revokes a key via DELETE (verify then fails as revoked)', async () => {
    const created = await request(app)
      .post('/admin/api/api-keys')
      .set('X-Api-Key', adminKey)
      .send({ name: 'to-revoke', scopes: ['send'] });

    const del = await request(app)
      .delete(`/admin/api/api-keys/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(del.status).toBe(204);

    const verify = h.apiKeyService.verify(created.body.plain);
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.reason).toBe('revoked');

    const stored = h.apiKeyRepo.findById(created.body.id);
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });
});
