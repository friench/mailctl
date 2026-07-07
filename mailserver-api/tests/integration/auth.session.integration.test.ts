import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('POST /admin/auth/login', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    await h.userService.create('admin@example.com', 'secret123');
  });

  afterEach(() => h.close());

  it('returns 200 + sets session cookie on valid creds', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@example.com');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('mail-api-session=');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong456' });
    expect(res.status).toBe(401);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'nope@example.com', password: 'secret123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid email format', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'not-email', password: 'secret123' });
    expect(res.status).toBe(400);
  });

  it('rate-limits brute-force attempts (429 after 5 per minute)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/admin/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-' + i });
      expect([401, 429]).toContain(r.status);
    }
    const blocked = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'still-wrong' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many login attempts/);
  });

  it('rejects a cookie-authenticated admin mutation from a foreign Origin (CSRF guard)', async () => {
    const login = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'secret123' });
    const cookie = String(login.headers['set-cookie']);

    const blocked = await request(app)
      .post('/admin/api/domains')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send({ name: 'evil.test' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/Cross-origin/);
  });
});

describe('GET /admin/auth/me', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    await h.userService.create('me@example.com', 'secret123');
  });

  afterEach(() => h.close());

  it('returns 401 without session', async () => {
    const res = await request(app).get('/admin/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user info after login', async () => {
    const agent = request.agent(app);
    await agent.post('/admin/auth/login').send({ email: 'me@example.com', password: 'secret123' });

    const res = await agent.get('/admin/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
  });
});

describe('POST /admin/auth/logout', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    await h.userService.create('logout@example.com', 'secret123');
  });

  afterEach(() => h.close());

  it('clears the session', async () => {
    const agent = request.agent(app);
    await agent
      .post('/admin/auth/login')
      .send({ email: 'logout@example.com', password: 'secret123' });

    expect((await agent.get('/admin/auth/me')).status).toBe(200);

    const logout = await agent.post('/admin/auth/logout');
    expect(logout.status).toBe(204);

    expect((await agent.get('/admin/auth/me')).status).toBe(401);
  });
});

describe('Session grants admin access to /admin/api/*', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    await h.userService.create('admin@example.com', 'secret123');
  });

  afterEach(() => h.close());

  it('logged-in user can access /admin/api/domains without an api-key', async () => {
    const agent = request.agent(app);
    await agent
      .post('/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'secret123' });

    const list = await agent.get('/admin/api/domains');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);

    const create = await agent.post('/admin/api/domains').send({ name: 'session-test.com' });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe('session-test.com');
  });

  it('without login, /admin/api/* still requires API key', async () => {
    const res = await request(app).get('/admin/api/domains');
    expect(res.status).toBe(401);
  });
});
