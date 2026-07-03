import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/aliases', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    h.domainRepo.create({ name: 'example.com', active: true });
  });

  afterEach(() => h.close());

  it('creates an alias in DMS and DB, then lists it', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'info@example.com', target: 'user@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.address).toBe('info@example.com');
    expect(h.dms.aliases.get('info@example.com')).toBe('user@example.com');

    const list = await request(app).get('/admin/api/aliases').set('X-Api-Key', adminKey);
    expect(list.body.map((a: { address: string }) => a.address)).toContain('info@example.com');
  });

  it('rejects an alias for an unregistered domain', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'info@unknown.com', target: 'user@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not registered/);
  });

  it('deletes an alias from DMS and DB', async () => {
    const created = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'info@example.com', target: 'user@example.com' });

    const del = await request(app)
      .delete(`/admin/api/aliases/${created.body.id}`)
      .set('X-Api-Key', adminKey);

    expect(del.status).toBe(204);
    expect(h.dms.aliases.has('info@example.com')).toBe(false);
    expect(h.aliasRepo.list()).toHaveLength(0);
  });

  it('persists notes on create', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'team@example.com', target: 'user@example.com', notes: 'distribution' });
    expect(res.status).toBe(201);
    expect(res.body.notes).toBe('distribution');
  });

  it('creates a catch-all alias (@domain)', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: '@example.com', target: 'user@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.address).toBe('@example.com');
    expect(h.dms.aliases.get('@example.com')).toBe('user@example.com');
  });

  it('creates a blackhole alias (target devnull)', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'spam@example.com', target: 'devnull' });
    expect(res.status).toBe(201);
    expect(res.body.target).toBe('devnull');
    expect(h.dms.aliases.get('spam@example.com')).toBe('devnull');
  });

  it('creates a whole-domain alias (@old -> @new)', async () => {
    h.domainRepo.create({ name: 'old.example', active: true });
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: '@old.example', target: '@example.com' });
    expect(res.status).toBe(201);
    expect(h.dms.aliases.get('@old.example')).toBe('@example.com');
  });

  it('rejects an address with no domain part', async () => {
    const res = await request(app)
      .post('/admin/api/aliases')
      .set('X-Api-Key', adminKey)
      .send({ address: 'not-an-address', target: 'user@example.com' });
    expect(res.status).toBe(400);
  });
});
