import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/users', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    await h.userService.create('seed@example.com', 'secret123');
  });

  afterEach(() => h.close());

  it('rejects without admin auth', async () => {
    const res = await request(app).get('/admin/api/users');
    expect(res.status).toBe(401);
  });

  it('lists existing users', async () => {
    const res = await request(app).get('/admin/api/users').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe('seed@example.com');
    expect(res.body[0]).not.toHaveProperty('passwordHash');
  });

  it('creates a user', async () => {
    const res = await request(app)
      .post('/admin/api/users')
      .set('X-Api-Key', adminKey)
      .send({ email: 'new@example.com', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@example.com');

    const verified = await h.userService.verifyPassword('new@example.com', 'secret123');
    expect(verified).not.toBeNull();
  });

  it('rejects short password on create', async () => {
    const res = await request(app)
      .post('/admin/api/users')
      .set('X-Api-Key', adminKey)
      .send({ email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/admin/api/users')
      .set('X-Api-Key', adminKey)
      .send({ email: 'seed@example.com', password: 'secret123' });
    expect(res.status).toBe(409);
  });

  it('changes password', async () => {
    const created = await h.userService.create('pw@example.com', 'oldpass1');
    const res = await request(app)
      .patch(`/admin/api/users/${created.id}/password`)
      .set('X-Api-Key', adminKey)
      .send({ password: 'newpass2' });

    expect(res.status).toBe(204);
    expect(await h.userService.verifyPassword('pw@example.com', 'oldpass1')).toBeNull();
    expect(await h.userService.verifyPassword('pw@example.com', 'newpass2')).not.toBeNull();
  });

  it('refuses to delete the last user', async () => {
    const seed = h.userRepo.findByEmail('seed@example.com')!;
    const res = await request(app).delete(`/admin/api/users/${seed.id}`).set('X-Api-Key', adminKey);
    expect(res.status).toBe(400);
  });

  it('deletes a user when not the last', async () => {
    const second = await h.userService.create('two@example.com', 'secret123');
    const res = await request(app)
      .delete(`/admin/api/users/${second.id}`)
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(204);
    expect(h.userRepo.findById(second.id)).toBeUndefined();
  });
});
