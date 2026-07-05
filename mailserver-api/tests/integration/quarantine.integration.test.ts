import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { JunkMessage } from '../../src/domain/mailboxes/dms-client';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

function junk(uid: number, over: Partial<JunkMessage> = {}): JunkMessage {
  return {
    uid,
    guid: `g${uid}`,
    from: `spam${uid}@bad.example`,
    subject: `Spam ${uid}`,
    date: '2026-07-01 12:00:00',
    sizeBytes: 1024,
    score: 9.5,
    ...over,
  };
}

async function loginAgent(app: Express, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('spam quarantine', () => {
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
    h.dms.junk.set('user@example.org', [junk(1), junk(2)]);
  });

  afterEach(() => h.close());

  describe('admin API', () => {
    it('aggregates only mailboxes that have spam', async () => {
      await h.mailboxService.create({ address: 'clean@example.org', password: 'InitPass123' });
      const res = await request(app).get('/admin/api/quarantine').set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].address).toBe('user@example.org');
      expect(res.body[0].messages).toHaveLength(2);
    });

    it('filters by mailboxId', async () => {
      const res = await request(app)
        .get(`/admin/api/quarantine?mailboxId=${mailboxId}`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body[0].messages.map((m: { uid: number }) => m.uid)).toEqual([1, 2]);
    });

    it('404s for an unknown mailbox filter', async () => {
      const res = await request(app)
        .get('/admin/api/quarantine?mailboxId=nope')
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(404);
    });

    it('releases a message back to the inbox', async () => {
      const res = await request(app)
        .post(`/admin/api/quarantine/${mailboxId}/1/release`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(204);
      expect(h.dms.junk.get('user@example.org')!.map((m) => m.uid)).toEqual([2]);
      expect(h.dms.calls.some((c) => c.method === 'releaseJunk')).toBe(true);
    });

    it('deletes a message', async () => {
      const res = await request(app)
        .delete(`/admin/api/quarantine/${mailboxId}/2`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(204);
      expect(h.dms.junk.get('user@example.org')!.map((m) => m.uid)).toEqual([1]);
    });

    it('applies a bulk delete', async () => {
      const res = await request(app)
        .post(`/admin/api/quarantine/${mailboxId}/actions`)
        .set('X-Api-Key', adminKey)
        .send({ uids: [1, 2], action: 'delete' });
      expect(res.status).toBe(200);
      expect(res.body.handled).toBe(2);
      expect(h.dms.junk.get('user@example.org')).toEqual([]);
    });

    it('serves the raw message text', async () => {
      const res = await request(app)
        .get(`/admin/api/quarantine/${mailboxId}/1`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Subject: Spam 1');
    });
  });

  describe('domain scoping', () => {
    it('hides quarantine for mailboxes outside the actor domains', async () => {
      const other = h.domainRepo.create({ name: 'other.example', active: true });
      const otherMb = await h.mailboxService.create({
        address: 'boss@other.example',
        password: 'InitPass123',
      });
      h.dms.junk.set('boss@other.example', [junk(7)]);

      const user = await h.userService.create('da@example.org', 'LoginPass123', 'domain_admin');
      const mine = h.domainRepo.list().find((d) => d.name === 'example.org')!;
      h.userService.setDomains(user.id, [mine.id]);
      const agent = await loginAgent(app, 'da@example.org', 'LoginPass123');

      // Aggregate only includes the in-scope mailbox.
      const list = await agent.get('/admin/api/quarantine');
      expect(list.status).toBe(200);
      expect(list.body.map((b: { address: string }) => b.address)).toEqual(['user@example.org']);

      // The other domain's mailbox is a 404.
      expect((await agent.get(`/admin/api/quarantine?mailboxId=${otherMb.id}`)).status).toBe(404);
      expect((await agent.post(`/admin/api/quarantine/${otherMb.id}/7/release`)).status).toBe(404);
      expect(other.id).toBeTruthy();
    });
  });

  describe('self-service', () => {
    beforeEach(async () => {
      await h.userService.create('user@example.org', 'LoginPass123', 'domain_user');
    });

    it('lists and releases the caller own quarantine', async () => {
      const agent = await loginAgent(app, 'user@example.org', 'LoginPass123');
      const list = await agent.get('/admin/api/me/quarantine');
      expect(list.status).toBe(200);
      expect(list.body.messages).toHaveLength(2);

      const rel = await agent.post('/admin/api/me/quarantine/1/release');
      expect(rel.status).toBe(204);
      expect(h.dms.junk.get('user@example.org')!.map((m) => m.uid)).toEqual([2]);
    });

    it('404s when the account has no linked mailbox', async () => {
      await h.userService.create('orphan@example.org', 'LoginPass123', 'domain_user');
      const agent = await loginAgent(app, 'orphan@example.org', 'LoginPass123');
      expect((await agent.get('/admin/api/me/quarantine')).status).toBe(404);
    });
  });
});
