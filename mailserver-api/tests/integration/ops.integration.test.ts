import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/ops', () => {
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
      (await request(app).get('/admin/api/ops/queue').set('X-Api-Key', nonAdminKey)).status,
    ).toBe(403);
  });

  describe('logs', () => {
    beforeEach(() => {
      h.opsClient.log = ['jul 1 warn one', 'jul 1 ok two', 'jul 1 WARN three'].join('\n');
    });

    it('returns log lines', async () => {
      const res = await request(app).get('/admin/api/ops/logs').set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body.lines).toHaveLength(3);
      expect(res.body.query).toBeNull();
    });

    it('filters by query case-insensitively', async () => {
      const res = await request(app).get('/admin/api/ops/logs?q=warn').set('X-Api-Key', adminKey);
      expect(res.body.lines).toEqual(['jul 1 warn one', 'jul 1 WARN three']);
      expect(res.body.query).toBe('warn');
    });

    it('caps to the requested line count', async () => {
      const res = await request(app).get('/admin/api/ops/logs?lines=1').set('X-Api-Key', adminKey);
      expect(res.body.lines).toEqual(['jul 1 WARN three']);
    });
  });

  it('returns the mail queue', async () => {
    h.opsClient.queue = {
      entries: [
        {
          queueId: 'ABC123',
          sizeBytes: 1234,
          arrivalTime: 'Tue Jul 1 12:00:00',
          sender: 's@example.org',
          status: 'deferred',
          reason: 'connection timed out',
          recipients: ['r@dest.com'],
        },
      ],
      summary: '1 Kbytes in 1 Request.',
    };
    const res = await request(app).get('/admin/api/ops/queue').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].queueId).toBe('ABC123');
    expect(res.body.summary).toBe('1 Kbytes in 1 Request.');
  });

  it('returns active sessions', async () => {
    h.opsClient.who = [
      { user: 'user@example.org', connections: 2, proto: 'imap', ips: ['10.0.0.1'] },
    ];
    const res = await request(app).get('/admin/api/ops/sessions').set('X-Api-Key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body[0].user).toBe('user@example.org');
    expect(res.body[0].proto).toBe('imap');
  });
});
