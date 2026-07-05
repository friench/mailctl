import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';
import { MigrationJobRepository } from '../../src/domain/migrations/repository';

describe('/admin/api/migrations', () => {
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
    sourceHost: 'imap.old.example',
    sourceUser: 'old@old.example',
    sourcePassword: 'SourceSecret1',
    sourceSsl: 'imaps' as const,
    destAddress: 'dest@example.org',
  };

  const create = (over: Record<string, unknown> = {}) =>
    request(app)
      .post('/admin/api/migrations')
      .set('X-Api-Key', adminKey)
      .send({ ...body, ...over });

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).get('/admin/api/migrations').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  it('creates a pending job, defaults the port, and never returns the password', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.sourcePort).toBe(993);
    expect(res.body.destAddress).toBe('dest@example.org');
    expect(JSON.stringify(res.body)).not.toContain('SourceSecret1');
  });

  it('rejects a job whose destination is not a local mailbox', async () => {
    const res = await create({ destAddress: 'nobody@example.org' });
    expect(res.status).toBe(400);
  });

  it('runs a job to done and wipes the stored password', async () => {
    const created = await create();
    const worked = await h.migrationService.processOne();
    expect(worked).toBe(true);

    // The migrator received the decrypted source password.
    expect(h.migrator.runs).toHaveLength(1);
    expect(h.migrator.runs[0]!.sourcePassword).toBe('SourceSecret1');
    expect(h.migrator.runs[0]!.destAddress).toBe('dest@example.org');

    const detail = await request(app)
      .get(`/admin/api/migrations/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(detail.body.status).toBe('done');
    expect(detail.body.log).toContain('synced');

    // Password wiped from the row after completion.
    const row = h.migrationService.findById(created.body.id)!;
    expect(row.sourcePasswordEnc).toBeNull();
  });

  it('marks a job failed when the sync fails', async () => {
    h.migrator.result = { ok: false, log: 'auth failed' };
    const created = await create();
    await h.migrationService.processOne();
    const detail = await request(app)
      .get(`/admin/api/migrations/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(detail.body.status).toBe('failed');
    expect(detail.body.error).toMatch(/failed/i);
  });

  it('lists jobs and deletes a terminal one', async () => {
    const created = await create();
    await h.migrationService.processOne();
    const list = await request(app).get('/admin/api/migrations').set('X-Api-Key', adminKey);
    expect(list.body).toHaveLength(1);

    const del = await request(app)
      .delete(`/admin/api/migrations/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(del.status).toBe(204);
    expect(h.migrationService.list()).toHaveLength(0);
  });

  it('recovers stuck processing jobs on startup', async () => {
    await create();
    const repo = new MigrationJobRepository(h.client.db);
    // Claim without finishing → leaves it 'processing'.
    expect(repo.claimNextPending()?.status).toBe('processing');
    expect(h.migrationService.recoverStuckJobs()).toBe(1);
    expect(h.migrationService.list()[0]!.status).toBe('pending');
  });
});
