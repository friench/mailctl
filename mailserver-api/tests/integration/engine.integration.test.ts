import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/engine', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let nonAdminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    nonAdminKey = h.apiKeyService.generateAndStore('send', { scopes: ['send'] }).plain;
  });

  afterEach(() => h.close());

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).get('/admin/api/engine/overview').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  it('aggregates rspamd/dovecot/features/containers into the overview', async () => {
    h.engineClient.stat = { scanned: 100, spam: 10, ham: 90, learned: 5, actions: { reject: 10 } };
    h.engineClient.settings = [
      { key: 'ENABLE_RSPAMD', value: '1', enabled: true },
      { key: 'ENABLE_CLAMAV', value: '0', enabled: false },
    ];
    h.engineClient.containers.set('mailserver', {
      name: 'mailserver',
      state: 'running',
      health: 'healthy',
      image: 'mailserver:15',
      startedAt: '2026-07-01T00:00:00Z',
    });

    const res = await request(app).get('/admin/api/engine/overview').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.rspamd.enabled).toBe(true);
    expect(res.body.rspamd.stat.scanned).toBe(100);
    expect(res.body.features).toHaveLength(2);
    const ms = res.body.containers.find((c: { name: string }) => c.name === 'mailserver');
    expect(ms.state).toBe('running');
    expect(ms.health).toBe('healthy');
  });

  it('reports rspamd disabled when the toggle is off and no stats', async () => {
    h.engineClient.stat = null;
    h.engineClient.settings = [{ key: 'ENABLE_RSPAMD', value: '0', enabled: false }];
    const res = await request(app).get('/admin/api/engine/overview').set('X-Api-Key', adminKey);
    expect(res.body.rspamd.enabled).toBe(false);
    expect(res.body.rspamd.stat).toBeNull();
  });

  it('restarts an allow-listed container', async () => {
    const res = await request(app)
      .post('/admin/api/engine/containers/mailserver/restart')
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(202);
    expect(h.engineClient.restarts).toEqual(['mailserver']);
  });

  it('404s restarting a container outside the allow-list', async () => {
    const res = await request(app)
      .post('/admin/api/engine/containers/postgres/restart')
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(404);
    expect(h.engineClient.restarts).toEqual([]);
  });
});
