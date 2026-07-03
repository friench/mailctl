import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('GET /admin/api/domains/:id/dns-check', () => {
  let h: TestDbHandle;
  let app: Express;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    app = createTestApp(h).app;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  it('returns core + extended records (A, MX, SPF, DKIM, DMARC, AAAA, PTR, MTA-STS, TLS-RPT, autodiscover) with statuses', async () => {
    const domain = h.domainRepo.create({ name: 'example.com', dkimSelector: 'mail' });

    h.dnsResolver.a.set('mail.example.com', ['203.0.113.10']);
    h.dnsResolver.mx.set('example.com', [{ exchange: 'mail.example.com', priority: 10 }]);
    h.dnsResolver.txt.set('example.com', [['v=spf1 a mx -all']]);
    h.dnsResolver.txt.set('mail._domainkey.example.com', [['v=DKIM1; p=ABCD']]);
    h.dnsResolver.txt.set('_dmarc.example.com', [['v=DMARC1; p=none']]);

    const res = await request(app)
      .get(`/admin/api/domains/${domain.id}/dns-check`)
      .set('X-Api-Key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.domain).toBe('example.com');
    expect(
      res.body.records.map((r: { type: string; status: string }) => `${r.type}:${r.status}`),
    ).toEqual([
      'A:ok',
      'MX:ok',
      'SPF:ok',
      'DKIM:ok',
      'DMARC:ok',
      'AAAA:missing',
      'PTR:missing',
      'MTA-STS:missing',
      'TLS-RPT:missing',
      'AUTODISCOVER:missing',
    ]);
  });

  it('returns 404 for unknown domain id', async () => {
    const res = await request(app)
      .get('/admin/api/domains/00000000-0000-0000-0000-000000000000/dns-check')
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(404);
  });

  it('reports missing records when DNS has no answers', async () => {
    const domain = h.domainRepo.create({ name: 'example.com' });
    const res = await request(app)
      .get(`/admin/api/domains/${domain.id}/dns-check`)
      .set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    const statuses = res.body.records.map((r: { status: string }) => r.status);
    expect(statuses).toContain('missing');
  });

  it('rejects without admin auth', async () => {
    const domain = h.domainRepo.create({ name: 'example.com' });
    const res = await request(app).get(`/admin/api/domains/${domain.id}/dns-check`);
    expect(res.status).toBe(401);
  });

  it('detects DKIM mismatch when DNS key differs from stored', async () => {
    const domain = h.domainRepo.create({
      name: 'example.com',
      dkimSelector: 'mail',
    });
    h.domainRepo.update(domain.id, { dkimPublicKey: 'STORED_KEY' });
    h.dnsResolver.txt.set('mail._domainkey.example.com', [['v=DKIM1; p=DIFFERENT_KEY']]);

    const res = await request(app)
      .get(`/admin/api/domains/${domain.id}/dns-check`)
      .set('X-Api-Key', adminKey);

    const dkim = res.body.records.find((r: { type: string }) => r.type === 'DKIM');
    expect(dkim.status).toBe('mismatch');
  });
});
