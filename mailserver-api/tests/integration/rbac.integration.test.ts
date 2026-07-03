import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

async function loginAgent(app: Express, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('RBAC enforcement', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
  });

  afterEach(() => h.close());

  it('read_only can read but not mutate', async () => {
    await h.userService.create('ro@example.com', 'password123', 'read_only');
    const agent = await loginAgent(app, 'ro@example.com', 'password123');

    expect((await agent.get('/admin/api/domains')).status).toBe(200);
    const post = await agent.post('/admin/api/domains').send({ name: 'example.com' });
    expect(post.status).toBe(403);
    expect(post.body.error).toMatch(/read-only/i);
  });

  it('admin can mutate', async () => {
    await h.userService.create('adm@example.com', 'password123', 'admin');
    const agent = await loginAgent(app, 'adm@example.com', 'password123');

    const post = await agent.post('/admin/api/domains').send({ name: 'example.com' });
    expect(post.status).toBe(201);
  });

  it('domain-scoped roles are denied the admin API (until per-domain scoping lands)', async () => {
    await h.userService.create('da@example.com', 'password123', 'domain_admin');
    const agent = await loginAgent(app, 'da@example.com', 'password123');
    expect((await agent.get('/admin/api/domains')).status).toBe(403);
  });

  it('admin-scoped API keys retain full access', async () => {
    const adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    const res = await request(app)
      .post('/admin/api/domains')
      .set('X-Api-Key', adminKey)
      .send({ name: 'example.com' });
    expect(res.status).toBe(201);
  });

  it('creates and updates a user role, exposing it in the DTO', async () => {
    const adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    const created = await request(app)
      .post('/admin/api/users')
      .set('X-Api-Key', adminKey)
      .send({ email: 'new@example.com', password: 'password123', role: 'read_only' });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('read_only');

    const updated = await request(app)
      .patch(`/admin/api/users/${created.body.id}`)
      .set('X-Api-Key', adminKey)
      .send({ role: 'domain_admin' });
    expect(updated.status).toBe(200);
    expect(updated.body.role).toBe('domain_admin');

    const me = await request(app).get('/admin/api/users').set('X-Api-Key', adminKey);
    expect(me.body.find((u: { email: string }) => u.email === 'new@example.com').role).toBe(
      'domain_admin',
    );
  });
});
