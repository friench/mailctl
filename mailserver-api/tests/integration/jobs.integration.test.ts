import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount } from '../helpers/server';

describe('GET /jobs/:id', () => {
  let h: TestDbHandle;
  let app: Express;
  let ownerKey: string;
  let ownerKeyId: string;
  let otherKey: string;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    seedSmtpAccount(h);
    app = createTestApp(h).app;

    const owner = h.apiKeyService.generateAndStore('owner', { scopes: ['send'] });
    ownerKey = owner.plain;
    ownerKeyId = owner.id;

    otherKey = h.apiKeyService.generateAndStore('other', { scopes: ['send'] }).plain;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('returns 401 without key', async () => {
    const job = h.sendJobRepo.create({
      payload: { to: 'a@b.co', subject: 's', html: 'h' },
      apiKeyId: ownerKeyId,
    });
    const res = await request(app).get(`/jobs/${job.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('X-Api-Key', ownerKey);
    expect(res.status).toBe(404);
  });

  it('owner can fetch their own job', async () => {
    const job = h.sendJobRepo.create({
      payload: { to: 'a@b.co', subject: 's', html: 'h' },
      apiKeyId: ownerKeyId,
    });
    const res = await request(app).get(`/jobs/${job.id}`).set('X-Api-Key', ownerKey);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(job.id);
    expect(res.body.payload.to).toBe('a@b.co');
  });

  it('non-owner gets 404 (existence hidden)', async () => {
    const job = h.sendJobRepo.create({
      payload: { to: 'a@b.co', subject: 's', html: 'h' },
      apiKeyId: ownerKeyId,
    });
    const res = await request(app).get(`/jobs/${job.id}`).set('X-Api-Key', otherKey);
    expect(res.status).toBe(404);
  });

  it('admin can see any job', async () => {
    const job = h.sendJobRepo.create({
      payload: { to: 'a@b.co', subject: 's', html: 'h' },
      apiKeyId: ownerKeyId,
    });
    const res = await request(app).get(`/jobs/${job.id}`).set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(job.id);
  });
});
