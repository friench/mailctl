import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/stats', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('rejects without admin auth', async () => {
    const res = await request(app).get('/admin/api/stats');
    expect(res.status).toBe(401);
  });

  it('returns the aggregate snapshot shape with seeded counts', async () => {
    // Seed domains + mailboxes.
    const domain = h.domainRepo.create({ name: 'example.com' });
    h.mailboxRepo.create({ address: 'a@example.com', domainId: domain.id });
    h.aliasRepo.create({
      address: 'alias@example.com',
      target: 'a@example.com',
      domainId: domain.id,
    });

    // Seed send jobs: one pending, one done, one dead.
    const payload = { to: 'x@example.com', subject: 's', html: '<p>h</p>' };
    h.sendJobRepo.create({ payload });
    const doneJob = h.sendJobRepo.create({ payload });
    h.sendJobRepo.markDone(doneJob.id, { account: 'acc', messageId: 'm1' });
    const deadJob = h.sendJobRepo.create({ payload });
    h.sendJobRepo.markDead(deadJob.id, 'boom');

    const res = await request(app).get('/admin/api/stats').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        jobs: expect.objectContaining({
          pending: 1,
          processing: 0,
          done: 1,
          dead: 1,
          last24hDone: 1,
          last24hFailed: 1,
        }),
        webhooks: expect.objectContaining({ pending: 0, done: 0, dead: 0 }),
        counts: expect.objectContaining({
          domains: 1,
          mailboxes: 1,
          aliases: 1,
          smtpAccounts: 0,
          apiKeys: 1,
        }),
      }),
    );
    expect(typeof res.body.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.generatedAt))).toBe(false);
  });
});
