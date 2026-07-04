import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

const EMPTY = {
  vacation: { enabled: false, subject: '', message: '', days: 7 },
  rules: [],
};

async function loginAgent(app: Express, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('sieve filters (admin + self-service)', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let mailboxId: string;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    h.domainRepo.create({ name: 'example.org', active: true });
    const mb = await h.mailboxService.create({
      address: 'user@example.org',
      password: 'InitPass123',
    });
    mailboxId = mb.id;
  });

  afterEach(() => h.close());

  describe('admin API', () => {
    it('returns the default config for a mailbox with no sieve row', async () => {
      const res = await request(app)
        .get(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(EMPTY);
    });

    it('404s for an unknown mailbox', async () => {
      const res = await request(app)
        .get('/admin/api/mailboxes/nope/sieve')
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(404);
    });

    it('persists config and writes the compiled script to DMS', async () => {
      const config = {
        vacation: { enabled: true, subject: 'Away', message: 'Back soon', days: 5 },
        rules: [{ field: 'from', contains: 'boss@corp.com', action: 'fileinto', arg: 'Work' }],
      };
      const put = await request(app)
        .put(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey)
        .send(config);
      expect(put.status).toBe(200);
      expect(put.body.vacation.subject).toBe('Away');

      // Reflected into DMS as a compiled script.
      const script = h.dms.sieve.get('user@example.org');
      expect(script).toContain('fileinto "Work";');
      expect(script).toContain('vacation :days 5 :subject "Away" "Back soon";');

      // Read back returns the persisted config.
      const get = await request(app)
        .get(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey);
      expect(get.body.rules).toHaveLength(1);
      expect(get.body.vacation.enabled).toBe(true);
    });

    it('clears the DMS script when config becomes empty again', async () => {
      await request(app)
        .put(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey)
        .send({
          vacation: { enabled: false, subject: '', message: '', days: 7 },
          rules: [{ field: 'subject', contains: 'x', action: 'discard' }],
        });
      expect(h.dms.sieve.has('user@example.org')).toBe(true);

      await request(app)
        .put(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey)
        .send(EMPTY);
      expect(h.dms.sieve.has('user@example.org')).toBe(false);
    });

    it('rejects an invalid rule action', async () => {
      const res = await request(app)
        .put(`/admin/api/mailboxes/${mailboxId}/sieve`)
        .set('X-Api-Key', adminKey)
        .send({
          vacation: EMPTY.vacation,
          rules: [{ field: 'from', contains: 'a', action: 'nuke' }],
        });
      expect(res.status).toBe(400);
    });
  });

  describe('self-service', () => {
    beforeEach(async () => {
      await h.userService.create('user@example.org', 'LoginPass123', 'domain_user');
    });

    it('lets a user read and update their own sieve config', async () => {
      const agent = await loginAgent(app, 'user@example.org', 'LoginPass123');

      const initial = await agent.get('/admin/api/me/sieve');
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual(EMPTY);

      const put = await agent.put('/admin/api/me/sieve').send({
        vacation: { enabled: true, subject: 'OOO', message: 'gone', days: 2 },
        rules: [],
      });
      expect(put.status).toBe(200);
      expect(h.dms.sieve.get('user@example.org')).toContain(
        'vacation :days 2 :subject "OOO" "gone";',
      );
    });

    it('404s when the account has no linked mailbox', async () => {
      await h.userService.create('orphan@example.org', 'LoginPass123', 'domain_user');
      const agent = await loginAgent(app, 'orphan@example.org', 'LoginPass123');
      const res = await agent.get('/admin/api/me/sieve');
      expect(res.status).toBe(404);
    });
  });
});
