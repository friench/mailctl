import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, TEST_ENV } from '../helpers/server';

describe('GET /metrics', () => {
  let h: TestDbHandle;

  beforeEach(() => {
    h = createTestDb();
  });

  afterEach(() => h.close());

  it('returns 200 with prometheus text when open', async () => {
    const app: Express = createTestApp(h).app;
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('mailapi_');
  });

  it('returns 401 when a token is required but missing', async () => {
    const app: Express = createTestApp(h, { ...TEST_ENV, METRICS_TOKEN: 'secret' }).app;
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is wrong', async () => {
    const app: Express = createTestApp(h, { ...TEST_ENV, METRICS_TOKEN: 'secret' }).app;

    const bearer = await request(app).get('/metrics').set('Authorization', 'Bearer wrong');
    expect(bearer.status).toBe(401);

    const query = await request(app).get('/metrics?token=wrong');
    expect(query.status).toBe(401);
  });

  it('accepts a valid bearer token and query token', async () => {
    const app: Express = createTestApp(h, { ...TEST_ENV, METRICS_TOKEN: 'secret' }).app;

    const bearer = await request(app).get('/metrics').set('Authorization', 'Bearer secret');
    expect(bearer.status).toBe(200);

    const query = await request(app).get('/metrics?token=secret');
    expect(query.status).toBe(200);
  });
});
