import type { Express } from 'express';
import { createServer } from '../../src/server';
import { createLogger } from '../../src/logger';
import { MailSender } from '../../src/domain/send/mailer';
import { SmtpAccountService } from '../../src/domain/smtp-accounts/service';
import { SendJobService } from '../../src/domain/queue/service';
import { DomainService } from '../../src/domain/domains/service';
import { NginxService } from '../../src/domain/nginx/service';
import { NullNginxReloader } from '../../src/domain/nginx/reloader';
import { BackupService } from '../../src/domain/backups/service';
import { StatsService } from '../../src/domain/stats/service';
import { EngineService } from '../../src/domain/engine/service';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '../../src/env';
import type { TestDbHandle } from './db';

export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3050,
  HOST: '0.0.0.0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: ':memory:',
  DMS_CONTAINER_NAME: 'mailserver',
  DOCKER_SOCKET_PATH: '/var/run/docker.sock',
  NGINX_CONTAINER_NAME: 'nginx',
  NGINX_GENERATED_DIR: './data/nginx-generated',
  NGINX_RELOAD_ENABLED: false,
  SMTP_TLS_REJECT_UNAUTHORIZED: true,
  WEBHOOK_ALLOW_PRIVATE: false,
  PASSWORD_HIBP_ENABLED: false,
  PASSWORD_MIN_LENGTH: 10,
  TRUST_PROXY: 0,
  SESSION_SECRET: 'a'.repeat(64),
  BACKUP_DIR: './data/backups',
  BACKUP_INTERVAL_HOURS: 24,
  BACKUP_KEEP: 7,
  RETENTION_DAYS: 30,
  SPAM_MAILBOX: 'Junk',
  QUARANTINE_RETENTION_DAYS: 30,
  BACKUP_S3_REGION: 'us-east-1',
  BACKUP_S3_PREFIX: 'mailserver/',
};

export interface TestAppHandle {
  app: Express;
  mailer: MailSender;
  sendJobService: SendJobService;
  nginxService: NginxService;
  nginxGeneratedDir: string;
}

export function createTestApp(h: TestDbHandle, env: Env = TEST_ENV): TestAppHandle {
  const logger = createLogger(env);
  const mailer = new MailSender(h.smtpAccountLoader.loadActive(), logger, {
    tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
  });
  const sendJobService = new SendJobService(h.sendJobRepo, mailer, logger, h.webhookService);
  const smtpAccountService = new SmtpAccountService(h.smtpAccountRepo, h.smtpAccountLoader, mailer);
  const nginxGeneratedDir = mkdtempSync(join(tmpdir(), 'mail-api-nginx-'));
  const nginxService = new NginxService(h.domainRepo, {
    generatedDir: nginxGeneratedDir,
    reloader: new NullNginxReloader(logger),
    logger,
  });
  const domainService = new DomainService(
    h.domainRepo,
    h.dms,
    h.featureFlagService,
    logger,
    nginxService,
  );
  const backupService = new BackupService(h.client.sqlite, {
    dir: mkdtempSync(join(tmpdir(), 'mail-api-backups-')),
    keep: env.BACKUP_KEEP,
    logger,
  });
  const statsService = new StatsService(h.client.db);
  const engineService = new EngineService(h.engineClient, {
    containers: ['mailserver', 'nginx', 'mail-api'],
    rspamdUiUrl: null,
  });
  const app = createServer({
    env,
    logger,
    mailer,
    apiKeyService: h.apiKeyService,
    domainService,
    domainDnsService: h.domainDnsService,
    smtpAccountService,
    mailboxService: h.mailboxService,
    aliasService: h.aliasService,
    sieveService: h.sieveService,
    quarantineService: h.quarantineService,
    accessListService: h.accessListService,
    engineService,
    syncService: h.syncService,
    sendJobService,
    userRepo: h.userRepo,
    userService: h.userService,
    webhookService: h.webhookService,
    featureFlagService: h.featureFlagService,
    backupService,
    statsService,
  });
  return { app, mailer, sendJobService, nginxService, nginxGeneratedDir };
}

/** Seeds a basic SMTP account so MailSender has something to work with. */
export function seedSmtpAccount(
  h: TestDbHandle,
  overrides: {
    name?: string;
    priority?: number;
    fromAddress?: string;
    fromName?: string | null;
  } = {},
) {
  return h.smtpAccountRepo.create({
    name: overrides.name ?? 'fake-1',
    host: 'localhost',
    port: 25,
    secure: false,
    fromAddress: overrides.fromAddress ?? 'noreply@example.com',
    fromName: overrides.fromName ?? null,
    priority: overrides.priority ?? 1,
  });
}
