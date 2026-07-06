import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount } from '../helpers/server';

const DSN = (
  messageId: string,
  recipient: string,
  status: string,
) => `Content-Type: message/delivery-status

Final-Recipient: rfc822; ${recipient}
Action: failed
Status: ${status}
Diagnostic-Code: smtp; 550 ${status} User unknown

Message-ID: <${messageId}>`;

describe('suppression list', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;
  let sendKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
    sendKey = h.apiKeyService.generateAndStore('send', { scopes: ['send'] }).plain;
    seedSmtpAccount(h);
  });

  afterEach(() => h.close());

  const send = (to: string, key = sendKey) =>
    request(app).post('/send').set('X-Api-Key', key).send({ to, subject: 's', html: '<p>hi</p>' });

  describe('admin CRUD', () => {
    it('rejects non-admin scope', async () => {
      expect(
        (await request(app).get('/admin/api/suppressions').set('X-Api-Key', sendKey)).status,
      ).toBe(403);
    });

    it('adds (normalizing the address), lists, and removes', async () => {
      const add = await request(app)
        .post('/admin/api/suppressions')
        .set('X-Api-Key', adminKey)
        .send({ address: 'Blocked@Example.COM', reason: 'complaint' });
      expect(add.status).toBe(201);
      expect(add.body.address).toBe('blocked@example.com');
      expect(add.body.reason).toBe('complaint');

      const list = await request(app).get('/admin/api/suppressions').set('X-Api-Key', adminKey);
      expect(list.body).toHaveLength(1);

      const del = await request(app)
        .delete(`/admin/api/suppressions/${add.body.id}`)
        .set('X-Api-Key', adminKey);
      expect(del.status).toBe(204);
      expect(
        (await request(app).get('/admin/api/suppressions').set('X-Api-Key', adminKey)).body,
      ).toHaveLength(0);
    });
  });

  describe('send enforcement', () => {
    beforeEach(async () => {
      await request(app)
        .post('/admin/api/suppressions')
        .set('X-Api-Key', adminKey)
        .send({ address: 'blocked@dest.com' });
    });

    it('blocks a send to a suppressed recipient with 422', async () => {
      const res = await send('blocked@dest.com');
      expect(res.status).toBe(422);
      expect(res.body.suppressed[0].address).toBe('blocked@dest.com');
    });

    it('blocks when a suppressed address is among several recipients', async () => {
      expect((await send('ok@dest.com,blocked@dest.com')).status).toBe(422);
    });

    it('allows a send to non-suppressed recipients', async () => {
      expect((await send('fine@dest.com')).status).toBe(202);
    });

    it('lets a suppression-exempt key bypass the list', async () => {
      const exempt = h.apiKeyService.generateAndStore('bulk', {
        scopes: ['send'],
        suppressionExempt: true,
      }).plain;
      expect((await send('blocked@dest.com', exempt)).status).toBe(202);
    });
  });

  describe('auto-suppress from hard bounce', () => {
    it('adds a hard-bounced recipient to the suppression list', async () => {
      await request(app)
        .post('/admin/api/bounces/ingest')
        .set('X-Api-Key', adminKey)
        .send({ raw: DSN('m1@example.com', 'gone@dest.com', '5.1.1') });

      const list = await request(app).get('/admin/api/suppressions').set('X-Api-Key', adminKey);
      const entry = list.body.find((s: { address: string }) => s.address === 'gone@dest.com');
      expect(entry?.reason).toBe('hard_bounce');
      // And a subsequent send is now blocked.
      expect((await send('gone@dest.com')).status).toBe(422);
    });

    it('does NOT suppress a soft bounce', async () => {
      await request(app)
        .post('/admin/api/bounces/ingest')
        .set('X-Api-Key', adminKey)
        .send({ raw: DSN('m2@example.com', 'temp@dest.com', '4.2.2') });
      const list = await request(app).get('/admin/api/suppressions').set('X-Api-Key', adminKey);
      expect(
        list.body.find((s: { address: string }) => s.address === 'temp@dest.com'),
      ).toBeUndefined();
    });
  });

  describe('per-key policy', () => {
    it('toggles suppressionExempt via PATCH and reflects it in the list', async () => {
      const created = await request(app)
        .post('/admin/api/api-keys')
        .set('X-Api-Key', adminKey)
        .send({ name: 'k', scopes: ['send'] });
      expect(created.body).not.toHaveProperty('suppressionExempt'); // create response omits it

      const patched = await request(app)
        .patch(`/admin/api/api-keys/${created.body.id}`)
        .set('X-Api-Key', adminKey)
        .send({ suppressionExempt: true });
      expect(patched.status).toBe(200);
      expect(patched.body.suppressionExempt).toBe(true);
    });
  });
});
