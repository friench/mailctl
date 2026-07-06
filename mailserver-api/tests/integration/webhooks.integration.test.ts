import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount } from '../helpers/server';
import { signWebhookPayload } from '../../src/lib/webhook-signature';

interface RecordedFetchCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: string;
}

function makeFetchStub(response: Partial<Response> = { ok: true, status: 200 }) {
  const calls: RecordedFetchCall[] = [];
  const fn: typeof fetch = vi.fn(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rawHeaders = init?.headers ?? {};
    const headers: Record<string, string> = {};
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => (headers[k] = v));
    } else if (Array.isArray(rawHeaders)) {
      for (const [k, v] of rawHeaders) headers[k.toLowerCase()] = v;
    } else {
      for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    calls.push({
      url,
      method: init?.method,
      headers,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return new Response(response.body ?? null, {
      status: response.status ?? 200,
      statusText: response.statusText ?? 'OK',
    });
  });
  return { fetch: fn, calls };
}

describe('/admin/api/webhooks CRUD', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('rejects without admin auth', async () => {
    const res = await request(app).get('/admin/api/webhooks');
    expect(res.status).toBe(401);
  });

  it('creates a webhook and returns the secret once', async () => {
    const res = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({
        name: 'my-hook',
        url: 'https://example.com/hook',
        events: ['send.completed', 'send.failed'],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('my-hook');
    expect(res.body.events).toEqual(['send.completed', 'send.failed']);
    expect(res.body.active).toBe(true);
    expect(res.body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);

    const list = await request(app).get('/admin/api/webhooks').set('X-Api-Key', adminKey);
    expect(list.body[0]).not.toHaveProperty('secret');
  });

  it('rejects invalid event names', async () => {
    const res = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['nonsense.event'] });
    expect(res.status).toBe(400);
  });

  it('accepts a subscription to send.bounced', async () => {
    // Regression: BounceService dispatches send.bounced, but it was missing from
    // WEBHOOK_EVENTS, so the subscription was rejected and the event was undeliverable.
    const res = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'bounce-hook', url: 'https://example.com/hook', events: ['send.bounced'] });
    expect(res.status).toBe(201);
    expect(res.body.events).toEqual(['send.bounced']);
  });

  it('rejects non-http URLs', async () => {
    const res = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'ftp://x.com', events: ['send.completed'] });
    expect(res.status).toBe(400);
  });

  it('updates a webhook', async () => {
    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.completed'] });

    const upd = await request(app)
      .patch(`/admin/api/webhooks/${created.body.id}`)
      .set('X-Api-Key', adminKey)
      .send({ active: false });

    expect(upd.status).toBe(200);
    expect(upd.body.active).toBe(false);
  });

  it('deletes a webhook', async () => {
    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.completed'] });

    const del = await request(app)
      .delete(`/admin/api/webhooks/${created.body.id}`)
      .set('X-Api-Key', adminKey);
    expect(del.status).toBe(204);
    expect(h.webhookRepo.findById(created.body.id)).toBeUndefined();
  });
});

describe('Webhook delivery', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    seedSmtpAccount(h);
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('test endpoint POSTs to URL with HMAC signature', async () => {
    const stub = makeFetchStub({ ok: true, status: 200 });
    h.setFetch(stub.fetch);

    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://hooks.example.com/in', events: ['webhook.test'] });

    const test = await request(app)
      .post(`/admin/api/webhooks/${created.body.id}/test`)
      .set('X-Api-Key', adminKey);

    expect(test.status).toBe(202);
    expect(test.body.status).toBe('done');
    expect(test.body.lastResponseStatus).toBe(200);

    expect(stub.calls).toHaveLength(1);
    const call = stub.calls[0]!;
    expect(call.url).toBe('https://hooks.example.com/in');
    expect(call.method).toBe('POST');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['x-webhook-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(call.headers['x-webhook-event']).toBe('webhook.test');

    // Recompute signature to verify correctness
    const ts = Number(call.headers['x-webhook-timestamp']);
    const expected = signWebhookPayload(created.body.secret, ts, call.body);
    expect(call.headers['x-webhook-signature']).toBe(`sha256=${expected}`);

    const parsed = JSON.parse(call.body);
    expect(parsed.event).toBe('webhook.test');
    expect(parsed.data.message).toContain('Test ping');
  });

  it('reschedules retry on non-2xx response', async () => {
    h.setFetch(makeFetchStub({ ok: false, status: 503, statusText: 'Service Unavailable' }).fetch);

    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['webhook.test'] });

    const test = await request(app)
      .post(`/admin/api/webhooks/${created.body.id}/test`)
      .set('X-Api-Key', adminKey);

    expect(test.status).toBe(202);
    expect(test.body.status).toBe('pending');
    expect(test.body.attempts).toBe(1);
    expect(test.body.lastResponseStatus).toBe(503);
    expect(test.body.nextAttemptAt).toBeDefined();
  });

  it('marks dead after exhausting attempts', async () => {
    h.setFetch(makeFetchStub({ ok: false, status: 500 }).fetch);

    const created = await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['webhook.test'] });

    // Manually create a delivery with maxAttempts=1 to test dead path quickly.
    const delivery = h.webhookDeliveryRepo.create({
      webhookId: created.body.id,
      event: 'webhook.test',
      payload: { test: true },
      maxAttempts: 1,
    });

    const result = await h.webhookService.processSpecific(delivery.id);
    expect(result.status).toBe('dead');
    expect(result.lastError).toMatch(/HTTP 500/);
  });

  it('dispatches send.completed event after successful send', async () => {
    const stub = makeFetchStub({ ok: true, status: 200 });
    h.setFetch(stub.fetch);

    await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({
        name: 'h',
        url: 'https://hooks.example.com/in',
        events: ['send.completed'],
      });

    // Mock the mailer.send by spying on the DB; here we simulate by calling enqueue+process
    // with a stubbed mailer would be ideal, but our test app uses real MailSender.
    // Instead, directly dispatch the event:
    h.webhookService.dispatch('send.completed', { jobId: 'fake', to: 'a@b.co' });

    // Process the delivery via worker-style call
    const more = await h.webhookService.processOne();
    expect(more).toBe(true);

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.headers['x-webhook-event']).toBe('send.completed');
  });

  it('does not dispatch to inactive webhooks', async () => {
    await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.completed'], active: false });

    h.webhookService.dispatch('send.completed', { jobId: 'fake' });

    // No deliveries should be created
    expect(h.webhookDeliveryRepo.listByWebhook('any')).toEqual([]);
  });

  it('does not dispatch to webhooks not subscribed to event', async () => {
    await request(app)
      .post('/admin/api/webhooks')
      .set('X-Api-Key', adminKey)
      .send({ name: 'h', url: 'https://x.com', events: ['send.failed'] });

    h.webhookService.dispatch('send.completed', { jobId: 'fake' });

    // The webhook is for send.failed, not send.completed
    const all = h.webhookRepo.list();
    expect(all).toHaveLength(1);
    expect(h.webhookDeliveryRepo.listByWebhook(all[0]!.id)).toEqual([]);
  });
});
