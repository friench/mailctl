import { loadEnv } from './env';
import { createLogger } from './logger';
import { createDb } from './db/client';
import { migrateDatabase } from './db/migrate';
import { ApiKeyRepository } from './domain/apikeys/repository';
import { ApiKeyService } from './domain/apikeys/service';
import { DomainRepository } from './domain/domains/repository';
import { DomainService } from './domain/domains/service';
import { DomainDnsService } from './domain/domains/dns-service';
import { DnsValidator } from './lib/dns-validator';
import { SmtpAccountRepository } from './domain/smtp-accounts/repository';
import { SmtpAccountLoader } from './domain/smtp-accounts/loader';
import { SmtpAccountService } from './domain/smtp-accounts/service';
import { MailSender } from './domain/send/mailer';
import { MailboxRepository } from './domain/mailboxes/repository';
import { MailboxService } from './domain/mailboxes/service';
import { PolicyPasswordValidator } from './lib/password-policy';
import { DockerodeDmsClient } from './domain/mailboxes/dockerode-dms-client';
import { AliasRepository } from './domain/aliases/repository';
import { SieveRepository } from './domain/sieve/repository';
import { SieveService } from './domain/sieve/service';
import { QuarantineService } from './domain/quarantine/service';
import { AccessRuleRepository } from './domain/access-lists/repository';
import { AccessListService } from './domain/access-lists/service';
import { DockerodeEngineClient } from './domain/engine/engine-client';
import { EngineService } from './domain/engine/service';
import { DockerodeOpsClient } from './domain/ops/ops-client';
import { OpsService } from './domain/ops/service';
import { AliasService } from './domain/aliases/service';
import { SyncService } from './domain/sync/service';
import { SendJobRepository } from './domain/queue/repository';
import { SendJobService } from './domain/queue/service';
import { UserRepository } from './domain/users/repository';
import { UserService } from './domain/users/service';
import { WebhookRepository } from './domain/webhooks/repository';
import { WebhookDeliveryRepository } from './domain/webhooks/delivery-repository';
import { WebhookService } from './domain/webhooks/service';
import { NginxService } from './domain/nginx/service';
import { DockerodeNginxReloader, NullNginxReloader } from './domain/nginx/reloader';
import { FeatureFlagRepository } from './domain/feature-flags/repository';
import { FeatureFlagService } from './domain/feature-flags/service';
import { BackupService } from './domain/backups/service';
import { RetentionService } from './domain/retention/service';
import { StatsService } from './domain/stats/service';
import { SendWorker } from './workers/send-worker';
import { WebhookWorker } from './workers/webhook-worker';
import { SyncWorker } from './workers/sync-worker';
import { BackupWorker } from './workers/backup-worker';
import { RetentionWorker } from './workers/retention-worker';
import { QuarantineRetentionWorker } from './workers/quarantine-retention-worker';
import { TempAliasWorker } from './workers/temp-alias-worker';
import { createServer } from './server';

const env = loadEnv();
const logger = createLogger(env);

const dbClient = createDb(env.DATABASE_URL);
migrateDatabase(dbClient.sqlite, { logger });
logger.info({ databaseUrl: env.DATABASE_URL }, 'Database initialized');

const apiKeyRepo = new ApiKeyRepository(dbClient.db);
const apiKeyService = new ApiKeyService(apiKeyRepo);

const userRepo = new UserRepository(dbClient.db);
const userService = new UserService(userRepo);

const domainRepo = new DomainRepository(dbClient.db);
const dnsValidator = new DnsValidator();
const domainDnsService = new DomainDnsService(dnsValidator);
const smtpAccountRepo = new SmtpAccountRepository(dbClient.db);
const smtpAccountLoader = new SmtpAccountLoader(smtpAccountRepo);

const mailer = new MailSender(smtpAccountLoader.loadActive(), logger, {
  tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
});
if (mailer.accountCount === 0) {
  logger.warn('No active SMTP accounts. Add via POST /admin/api/smtp-accounts.');
}

const smtpAccountService = new SmtpAccountService(smtpAccountRepo, smtpAccountLoader, mailer);

const dmsClient = new DockerodeDmsClient({
  socketPath: env.DOCKER_SOCKET_PATH,
  containerName: env.DMS_CONTAINER_NAME,
  logger,
  spamMailbox: env.SPAM_MAILBOX,
});
const mailboxRepo = new MailboxRepository(dbClient.db);

const featureFlagRepo = new FeatureFlagRepository(dbClient.db);
const featureFlagService = new FeatureFlagService(featureFlagRepo);

const webhookRepo = new WebhookRepository(dbClient.db);
const webhookDeliveryRepo = new WebhookDeliveryRepository(dbClient.db);
const webhookService = new WebhookService(
  webhookRepo,
  webhookDeliveryRepo,
  logger,
  globalThis.fetch,
  featureFlagService,
  { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE },
);
webhookService.recoverStuckDeliveries();

const passwordValidator = new PolicyPasswordValidator({
  hibp: env.PASSWORD_HIBP_ENABLED,
  minLength: env.PASSWORD_MIN_LENGTH,
});
const mailboxService = new MailboxService(
  mailboxRepo,
  domainRepo,
  dmsClient,
  webhookService,
  passwordValidator,
);

const aliasRepo = new AliasRepository(dbClient.db);
const aliasService = new AliasService(aliasRepo, domainRepo, dmsClient);
const sieveRepo = new SieveRepository(dbClient.db);
const sieveService = new SieveService(sieveRepo, mailboxRepo, dmsClient);
const quarantineService = new QuarantineService(mailboxRepo, dmsClient, logger);
const accessListService = new AccessListService(
  new AccessRuleRepository(dbClient.db),
  dmsClient,
  logger,
);

