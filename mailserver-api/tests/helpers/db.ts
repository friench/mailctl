import { createDb, type DbClient } from '../../src/db/client';
import { migrateDatabase } from '../../src/db/migrate';
import { ApiKeyRepository } from '../../src/domain/apikeys/repository';
import { ApiKeyService } from '../../src/domain/apikeys/service';
import { DomainRepository } from '../../src/domain/domains/repository';
import { DomainDnsService } from '../../src/domain/domains/dns-service';
import { DnsValidator, type DnsLikeResolver } from '../../src/lib/dns-validator';
import type { PasswordValidator } from '../../src/lib/password-policy';
import { SmtpAccountRepository } from '../../src/domain/smtp-accounts/repository';
import { SmtpAccountLoader } from '../../src/domain/smtp-accounts/loader';
import { MailboxRepository } from '../../src/domain/mailboxes/repository';
import { MailboxService } from '../../src/domain/mailboxes/service';
import { AliasRepository } from '../../src/domain/aliases/repository';
import { AliasService } from '../../src/domain/aliases/service';
import { SieveRepository } from '../../src/domain/sieve/repository';
import { SieveService } from '../../src/domain/sieve/service';
import { QuarantineService } from '../../src/domain/quarantine/service';
import { AccessRuleRepository } from '../../src/domain/access-lists/repository';
import { AccessListService } from '../../src/domain/access-lists/service';
import { MigrationJobRepository } from '../../src/domain/migrations/repository';
import { MigrationService } from '../../src/domain/migrations/service';
import { makeSecretBox } from '../../src/lib/secret-box';
import { SyncService } from '../../src/domain/sync/service';
import { SendJobRepository } from '../../src/domain/queue/repository';
import { UserRepository } from '../../src/domain/users/repository';
import { UserService } from '../../src/domain/users/service';
import { WebhookRepository } from '../../src/domain/webhooks/repository';
import { WebhookDeliveryRepository } from '../../src/domain/webhooks/delivery-repository';
import { WebhookService } from '../../src/domain/webhooks/service';
import { FeatureFlagRepository } from '../../src/domain/feature-flags/repository';
import { FeatureFlagService } from '../../src/domain/feature-flags/service';
import { createLogger } from '../../src/logger';
import { FakeDmsClient } from './fake-dms';
import { FakeEngineClient } from './fake-engine';
import { FakeOpsClient } from './fake-ops';
import { FakeMigrator } from './fake-migrator';

const silentLogger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

/** Stub DNS resolver that records lookups and returns canned responses. */
export class StubDnsResolver implements DnsLikeResolver {
  public a = new Map<string, string[]>();
  public aaaa = new Map<string, string[]>();
  public mx = new Map<string, Array<{ exchange: string; priority: number }>>();
  public txt = new Map<string, string[][]>();
  public srv = new Map<
    string,
    Array<{ name: string; port: number; priority: number; weight: number }>
  >();
  public ptr = new Map<string, string[]>();

  async resolve4(hostname: string): Promise<string[]> {
    return this.a.get(hostname) ?? [];
  }
  async resolve6(hostname: string): Promise<string[]> {
    return this.aaaa.get(hostname) ?? [];
  }
  async resolveMx(hostname: string): Promise<Array<{ exchange: string; priority: number }>> {
    return this.mx.get(hostname) ?? [];
  }
  async resolveTxt(hostname: string): Promise<string[][]> {
    return this.txt.get(hostname) ?? [];
  }
  async resolveSrv(
    hostname: string,
  ): Promise<Array<{ name: string; port: number; priority: number; weight: number }>> {
    return this.srv.get(hostname) ?? [];
  }
  async reverse(ip: string): Promise<string[]> {
    return this.ptr.get(ip) ?? [];
  }
}

