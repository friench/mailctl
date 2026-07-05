import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/access-rules', () => {
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

  const create = (body: Record<string, unknown>) =>
    request(app).post('/admin/api/access-rules').set('X-Api-Key', adminKey).send(body);

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).get('/admin/api/access-rules').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  it('creates a rule, normalizes it, and reflects it into DMS', async () => {
    const res = await create({ matchType: 'email', action: 'block', value: '  Spam@Bad.Example ' });
    expect(res.status).toBe(201);
    expect(res.body.value).toBe('spam@bad.example');
    expect(res.body.recipient).toBeNull();

    // Reflected into the Postfix + Rspamd config written to DMS.
    expect(h.dms.accessConfig?.postfixSender).toContain('spam@bad.example REJECT');
    expect(h.dms.accessConfig?.rspamdFromBlock).toContain('spam@bad.example');
    expect(h.dms.calls.some((c) => c.method === 'writeAccessConfig')).toBe(true);
  });

  it('routes IP rules into the client access + Rspamd IP maps', async () => {
    await create({ matchType: 'ip', action: 'block', value: '203.0.113.5' });
    expect(h.dms.accessConfig?.postfixClient).toContain('203.0.113.5 REJECT');
    expect(h.dms.accessConfig?.rspamdIpBlock).toContain('203.0.113.5');
  });

  it('renders per-recipient rules into the Rspamd Lua prefilter, not the global maps', async () => {
    await create({
      matchType: 'email',
      action: 'block',
      value: 'x@bad.example',
      recipient: 'User@example.org',
    });
    const cfg = h.dms.accessConfig!;
    expect(cfg.postfixSender).toBe('');
    expect(cfg.rspamdFromBlock).toBe('');
    expect(cfg.rspamdRcptLua).toContain("['user@example.org|email|x@bad.example'] = 'block'");
  });

  it('rejects an invalid value with 400', async () => {
    expect(
      (await create({ matchType: 'email', action: 'block', value: 'not-an-email' })).status,
    ).toBe(400);
    expect((await create({ matchType: 'ip', action: 'allow', value: 'zzz' })).status).toBe(400);
  });

  it('rejects a duplicate (same type + value + scope) with 409', async () => {
    await create({ matchType: 'domain', action: 'block', value: 'bad.example' });
    const dup = await create({ matchType: 'domain', action: 'allow', value: 'bad.example' });
    expect(dup.status).toBe(409);
  });

  it('allows the same value for a different recipient scope', async () => {
    await create({ matchType: 'email', action: 'block', value: 'x@bad.example' });
    const scoped = await create({
      matchType: 'email',
      action: 'block',
      value: 'x@bad.example',
      recipient: 'user@example.org',
    });
    expect(scoped.status).toBe(201);
  });

  it('lists and deletes rules, regenerating config on delete', async () => {
    const created = await create({ matchType: 'domain', action: 'block', value: 'bad.example' });
    const list = await request(app).get('/admin/api/access-rules').set('X-Api-Key', adminKey);
    expect(list.body).toHaveLength(1);

    const del = await request(app)
      .delete(`/admin/api/access-rules/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(del.status).toBe(204);
    expect(h.dms.accessConfig?.rspamdFromBlock).toBe('');

    expect(
      (await request(app).delete('/admin/api/access-rules/nope').set('X-Api-Key', adminKey)).status,
    ).toBe(404);
  });

  it('regenerate rewrites the DMS config from current rules', async () => {
    await create({ matchType: 'domain', action: 'block', value: 'bad.example' });
    const before = h.dms.calls.filter((c) => c.method === 'writeAccessConfig').length;
    const res = await request(app)
      .post('/admin/api/access-rules/regenerate')
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(204);
    const after = h.dms.calls.filter((c) => c.method === 'writeAccessConfig').length;
    expect(after).toBe(before + 1);
    expect(h.dms.accessConfig?.rspamdFromBlock).toContain('bad.example');
  });
});
