import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('GET /openapi.json', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
  });
  afterEach(() => h.close());

  it('serves the spec without authentication', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths).toHaveProperty('/send');
    expect(res.body.paths['/send'].post.security).toEqual([{ ApiKeyAuth: [] }]);
  });
});
