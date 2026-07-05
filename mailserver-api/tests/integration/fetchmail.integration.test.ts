import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/fetchmail', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let nonAdminKey: string;

  beforeEach(async () => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    nonAdminKey = h.apiKeyService.generateAndStore('send', { scopes: ['send'] }).plain;
    h.domainRepo.create({ name: 'example.org', active: true });
    await h.mailboxService.create({ address: 'dest@example.org', password: 'InitPass123' });
  });

  afterEach(() => h.close());

  const body = {
    pollServer: 'imap.provider.com',
    protocol: 'imap' as const,
    username: 'remote@provider.com',
    password: 'RemoteSecret1',
    destAddress: 'dest@example.org',
  };

  const create = (over: Record<string, unknown> = {}) =>
    request(app)
      .post('/admin/api/fetchmail')
      .set('X-Api-Key', adminKey)
      .send({ ...body, ...over });

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).get('/admin/api/fetchmail').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  it('creates an account, hides the password, and renders fetchmail.cf into DMS', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('RemoteSecret1');

    const cfg = h.dms.fetchmailConfig!;
    expect(cfg).toContain('poll "imap.provider.com" protocol IMAP');
    expect(cfg).toContain('password "RemoteSecret1"');
    expect(cfg).toContain('is "dest@example.org" here');
  });

  it('rejects a destination that is not a local mailbox', async () => {
    expect((await create({ destAddress: 'nobody@example.org' })).status).toBe(400);
  });

  it('excludes paused accounts from the rendered config', async () => {
    const created = await create();
    const paused = await request(app)
      .patch(`/admin/api/fetchmail/${created.body.id}`)
      .set('X-Api-Key', adminKey)
      .send({ active: false });
    expect(paused.status).toBe(200);
    expect(paused.body.active).toBe(false);
    // Regenerated config no longer includes the poll entry.
    expect(h.dms.fetchmailConfig).not.toContain('poll ');
  });

  it('lists and deletes accounts, regenerating on delete', async () => {
    const created = await create();
    const list = await request(app).get('/admin/api/fetchmail').set('X-Api-Key', adminKey);
    expect(list.body).toHaveLength(1);

    const del = await request(app)
      .delete(`/admin/api/fetchmail/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(del.status).toBe(204);
    expect(h.dms.fetchmailConfig).not.toContain('poll ');
  });
});
