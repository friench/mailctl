import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

function bounceFor(messageId: string, recipient = 'nouser@dest.com', status = '5.1.1'): string {
  return `Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: message/delivery-status

Final-Recipient: rfc822; ${recipient}
Action: failed
Status: ${status}
Diagnostic-Code: smtp; 550 ${status} User unknown

--B
Content-Type: message/rfc822

Message-ID: <${messageId}>
Subject: Hello

--B--`;
}

describe('/admin/api/bounces', () => {
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

  it('rejects non-admin scope', async () => {
    expect(
      (await request(app).get('/admin/api/bounces').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  it('ingests a raw DSN, classifies it, and correlates to the send job by message id', async () => {
    // A completed send job carrying the message id the bounce references.
    const job = h.sendJobRepo.create({ payload: { to: 'x@dest.com', subject: 's', html: 'h' } });
    h.sendJobRepo.markDone(job.id, { account: 'a1', messageId: 'orig-123@example.com' });

    const res = await request(app)
      .post('/admin/api/bounces/ingest')
      .set('X-Api-Key', adminKey)
      .set('Content-Type', 'message/rfc822')
      .send(bounceFor('orig-123@example.com'));

    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(1);
    const ev = res.body.events[0];
    expect(ev.recipient).toBe('nouser@dest.com');
    expect(ev.classification).toBe('hard');
    expect(ev.statusCode).toBe('5.1.1');
    expect(ev.sendJobId).toBe(job.id);
  });

  it('accepts a JSON { raw } payload and records an uncorrelated soft bounce', async () => {
    const res = await request(app)
      .post('/admin/api/bounces/ingest')
      .set('X-Api-Key', adminKey)
      .send({ raw: bounceFor('unknown-msg@example.com', 'temp@dest.com', '4.2.2') });
    expect(res.status).toBe(201);
    expect(res.body.events[0].classification).toBe('soft');
    expect(res.body.events[0].sendJobId).toBeNull();
  });

  it('dispatches a send.bounced webhook event', async () => {
    const events: string[] = [];
    // Spy on the shared webhook dispatcher used as the event sink.
    const orig = h.webhookService.dispatch.bind(h.webhookService);
    h.webhookService.dispatch = (event: string, payload: Record<string, unknown>) => {
      events.push(event);
      return orig(event, payload);
    };
    await request(app)
      .post('/admin/api/bounces/ingest')
      .set('X-Api-Key', adminKey)
      .send({ raw: bounceFor('m@example.com') });
    expect(events).toContain('send.bounced');
  });

  it('422s a non-DSN payload and lists recorded bounces', async () => {
    expect(
      (
        await request(app)
          .post('/admin/api/bounces/ingest')
          .set('X-Api-Key', adminKey)
          .send({ raw: 'just a normal email, not a bounce' })
      ).status,
    ).toBe(422);

    await request(app)
      .post('/admin/api/bounces/ingest')
      .set('X-Api-Key', adminKey)
      .send({ raw: bounceFor('a@example.com') });
    const list = await request(app).get('/admin/api/bounces').set('X-Api-Key', adminKey);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].recipient).toBe('nouser@dest.com');
  });
});
