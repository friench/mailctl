import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/mailboxes', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let nonAdminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    nonAdminKey = h.apiKeyService.generateAndStore('send', { scopes: ['send'] }).plain;
    h.domainRepo.create({ name: 'example.org' });
  });

  afterEach(() => h.close());

  describe('auth', () => {
    it('rejects without key', async () => {
      const res = await request(app).get('/admin/api/mailboxes');
      expect(res.status).toBe(401);
    });

    it('rejects with non-admin scope', async () => {
      const res = await request(app).get('/admin/api/mailboxes').set('X-Api-Key', nonAdminKey);
      expect(res.status).toBe(403);
    });
  });

  describe('POST (create)', () => {
    it('creates mailbox in DMS and DB', async () => {
      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'admin@example.org', password: 'strongpass' });

      expect(res.status).toBe(201);
      expect(res.body.address).toBe('admin@example.org');
      expect(res.body.active).toBe(true);
      expect(res.body.source).toBe('panel');
      expect(res.body.externallyManaged).toBe(false);

      expect(h.dms.emails.has('admin@example.org')).toBe(true);
      expect(h.dms.emails.get('admin@example.org')).toBe('strongpass');
    });

    it('lowercases the address', async () => {
      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'ADMIN@EXAMPLE.ORG', password: 'strongpass' });

      expect(res.status).toBe(201);
      expect(res.body.address).toBe('admin@example.org');
    });

    it('sets quota in DMS when provided', async () => {
      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'q@example.org', password: 'strongpass', quotaMb: 500 });

      expect(res.status).toBe(201);
      expect(res.body.quotaMb).toBe(500);
      expect(h.dms.quotas.get('q@example.org')).toBe(500);
    });

    it('rejects unregistered domain', async () => {
      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'a@unknown.com', password: 'strongpass' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DOMAIN_NOT_FOUND');
      expect(h.dms.emails.size).toBe(0);
    });

    it('rejects disabled domain', async () => {
      const d = h.domainRepo.create({ name: 'off.com' });
      h.domainRepo.update(d.id, { active: false });

      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'a@off.com', password: 'strongpass' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DOMAIN_DISABLED');
    });

    it('returns 409 on duplicate', async () => {
      await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'dup@example.org', password: 'strongpass' });

      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'dup@example.org', password: 'strongpass' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('MAILBOX_EXISTS');
    });

    it('rejects short passwords', async () => {
      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'a@example.org', password: 'short' });
      expect(res.status).toBe(400);
    });

    it('rolls back DMS email if quota set fails', async () => {
      h.dms.errors.setQuota = new Error('quota service down');

      const res = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'rb@example.org', password: 'strongpass', quotaMb: 100 });

      expect(res.status).toBe(500);
      expect(h.dms.emails.has('rb@example.org')).toBe(false);
      expect(h.mailboxRepo.findByAddress('rb@example.org')).toBeUndefined();
    });
  });

  describe('GET (list)', () => {
    it('returns mailboxes', async () => {
      await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'a@example.org', password: 'strongpass' });

      const res = await request(app).get('/admin/api/mailboxes').set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].address).toBe('a@example.org');
    });
  });

  describe('PATCH /:id/password', () => {
    it('updates password in DMS', async () => {
      const created = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'pw@example.org', password: 'oldpass1' });

      const res = await request(app)
        .patch(`/admin/api/mailboxes/${created.body.id}/password`)
        .set('X-Api-Key', adminKey)
        .send({ password: 'newpass2' });

      expect(res.status).toBe(204);
      expect(h.dms.emails.get('pw@example.org')).toBe('newpass2');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .patch('/admin/api/mailboxes/00000000-0000-0000-0000-000000000000/password')
        .set('X-Api-Key', adminKey)
        .send({ password: 'newpass1' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id (metadata)', () => {
    it('updates quota and propagates to DMS', async () => {
      const created = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'mut@example.org', password: 'strongpass' });

      const res = await request(app)
        .patch(`/admin/api/mailboxes/${created.body.id}`)
        .set('X-Api-Key', adminKey)
        .send({ quotaMb: 200 });

      expect(res.status).toBe(200);
      expect(res.body.quotaMb).toBe(200);
      expect(h.dms.quotas.get('mut@example.org')).toBe(200);
    });

    it('clears quota when set to null', async () => {
      const created = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'clr@example.org', password: 'strongpass', quotaMb: 100 });

      const res = await request(app)
        .patch(`/admin/api/mailboxes/${created.body.id}`)
        .set('X-Api-Key', adminKey)
        .send({ quotaMb: null });

      expect(res.status).toBe(200);
      expect(res.body.quotaMb).toBeNull();
      expect(h.dms.quotas.has('clr@example.org')).toBe(false);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes from DMS and DB', async () => {
      const created = await request(app)
        .post('/admin/api/mailboxes')
        .set('X-Api-Key', adminKey)
        .send({ address: 'rm@example.org', password: 'strongpass' });

      const res = await request(app)
        .delete(`/admin/api/mailboxes/${created.body.id}`)
        .set('X-Api-Key', adminKey);

      expect(res.status).toBe(204);
      expect(h.dms.emails.has('rm@example.org')).toBe(false);
      expect(h.mailboxRepo.findById(created.body.id)).toBeUndefined();
    });
  });
});
