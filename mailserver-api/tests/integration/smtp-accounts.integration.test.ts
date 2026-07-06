import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { MailSender } from '../../src/domain/send/mailer';
import { createTestDb, type TestDbHandle } from '../helpers/db';
import { createTestApp } from '../helpers/server';

describe('/admin/api/smtp-accounts', () => {
  let h: TestDbHandle;
  let app: Express;
  let mailer: MailSender;
  let adminKey: string;

  beforeEach(() => {
    h = createTestDb();
    const handle = createTestApp(h);
    app = handle.app;
    mailer = handle.mailer;
    adminKey = h.apiKeyService.generateAndStore('admin', { scopes: ['admin'] }).plain;
  });

  afterEach(() => h.close());

  describe('POST (create)', () => {
    it('creates an SMTP account and reloads mailer', async () => {
      expect(mailer.accountCount).toBe(0);

      const res = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'primary',
          host: 'mail.example.com',
          port: 587,
          secure: false,
          fromAddress: 'noreply@example.com',
          fromName: 'Mailer',
          priority: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('primary');
      expect(res.body.fromAddress).toBe('noreply@example.com');
      expect(mailer.accountCount).toBe(1);
      expect(mailer.getDefaultFrom()).toBe('"Mailer" <noreply@example.com>');
    });

    it('stores a per-account TLS policy and returns it, defaulting when omitted', async () => {
      const withPolicy = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'strict',
          host: 'mail.example.com',
          port: 587,
          secure: false,
          requireTls: true,
          rejectUnauthorized: true,
          minTlsVersion: 'TLSv1.2',
          fromAddress: 'a@example.com',
          priority: 2,
        });
      expect(withPolicy.status).toBe(201);
      expect(withPolicy.body.requireTls).toBe(true);
      expect(withPolicy.body.rejectUnauthorized).toBe(true);
      expect(withPolicy.body.minTlsVersion).toBe('TLSv1.2');

      // Omitted policy → safe defaults (requireTls false, inherit verification).
      const plain = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'plain',
          host: 'mail.example.com',
          port: 587,
          secure: false,
          fromAddress: 'b@example.com',
          priority: 3,
        });
      expect(plain.body.requireTls).toBe(false);
      expect(plain.body.rejectUnauthorized).toBeNull();
      expect(plain.body.minTlsVersion).toBeNull();
    });

    it('persists env-var indirection without storing secrets', async () => {
      const res = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'with-creds',
          host: 'smtp.relay1.example.com',
          port: 465,
          secure: true,
          userEnvVar: 'MAIL_USER_RELAY1',
          passwordEnvVar: 'MAIL_PASS_RELAY1',
          fromAddress: 'noreply@example.net',
          priority: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.userEnvVar).toBe('MAIL_USER_RELAY1');
      expect(res.body.passwordEnvVar).toBe('MAIL_PASS_RELAY1');

      const stored = h.smtpAccountRepo.findById(res.body.id);
      expect(stored?.userEnvVar).toBe('MAIL_USER_RELAY1');
      expect(stored?.passwordEnvVar).toBe('MAIL_PASS_RELAY1');
    });

    it('rejects invalid fromAddress', async () => {
      const res = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'bad',
          host: 'a',
          port: 25,
          secure: false,
          fromAddress: 'not-an-email',
          priority: 1,
        });
      expect(res.status).toBe(400);
    });

    it('rejects bad env var names (lowercase)', async () => {
      const res = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'bad-env',
          host: 'a',
          port: 25,
          secure: false,
          userEnvVar: 'lowercase_var',
          fromAddress: 'a@b.co',
          priority: 1,
        });
      expect(res.status).toBe(400);
    });

    it('rejects port out of range', async () => {
      const res = await request(app)
        .post('/admin/api/smtp-accounts')
        .set('X-Api-Key', adminKey)
        .send({
          name: 'bad-port',
          host: 'a',
          port: 99999,
          secure: false,
          fromAddress: 'a@b.co',
          priority: 1,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET (list)', () => {
    it('returns accounts ordered by priority', async () => {
      h.smtpAccountRepo.create({
        name: 'second',
        host: 'h',
        port: 25,
        secure: false,
        fromAddress: 's@a.com',
        priority: 2,
      });
      h.smtpAccountRepo.create({
        name: 'first',
        host: 'h',
        port: 25,
        secure: false,
        fromAddress: 'f@a.com',
        priority: 1,
      });

      const res = await request(app).get('/admin/api/smtp-accounts').set('X-Api-Key', adminKey);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('first');
      expect(res.body[1].name).toBe('second');
    });
  });

  describe('PATCH /:id', () => {
    it('updates priority and reloads mailer', async () => {
      const a = h.smtpAccountRepo.create({
        name: 'a',
        host: 'h',
        port: 25,
        secure: false,
        fromAddress: 'a@x.com',
        priority: 1,
      });
      const handle = createTestApp(h);
      const localApp = handle.app;
      const localMailer = handle.mailer;
      expect(localMailer.accountCount).toBe(1);

      const res = await request(localApp)
        .patch(`/admin/api/smtp-accounts/${a.id}`)
        .set('X-Api-Key', adminKey)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(localMailer.accountCount).toBe(0); // reloaded with no active
    });
  });

  describe('DELETE /:id', () => {
    it('deletes account and reloads mailer', async () => {
      const a = h.smtpAccountRepo.create({
        name: 'a',
        host: 'h',
        port: 25,
        secure: false,
        fromAddress: 'a@x.com',
        priority: 1,
      });
      const handle = createTestApp(h);
      const localMailer = handle.mailer;
      expect(localMailer.accountCount).toBe(1);

      const res = await request(handle.app)
        .delete(`/admin/api/smtp-accounts/${a.id}`)
        .set('X-Api-Key', adminKey);

      expect(res.status).toBe(204);
      expect(localMailer.accountCount).toBe(0);
    });
  });
});
