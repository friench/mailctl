import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('POST /admin/api/domains/:id/dkim', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('generates a DKIM key and stores selector + public key on the domain', async () => {
    const domain = h.domainRepo.create({ name: 'example.com' });

    const res = await request(app)
      .post(`/admin/api/domains/${domain.id}/dkim`)
      .set('X-Api-Key', adminKey)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.dkimSelector).toBe('mail');
    expect(res.body.dkimPublicKey).toMatch(/MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A/);

    const generateCalls = h.dms.calls.filter((c) => c.method === 'generateDkim');
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]!.args).toEqual(['example.com', 'mail', 2048]);
  });

  it('honors a custom selector and 4096 keysize from the body', async () => {
    const domain = h.domainRepo.create({ name: 'example.com' });

    const res = await request(app)
      .post(`/admin/api/domains/${domain.id}/dkim`)
      .set('X-Api-Key', adminKey)
      .send({ selector: 'dms2024', keysize: 4096 });

    expect(res.status).toBe(200);
    expect(res.body.dkimSelector).toBe('dms2024');

    const call = h.dms.calls.find((c) => c.method === 'generateDkim')!;
    expect(call.args).toEqual(['example.com', 'dms2024', 4096]);
  });

  it('reuses the domain’s existing selector when none is provided', async () => {
    const domain = h.domainRepo.create({ name: 'example.com', dkimSelector: 'legacy' });

    const res = await request(app)
      .post(`/admin/api/domains/${domain.id}/dkim`)
      .set('X-Api-Key', adminKey)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.dkimSelector).toBe('legacy');
  });

  it('rejects an invalid selector', async () => {
    const domain = h.domainRepo.create({ name: 'example.com' });
    const res = await request(app)
      .post(`/admin/api/domains/${domain.id}/dkim`)
      .set('X-Api-Key', adminKey)
      .send({ selector: 'not a selector' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown domain', async () => {
    const res = await request(app)
      .post('/admin/api/domains/00000000-0000-0000-0000-000000000000/dkim')
      .set('X-Api-Key', adminKey)
      .send({});
    expect(res.status).toBe(404);
  });

  it('does NOT auto-generate DKIM on domain create when flag is off (default)', async () => {
    expect(h.featureFlagService.isEnabled('auto_dkim_enabled')).toBe(false);
    await request(app)
      .post('/admin/api/domains')
      .set('X-Api-Key', adminKey)
      .send({ name: 'example.com' });

    // Give the fire-and-forget hook a tick (it shouldn't run, but be safe).
    await new Promise((r) => setTimeout(r, 10));
    expect(h.dms.calls.find((c) => c.method === 'generateDkim')).toBeUndefined();
  });

  it('auto-generates DKIM on domain create when flag is on', async () => {
    h.featureFlagService.setEnabled('auto_dkim_enabled', true);

    const create = await request(app)
      .post('/admin/api/domains')
      .set('X-Api-Key', adminKey)
      .send({ name: 'example.com' });
    expect(create.status).toBe(201);

    // Wait for the fire-and-forget regenerate to settle.
    for (let i = 0; i < 20; i++) {
      if (h.dms.calls.some((c) => c.method === 'generateDkim')) break;
      await new Promise((r) => setTimeout(r, 5));
    }

    const generated = h.dms.calls.find((c) => c.method === 'generateDkim');
    expect(generated).toBeDefined();
    expect(generated!.args).toEqual(['example.com', 'mail', 2048]);
  });
});
