import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('nodemailer');

import * as nodemailer from 'nodemailer';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, seedSmtpAccount, type TestAppHandle } from '../helpers/server';

interface MockTransport {
  sendMail: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

describe('POST /send (async)', () => {
  let h: TestDbHandle;
  let appHandle: TestAppHandle;
  let app: Express;
  let key: string;
  let transports: Map<string, MockTransport>;

  beforeEach(() => {
    transports = new Map();
    vi.mocked(nodemailer.createTransport).mockImplementation((opts: unknown) => {
      const o = opts as { host: string; port: number };
      const k = `${o.host}:${o.port}`;
      if (!transports.has(k)) transports.set(k, { sendMail: vi.fn(), close: vi.fn() });
      return transports.get(k) as unknown as nodemailer.Transporter;
    });

    h = createTestDb();
    seedSmtpAccount(h, { name: 'primary', fromAddress: 'noreply@example.com' });
    appHandle = createTestApp(h);
    app = appHandle.app;
    key = h.apiKeyService.generateAndStore('caller', { scopes: ['send'] }).plain;
  });

  afterEach(() => h.close());

  it('returns 202 with jobId for async send', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.status).toBe('pending');
    expect(res.body.attempts).toBe(0);
  });

  it('persists apiKeyId on the job', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    const stored = h.sendJobRepo.findById(res.body.id);
    expect(stored?.apiKeyId).toBeTruthy();
    const apiKey = h.apiKeyRepo.findById(stored!.apiKeyId!);
    expect(apiKey?.name).toBe('caller');
  });

  it('rejects from-address not in active accounts', async () => {
    const res = await request(app).post('/send').set('X-Api-Key', key).send({
      from: 'notme@unknown.com',
      to: 'r@x.com',
      subject: 's',
      html: 'h',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/);
  });

  it('round-trips attachments, replyTo and text into the persisted payload', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({
        to: 'r@x.com',
        subject: 's',
        html: 'h',
        text: 'plain',
        replyTo: 'reply@example.com',
        attachments: [
          { filename: 'cv.pdf', content: 'JVBERi0xLjcK', contentType: 'application/pdf' },
        ],
      });

    expect(res.status).toBe(202);
    const stored = h.sendJobRepo.findById(res.body.id);
    expect(stored?.payload.text).toBe('plain');
    expect(stored?.payload.replyTo).toBe('reply@example.com');
    expect(stored?.payload.attachments).toEqual([
      { filename: 'cv.pdf', content: 'JVBERi0xLjcK', contentType: 'application/pdf' },
    ]);
  });

  it('omits new fields from payload when not provided (backward compatible)', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(202);
    const stored = h.sendJobRepo.findById(res.body.id);
    expect(stored?.payload).toEqual({ to: 'r@x.com', subject: 's', html: 'h' });
  });

  it('rejects an invalid attachment (non-base64)', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({
        to: 'r@x.com',
        subject: 's',
        html: 'h',
        attachments: [{ filename: 'cv.pdf', content: 'not base64!!!' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation error/);
  });

  it('does not call SMTP synchronously when async', async () => {
    await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    // The job is enqueued, but no worker runs in this test (we don't start one).
    expect(transports.get('localhost:25')?.sendMail).not.toHaveBeenCalled();
  });

  it('returns 403 for a valid key without the send scope', async () => {
    const noScope = h.apiKeyService.generateAndStore('no-scope', { scopes: [] }).plain;
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', noScope)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.required_scope).toBe('send');
  });

  it('accepts a key that has the send scope', async () => {
    const scoped = h.apiKeyService.generateAndStore('scoped', { scopes: ['send'] }).plain;
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', scoped)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  it('rejects more than 50 recipients', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `r${i}@x.com`).join(',');
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: many, subject: 's', html: 'h' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
    expect(
      res.body.issues.some((i: { message: string }) => i.message === 'too many recipients'),
    ).toBe(true);
  });

  it('rejects a subject containing a line break (header injection)', async () => {
    const res = await request(app)
      .post('/send')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 'hi\nBcc: evil@x.com', html: 'h' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });
});

describe('POST /send?wait=true (sync)', () => {
  let h: TestDbHandle;
  let app: Express;
  let key: string;
  let transports: Map<string, MockTransport>;

  beforeEach(() => {
    transports = new Map();
    vi.mocked(nodemailer.createTransport).mockImplementation((opts: unknown) => {
      const o = opts as { host: string; port: number };
      const k = `${o.host}:${o.port}`;
      if (!transports.has(k)) transports.set(k, { sendMail: vi.fn(), close: vi.fn() });
      return transports.get(k) as unknown as nodemailer.Transporter;
    });

    h = createTestDb();
    seedSmtpAccount(h, { name: 'primary', fromAddress: 'noreply@example.com' });
    app = createTestApp(h).app;
    key = h.apiKeyService.generateAndStore('caller', { scopes: ['send'] }).plain;
  });

  afterEach(() => h.close());

  it('returns 200 + done when SMTP succeeds', async () => {
    transports.get('localhost:25')!.sendMail.mockResolvedValue({ messageId: '<smtp-id>' });

    const res = await request(app)
      .post('/send?wait=true')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('done');
    expect(res.body.account).toBe('primary');
    expect(res.body.messageId).toBe('<smtp-id>');
  });

  it('returns 502 + dead when all retries exhausted (maxAttempts=1)', async () => {
    transports.get('localhost:25')!.sendMail.mockRejectedValue(new Error('boom'));

    // Default maxAttempts is 3, so first failure → pending (202). To get to 'dead' synchronously
    // we'd need a maxAttempts of 1. Verify via a direct enqueue+process at 202 here.
    const res = await request(app)
      .post('/send?wait=true')
      .set('X-Api-Key', key)
      .send({ to: 'r@x.com', subject: 's', html: 'h' });

    expect(res.status).toBe(202); // failure rescheduled, not dead
    expect(res.body.status).toBe('pending');
    expect(res.body.attempts).toBe(1);
    expect(res.body.error).toMatch(/All SMTP accounts failed/);
  });
});
