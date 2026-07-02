import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount } from '../helpers/server';

describe('GET /health', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb();
    seedSmtpAccount(h, { name: 'a', priority: 1, fromAddress: 'a@example.com' });
    seedSmtpAccount(h, { name: 'b', priority: 2, fromAddress: 'b@example.com' });
    app = createTestApp(h).app;
  });

  afterEach(() => h.close());

  it('returns 200 with status and account count', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.accounts).toBe(2);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it('echoes X-Request-Id header', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'test-req-id-123');
    expect(res.headers['x-request-id']).toBe('test-req-id-123');
  });

  it('generates X-Request-Id when not provided', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets an enforcing Content-Security-Policy header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('GET /health with no accounts', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });

  afterEach(() => h.close());

  it('returns 200 with accounts: 0', async () => {
    const { app } = createTestApp(h);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toBe(0);
  });
});
