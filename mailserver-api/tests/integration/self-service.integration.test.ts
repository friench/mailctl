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

describe('self-service (/admin/api/me)', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    h.domainRepo.create({ name: 'example.org', active: true });
    await h.mailboxService.create({ address: 'user@example.org', password: 'InitPass123' });
    await h.userService.create('user@example.org', 'LoginPass123', 'domain_user');
  });

  afterEach(() => h.close());

  it('shows the caller their own mailbox', async () => {
    const agent = await loginAgent(app, 'user@example.org', 'LoginPass123');
    const res = await agent.get('/admin/api/me');
    expect(res.status).toBe(200);
    expect(res.body.mailbox.address).toBe('user@example.org');
  });

  it('changes both the sign-in and mailbox password', async () => {
    const agent = await loginAgent(app, 'user@example.org', 'LoginPass123');
    const res = await agent.patch('/admin/api/me/password').send({ password: 'NewSecret987' });
    expect(res.status).toBe(204);

    // Mailbox (email) password updated in DMS.
    expect(h.dms.emails.get('user@example.org')).toBe('NewSecret987');
    // Sign-in works with the new password.
    await loginAgent(app, 'user@example.org', 'NewSecret987');
  });

  it('denies a domain_user the global admin resources', async () => {
    const agent = await loginAgent(app, 'user@example.org', 'LoginPass123');
    expect((await agent.get('/admin/api/users')).status).toBe(403);
  });

  it('returns a null mailbox when the account has no matching mailbox', async () => {
    await h.userService.create('orphan@example.org', 'LoginPass123', 'domain_user');
    const agent = await loginAgent(app, 'orphan@example.org', 'LoginPass123');
    const res = await agent.get('/admin/api/me');
    expect(res.status).toBe(200);
    expect(res.body.mailbox).toBeNull();
  });
});