export interface TestDbHandle {
  client: DbClient;
  apiKeyRepo: ApiKeyRepository;
  apiKeyService: ApiKeyService;
  domainRepo: DomainRepository;
  domainDnsService: DomainDnsService;
  dnsResolver: StubDnsResolver;
  smtpAccountRepo: SmtpAccountRepository;
  smtpAccountLoader: SmtpAccountLoader;
  mailboxRepo: MailboxRepository;
  mailboxService: MailboxService;
  aliasRepo: AliasRepository;
  aliasService: AliasService;
  sieveService: SieveService;
  quarantineService: QuarantineService;
  accessListService: AccessListService;
  migrationService: MigrationService;
  migrator: FakeMigrator;
  syncService: SyncService;
  sendJobRepo: SendJobRepository;
  userRepo: UserRepository;
  userService: UserService;
  webhookRepo: WebhookRepository;
  webhookDeliveryRepo: WebhookDeliveryRepository;
  webhookService: WebhookService;
  featureFlagRepo: FeatureFlagRepository;
  featureFlagService: FeatureFlagService;
  dms: FakeDmsClient;
  engineClient: FakeEngineClient;
  opsClient: FakeOpsClient;
  setFetch: (fn: typeof fetch) => void;
  close: () => void;
}

/** Open in-memory SQLite, run migrations, return wired-up repos + fakes. */
export function createTestDb(
  env: NodeJS.ProcessEnv = {},
  opts: { passwordValidator?: PasswordValidator } = {},
): TestDbHandle {
  const client = createDb(':memory:');
  migrateDatabase(client.sqlite);

  const apiKeyRepo = new ApiKeyRepository(client.db);
  const apiKeyService = new ApiKeyService(apiKeyRepo);
  const domainRepo = new DomainRepository(client.db);
  const smtpAccountRepo = new SmtpAccountRepository(client.db);
  const smtpAccountLoader = new SmtpAccountLoader(smtpAccountRepo, env);
  const mailboxRepo = new MailboxRepository(client.db);
  const dms = new FakeDmsClient();
  const engineClient = new FakeEngineClient();
  const opsClient = new FakeOpsClient();
  const sendJobRepo = new SendJobRepository(client.db);
  const userRepo = new UserRepository(client.db);
  const userService = new UserService(userRepo);
  const webhookRepo = new WebhookRepository(client.db);
  const webhookDeliveryRepo = new WebhookDeliveryRepository(client.db);
  const featureFlagRepo = new FeatureFlagRepository(client.db);
  const featureFlagService = new FeatureFlagService(featureFlagRepo, 0); // disable cache for tests

  let activeFetch: typeof fetch = (() => {
    throw new Error('fetch not stubbed in this test — call h.setFetch(fn)');
  }) as unknown as typeof fetch;

  const fetchProxy: typeof fetch = ((...args) => activeFetch(...args)) as typeof fetch;

  const webhookService = new WebhookService(
    webhookRepo,
    webhookDeliveryRepo,
    silentLogger,
    fetchProxy,
    featureFlagService,
    { allowPrivate: true },
  );
  const mailboxService = new MailboxService(
    mailboxRepo,
    domainRepo,
    dms,
    webhookService,
    opts.passwordValidator,
  );

  const aliasRepo = new AliasRepository(client.db);
  const aliasService = new AliasService(aliasRepo, domainRepo, dms);
  const sieveService = new SieveService(new SieveRepository(client.db), mailboxRepo, dms);
  const quarantineService = new QuarantineService(mailboxRepo, dms, silentLogger);
  const accessListService = new AccessListService(
    new AccessRuleRepository(client.db),
    dms,
    silentLogger,
  );
  const migrator = new FakeMigrator();
  const migrationService = new MigrationService(
    new MigrationJobRepository(client.db),
    migrator,
    mailboxRepo,
    makeSecretBox('a'.repeat(64)),
    silentLogger,
  );
  const syncService = new SyncService(dms, domainRepo, mailboxRepo, aliasRepo, silentLogger);

  const dnsResolver = new StubDnsResolver();
  const dnsValidator = new DnsValidator({ resolver: dnsResolver });
  const domainDnsService = new DomainDnsService(dnsValidator, { ttlMs: 0 });

  return {
    client,
    apiKeyRepo,
    apiKeyService,
    domainRepo,
    domainDnsService,
    dnsResolver,
    smtpAccountRepo,
    smtpAccountLoader,
    mailboxRepo,
    mailboxService,
    aliasRepo,
    aliasService,
    sieveService,
    quarantineService,
    accessListService,
    migrationService,
    migrator,
    syncService,
    sendJobRepo,
    userRepo,
    userService,
    webhookRepo,
    webhookDeliveryRepo,
    webhookService,
    featureFlagRepo,
    featureFlagService,
    dms,
    engineClient,
    opsClient,
    setFetch: (fn) => {
      activeFetch = fn;
    },
    close: () => client.close(),
  };
}
