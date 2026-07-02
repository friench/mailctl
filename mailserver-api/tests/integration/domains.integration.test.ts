import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/domains', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let nonAdminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    nonAdminKey = h.apiKeyService.generateAndStore('send-only', { scopes: ['send'] }).plain;
  });

  afterEach(() => h.close());

  describe('auth', () => {
    it('rejects without API key', async () => {
      const res = await request(app).get('/admin/api/domains');
      expect(res.status).toBe(401);
    });

    it('rejects with non-admin scope', async () => {
      const res = await request(app).get('/admin/api/domains').set('X-Api-Key', nonAdminKey);
      expect(res.status).toBe(403);
      expect(res.body.required_scope).toBe('admin');
    });
  });

  describe('GET (list)', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/admin/api/domains').set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST (create)', () => {
    it('creates a domain', async () => {
      const res = await request(app)
        .post('/admin/api/domains')
        .set('X-Api-Key', adminKey)
        .send({ name: 'example.org', dkimSelector: 'mail' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('example.org');
      expect(res.body.dkimSelector).toBe('mail');
      expect(res.body.active).toBe(true);
      expect(res.body.source).toBe('panel');
      expect(res.body.dkimStatus).toBeNull();
      expect(res.body.lastSyncedAt).toBeNull();
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects invalid domain name', async () => {
      const res = await request(app)
        .post('/admin/api/domains')
        .set('X-Api-Key', adminKey)
        .send({ name: 'not a domain' });
      expect(res.status).toBe(400);
    });

    it('lowercases the name', async () => {
      const res = await request(app)
        .post('/admin/api/domains')
        .set('X-Api-Key', adminKey)
        .send({ name: 'EXAMPLE.ORG' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('example.org');
    });

    it('returns 409 on duplicate name', async () => {
      await request(app)
        .post('/admin/api/domains')
        .set('X-Api-Key', adminKey)
        .send({ name: 'example.org' });

      const res = await request(app)
        .post('/admin/api/domains')
        .set('X-Api-Key', adminKey)
        .send({ name: 'example.org' });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /:id', () => {
    it('returns a domain', async () => {
      const created = h.domainRepo.create({ name: 'a.com' });
      const res = await request(app)
        .get(`/admin/api/domains/${created.id}`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .get('/admin/api/domains/00000000-0000-0000-0000-000000000000')
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('updates active flag', async () => {
      const created = h.domainRepo.create({ name: 'a.com' });
      const res = await request(app)
        .patch(`/admin/api/domains/${created.id}`)
        .set('X-Api-Key', adminKey)
        .send({ active: false });
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });
  });

  describe('DELETE /:id', () => {
    it('removes a domain', async () => {
      const created = h.domainRepo.create({ name: 'a.com' });
      const res = await request(app)
        .delete(`/admin/api/domains/${created.id}`)
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(204);
      expect(h.domainRepo.findById(created.id)).toBeUndefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .delete('/admin/api/domains/00000000-0000-0000-0000-000000000000')
        .set('X-Api-Key', adminKey);
      expect(res.status).toBe(404);
    });
  });
});