const engineContainers = env.ENGINE_CONTAINERS
  ? env.ENGINE_CONTAINERS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [env.DMS_CONTAINER_NAME, env.NGINX_CONTAINER_NAME, 'mail-api'];
const engineService = new EngineService(
  new DockerodeEngineClient({
    socketPath: env.DOCKER_SOCKET_PATH,
    dmsContainerName: env.DMS_CONTAINER_NAME,
    logger,
  }),
  { containers: engineContainers, rspamdUiUrl: env.RSPAMD_UI_URL ?? null },
);

const opsService = new OpsService(
  new DockerodeOpsClient({
    socketPath: env.DOCKER_SOCKET_PATH,
    dmsContainerName: env.DMS_CONTAINER_NAME,
    mailLogPath: env.MAIL_LOG_PATH,
    logger,
  }),
);
const syncService = new SyncService(dmsClient, domainRepo, mailboxRepo, aliasRepo, logger);

const nginxReloader = env.NGINX_RELOAD_ENABLED
  ? new DockerodeNginxReloader({
      socketPath: env.DOCKER_SOCKET_PATH,
      containerName: env.NGINX_CONTAINER_NAME,
      logger,
    })
  : new NullNginxReloader(logger);
const nginxService = new NginxService(domainRepo, {
  generatedDir: env.NGINX_GENERATED_DIR,
  reloader: nginxReloader,
  logger,
});
nginxService.regenerate().catch((err) => logger.error({ err }, 'Initial nginx regenerate failed'));

const domainService = new DomainService(
  domainRepo,
  dmsClient,
  featureFlagService,
  logger,
  nginxService,
);

const sendJobRepo = new SendJobRepository(dbClient.db);
const sendJobService = new SendJobService(sendJobRepo, mailer, logger, webhookService);
sendJobService.recoverStuckJobs();

const backupS3 =
  env.BACKUP_S3_BUCKET && env.BACKUP_S3_ACCESS_KEY_ID && env.BACKUP_S3_SECRET_ACCESS_KEY
    ? {
        endpoint: env.BACKUP_S3_ENDPOINT,
        region: env.BACKUP_S3_REGION,
        bucket: env.BACKUP_S3_BUCKET,
        accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
        prefix: env.BACKUP_S3_PREFIX,
      }
    : undefined;
const backupService = new BackupService(dbClient.sqlite, {
  dir: env.BACKUP_DIR,
  keep: env.BACKUP_KEEP,
  s3: backupS3,
  logger,
});

const retentionService = new RetentionService(sendJobRepo, webhookDeliveryRepo, logger);

const statsService = new StatsService(dbClient.db);

const sendWorker = new SendWorker(sendJobService, logger, { flags: featureFlagService });
sendWorker.start();

const webhookWorker = new WebhookWorker(webhookService, logger, { flags: featureFlagService });
webhookWorker.start();

const syncWorker = new SyncWorker(syncService, webhookService, logger, {
  flags: featureFlagService,
});
syncWorker.start();

const backupWorker = new BackupWorker(backupService, logger, {
  intervalMs: env.BACKUP_INTERVAL_HOURS * 60 * 60 * 1_000,
  flags: featureFlagService,
});
backupWorker.start();

const retentionWorker = new RetentionWorker(retentionService, logger, {
  retentionDays: env.RETENTION_DAYS,
});
retentionWorker.start();

const tempAliasWorker = new TempAliasWorker(aliasService, logger);
tempAliasWorker.start();

const quarantineRetentionWorker = new QuarantineRetentionWorker(
  quarantineService,
  mailboxRepo,
  logger,
  { retentionDays: env.QUARANTINE_RETENTION_DAYS, flags: featureFlagService },
);
quarantineRetentionWorker.start();

async function bootstrapAdmin(): Promise<void> {
  if (userRepo.count() > 0) return;
  if (!env.INITIAL_ADMIN_EMAIL || !env.INITIAL_ADMIN_PASSWORD) {
    logger.warn(
      'No users exist. Set INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD or run `pnpm create-admin`.',
    );
    return;
  }
  try {
    const user = await userService.create(env.INITIAL_ADMIN_EMAIL, env.INITIAL_ADMIN_PASSWORD);
    logger.info({ email: user.email }, 'Bootstrapped initial admin user from env');
  } catch (err) {
    logger.error({ err }, 'Failed to bootstrap initial admin user');
  }
}

bootstrapAdmin().catch((err) => logger.error({ err }, 'Bootstrap admin failed'));

const app = createServer({
  env,
  logger,
  mailer,
  apiKeyService,
  domainService,
  domainDnsService,
  smtpAccountService,
  mailboxService,
  aliasService,
  sieveService,
  quarantineService,
  accessListService,
  engineService,
  opsService,
  syncService,
  sendJobService,
  userRepo,
  userService,
  webhookService,
  featureFlagService,
  backupService,
  statsService,
});

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ port: env.PORT, host: env.HOST }, 'mail-api listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown initiated');
  await Promise.all([
    sendWorker.stop(),
    webhookWorker.stop(),
    syncWorker.stop(),
    backupWorker.stop(),
    retentionWorker.stop(),
    tempAliasWorker.stop(),
    quarantineRetentionWorker.stop(),
  ]);
  server.close(() => {
    logger.info('HTTP server closed');
    try {
      dbClient.close();
      logger.info('Database closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Shutdown timeout, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
