import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp, TEST_ENV } from '../helpers/server';

describe('mail-client autoconfig', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h, { ...TEST_ENV, MAIL_HOSTNAME: 'mail.example.com' }).app;
    h.domainRepo.create({ name: 'example.com', active: true });
  });

  afterEach(() => h.close());

  it('serves Thunderbird autoconfig for a managed domain', async () => {
    const res = await request(app).get('/mail/config-v1.1.xml?emailaddress=user@example.com');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/xml/);
    expect(res.text).toContain('<hostname>mail.example.com</hostname>');
    expect(res.text).toContain('<username>user@example.com</username>');
    expect(res.text).toContain('<port>993</port>');
    expect(res.text).toContain('<port>587</port>');
  });

  it('serves Thunderbird autoconfig at the .well-known path', async () => {
    const res = await request(app).get(
      '/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=user@example.com',
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('mail.example.com');
  });

  it('serves Outlook Autodiscover from a POSTed email', async () => {
    const body =
      '<?xml version="1.0"?><Autodiscover><Request><EMailAddress>user@example.com</EMailAddress></Request></Autodiscover>';
    const res = await request(app)
      .post('/autodiscover/autodiscover.xml')
      .set('Content-Type', 'text/xml')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Server>mail.example.com</Server>');
    expect(res.text).toContain('<LoginName>user@example.com</LoginName>');
  });

  it('serves an Apple .mobileconfig download', async () => {
    const res = await request(app).get('/mail/mobileconfig?email=user@example.com');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/x-apple-aspen-config');
    expect(res.headers['content-disposition']).toContain('.mobileconfig');
    expect(res.text).toContain('<string>user@example.com</string>');
    expect(res.text).toContain('mail.example.com');
  });

  it('404s for an unmanaged domain', async () => {
    const res = await request(app).get('/mail/config-v1.1.xml?emailaddress=user@unknown.com');
    expect(res.status).toBe(404);
  });
});

describe('mail-client autoconfig (disabled)', () => {
  let h: TestDbHandle;
  let app: Express;

  beforeEach(() => {
    h = createTestDb(); // no MAIL_HOSTNAME
    app = createTestApp(h).app;
    h.domainRepo.create({ name: 'example.com', active: true });
  });

  afterEach(() => h.close());

  it('404s when MAIL_HOSTNAME is unset', async () => {
    const res = await request(app).get('/mail/config-v1.1.xml?emailaddress=user@example.com');
    expect(res.status).toBe(404);
  });
});
