import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount } from '../helpers/server';

describe('POST /send authentication', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb();
    seedSmtpAccount(h);
    app = createTestApp(h).app;
  });

  afterEach(() => h.close());

  it('returns 401 without X-Api-Key header', async () => {
    const res = await request(app).post('/send').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 with malformed key', async () => {
    const res = await request(app).post('/send').set('X-Api-Key', 'too-short').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 with unknown valid-format key', async () => {
    const res = await request(app).post('/send').set('X-Api-Key', 'a'.repeat(64)).send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 with revoked key', async () => {
    const created = h.apiKeyService.generateAndStore('To revoke');
    h.apiKeyService.revoke(created.id);
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', created.plain)
      .send({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired key', async () => {
    const created = h.apiKeyService.generateAndStore('Expired', {
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', created.plain)
      .send({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(res.status).toBe(401);
  });

  it('passes auth with valid key (then 400 on invalid body)', async () => {
    const created = h.apiKeyService.generateAndStore('Valid', { scopes: ['send'] });
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', created.plain)
      .send({ to: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('updates last_used_at after successful auth', async () => {
    const created = h.apiKeyService.generateAndStore('Tracked');
    expect(h.apiKeyRepo.findById(created.id)?.lastUsedAt).toBeNull();

    await request(app).post('/send').set('X-Api-Key', created.plain).send({ to: 'not-an-email' });

    expect(h.apiKeyRepo.findById(created.id)?.lastUsedAt).toBeInstanceOf(Date);
  });
});
