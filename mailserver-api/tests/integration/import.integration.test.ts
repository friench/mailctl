import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/import', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let nonAdminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    nonAdminKey = h.apiKeyService.generateAndStore('send', { scopes: ['send'] }).plain;
  });

  afterEach(() => h.close());

  const imp = (body: Record<string, unknown>, query = '') =>
    request(app).post(`/admin/api/import${query}`).set('X-Api-Key', adminKey).send(body);

  const doc = {
    domains: [{ name: 'example.com' }],
    mailboxes: [{ address: 'user@example.com', password: 'ChangeMe123', quotaMb: 1024 }],
    aliases: [{ address: 'info@example.com', target: 'user@example.com' }],
  };

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).post('/admin/api/import').set('X-Api-Key', nonAdminKey).send(doc)).status,
    ).toBe(403);
  });

  it('creates domains, mailboxes and aliases in dependency order', async () => {
    const res = await imp(doc);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ created: 3, skipped: 0, failed: 0 });
    expect(res.body.domains[0].action).toBe('created');

    // Persisted.
    expect(h.domainRepo.findByName('example.com')).toBeTruthy();
    expect(h.mailboxRepo.findByAddress('user@example.com')).toBeTruthy();
    expect(h.aliasRepo.findByAddress('info@example.com')).toBeTruthy();
  });

  it('is idempotent — a second run skips everything', async () => {
    await imp(doc);
    const again = await imp(doc);
    expect(again.body.summary).toEqual({ created: 0, skipped: 3, failed: 0 });
    expect(again.body.mailboxes[0].action).toBe('skipped');
  });

  it('dry run reports the plan without applying', async () => {
    const res = await imp(doc, '?dryRun=true');
    expect(res.body.dryRun).toBe(true);
    expect(res.body.summary.created).toBe(3);
    expect(h.domainRepo.findByName('example.com')).toBeUndefined();
  });

  it('rejects a traversal domain name up front (no bypass of field validation)', async () => {
    const res = await imp({ domains: [{ name: '../../etc' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a mailbox address with an embedded newline', async () => {
    const res = await imp({
      domains: [{ name: 'registered.com' }],
      mailboxes: [{ address: 'foo\nevil@registered.com', password: 'ChangeMe123' }],
    });
    expect(res.status).toBe(400);
    expect(h.mailboxRepo.findByAddress('foo\nevil@registered.com')).toBeUndefined();
  });

  it('flags a new mailbox with no password as failed (even in dry run)', async () => {
    const res = await imp(
      { domains: [{ name: 'example.com' }], mailboxes: [{ address: 'x@example.com' }] },
      '?dryRun=true',
    );
    const mb = res.body.mailboxes[0];
    expect(mb.action).toBe('failed');
    expect(mb.error).toMatch(/password/i);
  });

  it('continues past a failing item and reports it', async () => {
    // Mailbox in an unregistered domain fails; the alias to a valid target still fails
    // (its address domain also unregistered), but the valid domain is created.
    const res = await imp({
      domains: [{ name: 'good.example' }],
      mailboxes: [
        { address: 'ok@good.example', password: 'ChangeMe123' },
        { address: 'bad@missing.example', password: 'ChangeMe123' },
      ],
    });
    expect(res.body.summary.created).toBe(2); // domain + ok mailbox
    expect(res.body.summary.failed).toBe(1);
    const bad = res.body.mailboxes.find((m: { key: string }) => m.key === 'bad@missing.example');
    expect(bad.action).toBe('failed');
  });

  it('rejects an empty document', async () => {
    expect((await imp({})).status).toBe(400);
  });
});
