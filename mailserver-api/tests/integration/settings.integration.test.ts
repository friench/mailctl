import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, TEST_ENV } from '../helpers/server';

describe('GET /admin/api/settings', () => {
  let h: TestDbHandle;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('returns webmailUrl null when unset', async () => {
    const app: Express = createTestApp(h).app;
    const res = await request(app).get('/admin/api/settings').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.webmailUrl).toBeNull();
  });

  it('returns the configured webmailUrl', async () => {
    const app: Express = createTestApp(h, {
      ...TEST_ENV,
      WEBMAIL_URL: 'https://webmail.example.com',
    }).app;
    const res = await request(app).get('/admin/api/settings').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.webmailUrl).toBe('https://webmail.example.com');
  });

  it('requires admin auth', async () => {
    const app: Express = createTestApp(h).app;
    const res = await request(app).get('/admin/api/settings');
    expect(res.status).toBe(401);
  });
});
