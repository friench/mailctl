import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/feature-flags', () => {
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
    const res = await request(app).get('/admin/api/feature-flags');
    expect(res.status).toBe(401);
  });

  it('lists known flags with defaults', async () => {
    const res = await request(app).get('/admin/api/feature-flags').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const webhooks = res.body.find((f: { key: string }) => f.key === 'webhooks_enabled');
    expect(webhooks).toEqual(
      expect.objectContaining({
        key: 'webhooks_enabled',
        enabled: true,
        default: true,
        override: false,
      }),
    );
  });

  it('toggles a flag and reflects in subsequent reads', async () => {
    const patch = await request(app)
      .patch('/admin/api/feature-flags/webhooks_enabled')
      .set('X-Api-Key', adminKey)
      .send({ enabled: false });

    expect(patch.status).toBe(200);
    expect(patch.body.enabled).toBe(false);
    expect(patch.body.override).toBe(true);
    expect(patch.body.updatedAt).toBeDefined();

    const list = await request(app).get('/admin/api/feature-flags').set('X-Api-Key', adminKey);
    const webhooks = list.body.find((f: { key: string }) => f.key === 'webhooks_enabled');
    expect(webhooks.enabled).toBe(false);
    expect(webhooks.override).toBe(true);
  });

  it('rejects unknown keys', async () => {
    const res = await request(app)
      .patch('/admin/api/feature-flags/totally_made_up')
      .set('X-Api-Key', adminKey)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it('rejects missing enabled field', async () => {
    const res = await request(app)
      .patch('/admin/api/feature-flags/webhooks_enabled')
      .set('X-Api-Key', adminKey)
      .send({});
    expect(res.status).toBe(400);
  });

  it('reset removes the override', async () => {
    await request(app)
      .patch('/admin/api/feature-flags/webhooks_enabled')
      .set('X-Api-Key', adminKey)
      .send({ enabled: false });

    const reset = await request(app)
      .delete('/admin/api/feature-flags/webhooks_enabled')
      .set('X-Api-Key', adminKey);

    expect(reset.status).toBe(200);
    expect(reset.body.enabled).toBe(true); // back to default
    expect(reset.body.override).toBe(false);
  });
});

describe('webhooks_enabled flag gates dispatch', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('does not create deliveries when flag is off', async () => {
    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.completed'] });

    h.featureFlagService.setEnabled('webhooks_enabled', false);
    h.webhookService.dispatch('send.completed', { jobId: 'fake' });

    const deliveries = h.webhookDeliveryRepo.listByWebhook(created.body.id);
    expect(deliveries).toEqual([]);
  });

  it('resumes dispatching when flag is turned back on', async () => {
    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.completed'] });

    h.featureFlagService.setEnabled('webhooks_enabled', false);
    h.webhookService.dispatch('send.completed', { jobId: '1' });
    expect(h.webhookDeliveryRepo.listByWebhook(created.body.id)).toEqual([]);

    h.featureFlagService.setEnabled('webhooks_enabled', true);
    h.webhookService.dispatch('send.completed', { jobId: '2' });
    expect(h.webhookDeliveryRepo.listByWebhook(created.body.id)).toHaveLength(1);
  });
});
