import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Env } from './env';
import type { Logger } from './logger';
import type { MailSender } from './domain/send/mailer';
import type { ApiKeyService } from './domain/apikeys/service';
import type { DomainService } from './domain/domains/service';
import type { DomainDnsService } from './domain/domains/dns-service';
import type { SmtpAccountService } from './domain/smtp-accounts/service';
import type { MailboxService } from './domain/mailboxes/service';
import type { AliasService } from './domain/aliases/service';
import type { SyncService } from './domain/sync/service';
import type { SendJobService } from './domain/queue/service';
import type { UserRepository } from './domain/users/repository';
import type { UserService } from './domain/users/service';
import type { WebhookService } from './domain/webhooks/service';
import type { FeatureFlagService } from './domain/feature-flags/service';
import type { BackupService } from './domain/backups/service';
import type { StatsService } from './domain/stats/service';
import { healthRouter } from './http/routes/health';
import { metricsRouter } from './http/routes/metrics';
import { adminStatsRouter } from './http/routes/admin/stats';
import { sendRouter } from './http/routes/send';
import { jobsRouter } from './http/routes/jobs';
import { authRouter } from './http/routes/auth';
import { adminApiKeysRouter } from './http/routes/admin/apikeys';
import { adminAliasesRouter } from './http/routes/admin/aliases';
import { adminSyncRouter } from './http/routes/admin/sync';
import { adminDomainsRouter } from './http/routes/admin/domains';
import { adminSmtpAccountsRouter } from './http/routes/admin/smtp-accounts';
import { adminMailboxesRouter } from './http/routes/admin/mailboxes';
import { adminUsersRouter } from './http/routes/admin/users';
import { adminWebhooksRouter } from './http/routes/admin/webhooks';
import { adminFeatureFlagsRouter } from './http/routes/admin/feature-flags';
import { adminBackupsRouter } from './http/routes/admin/backups';
import { createErrorHandler } from './http/middleware/error';
import { createSessionMiddleware } from './http/middleware/session';
import { createAdminAuth } from './http/middleware/admin-auth';

export interface ServerDeps {
  env: Env;
  logger: Logger;
  mailer: MailSender;
  apiKeyService: ApiKeyService;
  domainService: DomainService;
  domainDnsService: DomainDnsService;
  smtpAccountService: SmtpAccountService;
  mailboxService: MailboxService;
  aliasService: AliasService;
  syncService: SyncService;
  sendJobService: SendJobService;
  userRepo: UserRepository;
  userService: UserService;
  webhookService: WebhookService;
  featureFlagService: FeatureFlagService;
  backupService: BackupService;
  statsService: StatsService;
}

export function createServer(deps: ServerDeps): Express {
  const {
    env,
    logger,
    mailer,
    apiKeyService,
    domainService,
    domainDnsService,
    smtpAccountService,
    mailboxService,
    aliasService,
    syncService,
    sendJobService,
    userRepo,
    userService,
    webhookService,
    featureFlagService,
    backupService,
    statsService,
  } = deps;
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
    }),
  );
  app.use('/send', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '256kb' }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('X-Request-Id', existing);
        return existing;
      },
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        if (res.statusCode >= 300) return 'silent';
        return 'info';
      },
      redact: {
        paths: ['req.headers["x-api-key"]', 'req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    }),
  );

  app.use(
    createSessionMiddleware({
      password: env.SESSION_SECRET,
      secure: env.NODE_ENV === 'production',
    }),
  );

  app.use(healthRouter(mailer));
  app.use(metricsRouter({ token: env.METRICS_TOKEN }));
  app.use(sendRouter(mailer, sendJobService, apiKeyService, logger));
  app.use(jobsRouter(sendJobService, apiKeyService, userRepo, logger));

  app.use(authRouter(userService, userRepo));

  const adminAuth = createAdminAuth(apiKeyService, userRepo, logger);
  app.use('/admin/api', adminAuth);
  app.use(adminApiKeysRouter(apiKeyService));
  app.use(adminDomainsRouter(domainService, domainDnsService));
  app.use(adminSmtpAccountsRouter(smtpAccountService));
  app.use(adminMailboxesRouter(mailboxService));
  app.use(adminAliasesRouter(aliasService));
  app.use(adminSyncRouter(syncService));
  app.use(adminUsersRouter(userService));
  app.use(adminWebhooksRouter(webhookService));
  app.use(adminFeatureFlagsRouter(featureFlagService));
  app.use(adminStatsRouter(statsService));
  app.use(
    adminBackupsRouter(backupService, {
      intervalHours: env.BACKUP_INTERVAL_HOURS,
      keep: env.BACKUP_KEEP,
      dir: env.BACKUP_DIR,
      featureFlags: featureFlagService,
    }),
  );

  app.all(/^\/admin\/(?:api|auth)(?:\/.*)?$/, (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const uiDir = join(process.cwd(), 'ui', 'dist');
  if (existsSync(uiDir)) {
    app.use('/admin', express.static(uiDir));
    app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
      res.sendFile(join(uiDir, 'index.html'));
    });
  }

  app.use(createErrorHandler(logger));

  return app;
}
