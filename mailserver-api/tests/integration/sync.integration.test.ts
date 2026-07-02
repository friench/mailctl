import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';
import type { ReconciliationItem } from '../../src/domain/sync/types';

describe('/admin/api/sync', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  function preview() {
    return request(app).get('/admin/api/sync/preview').set('X-Api-Key', adminKey);
  }
  function itemFor(items: ReconciliationItem[], entityType: string, key: string) {
    return items.find((i) => i.entityType === entityType && i.key === key)!;
  }

  it('requires admin auth', async () => {
    expect((await request(app).get('/admin/api/sync/preview')).status).toBe(401);
  });

  it('previews DMS-created domain + mailbox as only_in_dms without writing', async () => {
    h.dms.emails.set('postmaster@itpuls.ru', 'hash');

    const res = await preview();
    expect(res.status).toBe(200);
    const items: ReconciliationItem[] = res.body.items;
    expect(itemFor(items, 'domain', 'itpuls.ru').divergence).toBe('only_in_dms');
    expect(itemFor(items, 'mailbox', 'postmaster@itpuls.ru').divergence).toBe('only_in_dms');

    // No writes happened.
    expect(h.domainRepo.list()).toHaveLength(0);
    expect(h.mailboxRepo.list()).toHaveLength(0);
  });

  it('imports selected domain + mailbox (and only those) on apply', async () => {
    h.dms.emails.set('postmaster@itpuls.ru', 'hash');
    h.dms.emails.set('ignored@other.ru', 'hash');

    const items: ReconciliationItem[] = (await preview()).body.items;
    const domainItem = itemFor(items, 'domain', 'itpuls.ru');
    const mboxItem = itemFor(items, 'mailbox', 'postmaster@itpuls.ru');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          {
            entityType: 'domain',
            key: domainItem.key,
            resolution: 'import',
            stateHash: domainItem.stateHash,
          },
          {
            entityType: 'mailbox',
            key: mboxItem.key,
            resolution: 'import',
            stateHash: mboxItem.stateHash,
          },
        ],
      });

    expect(apply.status).toBe(200);
    expect(apply.body.summary.applied).toBe(2);
    expect(h.domainRepo.findByName('itpuls.ru')?.source).toBe('dms');
    const imported = h.mailboxRepo.findByAddress('postmaster@itpuls.ru');
    expect(imported?.source).toBe('dms');
    expect(imported?.externallyManaged).toBe(true);
    // The unselected mailbox stayed divergent.
    expect(h.mailboxRepo.findByAddress('ignored@other.ru')).toBeUndefined();
  });

  it('pushes a DB-only mailbox to DMS with a supplied password', async () => {
    const domain = h.domainRepo.create({ name: 'example.com', active: true });
    h.mailboxRepo.create({ address: 'new@example.com', domainId: domain.id, quotaMb: 50 });

    const items: ReconciliationItem[] = (await preview()).body.items;
    const item = itemFor(items, 'mailbox', 'new@example.com');
    expect(item.divergence).toBe('only_in_db');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          {
            entityType: 'mailbox',
            key: item.key,
            resolution: 'push',
            stateHash: item.stateHash,
            password: 's3cret',
          },
        ],
      });

    expect(apply.body.summary.applied).toBe(1);
    expect(h.dms.emails.get('new@example.com')).toBe('s3cret');
    expect(h.dms.quotas.get('new@example.com')).toBe(50);
  });

  it('fails a push without a password', async () => {
    const domain = h.domainRepo.create({ name: 'example.com', active: true });
    h.mailboxRepo.create({ address: 'new@example.com', domainId: domain.id });
    const item = itemFor((await preview()).body.items, 'mailbox', 'new@example.com');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          { entityType: 'mailbox', key: item.key, resolution: 'push', stateHash: item.stateHash },
        ],
      });

    expect(apply.body.results[0].status).toBe('failed');
    expect(apply.body.results[0].error).toMatch(/password is required/);
  });

  it('rejects delete resolutions without confirmDeletes', async () => {
    h.dms.emails.set('stray@itpuls.ru', 'hash');
    const item = itemFor((await preview()).body.items, 'mailbox', 'stray@itpuls.ru');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          {
            entityType: 'mailbox',
            key: item.key,
            resolution: 'delete_dms',
            stateHash: item.stateHash,
          },
        ],
      });

    expect(apply.body.results[0].status).toBe('rejected');
    expect(apply.body.results[0].error).toMatch(/confirmDeletes/);
    expect(h.dms.emails.has('stray@itpuls.ru')).toBe(true);
  });

  it('deletes from DMS when confirmDeletes is set', async () => {
    h.dms.emails.set('stray@itpuls.ru', 'hash');
    const item = itemFor((await preview()).body.items, 'mailbox', 'stray@itpuls.ru');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        confirmDeletes: true,
        resolutions: [
          {
            entityType: 'mailbox',
            key: item.key,
            resolution: 'delete_dms',
            stateHash: item.stateHash,
          },
        ],
      });

    expect(apply.body.summary.applied).toBe(1);
    expect(h.dms.emails.has('stray@itpuls.ru')).toBe(false);
  });

  it('rejects a stale stateHash', async () => {
    h.dms.emails.set('a@itpuls.ru', 'hash');
    const item = itemFor((await preview()).body.items, 'mailbox', 'a@itpuls.ru');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          { entityType: 'mailbox', key: item.key, resolution: 'import', stateHash: 'deadbeef' },
        ],
      });

    expect(apply.body.results[0].status).toBe('rejected');
    expect(apply.body.results[0].error).toMatch(/re-preview/);
  });

  it('treats an all-skip selection as a no-op', async () => {
    h.dms.emails.set('a@itpuls.ru', 'hash');
    const item = itemFor((await preview()).body.items, 'mailbox', 'a@itpuls.ru');

    const apply = await request(app)
      .post('/admin/api/sync/apply')
      .set('X-Api-Key', adminKey)
      .send({
        resolutions: [
          { entityType: 'mailbox', key: item.key, resolution: 'skip', stateHash: item.stateHash },
        ],
      });

    expect(apply.body.summary).toMatchObject({ applied: 0, failed: 0, rejected: 0 });
    expect(h.mailboxRepo.list()).toHaveLength(0);
  });
});
