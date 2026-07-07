import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, type DbClient } from '../../src/db/client';
import { migrateDatabase } from '../../src/db/migrate';
import { SendJobRepository } from '../../src/domain/queue/repository';
import { WebhookDeliveryRepository } from '../../src/domain/webhooks/delivery-repository';
import { BounceRepository } from '../../src/domain/bounces/repository';
import { MigrationJobRepository } from '../../src/domain/migrations/repository';
import { RetentionService } from '../../src/domain/retention/service';
import { createLogger } from '../../src/logger';
import { sendJobs, webhookDeliveries, bounceEvents, migrationJobs } from '../../src/db/schema';
import type {
  SendJobRow,
  WebhookDeliveryRow,
  SendJobStatus,
  BounceEventRow,
  MigrationJobRow,
  MigrationStatus,
} from '../../src/db/schema';
import { randomUUID } from 'node:crypto';

const silentLogger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

const NOW = new Date('2026-06-22T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1_000;
const OLD = new Date(NOW.getTime() - 60 * DAY); // 60 days ago (well past 30d window)
const RECENT = new Date(NOW.getTime() - 5 * DAY); // 5 days ago (inside window)

describe('RetentionService', () => {
  let client: DbClient;
  let sendJobRepo: SendJobRepository;
  let webhookDeliveryRepo: WebhookDeliveryRepository;
  let bounceRepo: BounceRepository;
  let migrationRepo: MigrationJobRepository;
  let service: RetentionService;

  function insertSendJob(status: SendJobStatus, completedAt: Date | null): string {
    const id = randomUUID();
    const row: SendJobRow = {
      id,
      payload: { to: 'a@b.com', subject: 's', html: '<p>h</p>' },
      status,
      attempts: 1,
      maxAttempts: 3,
      nextAttemptAt: NOW,
      lastError: null,
      accountUsed: null,
      messageId: null,
      apiKeyId: null,
      createdAt: OLD,
      startedAt: null,
      completedAt,
    };
    client.db.insert(sendJobs).values(row).run();
    return id;
  }

  function insertWebhookDelivery(
    status: WebhookDeliveryRow['status'],
    completedAt: Date | null,
  ): string {
    const id = randomUUID();
    const row: WebhookDeliveryRow = {
      id,
      webhookId: null,
      event: 'send.completed',
      payload: {},
      status,
      attempts: 1,
      maxAttempts: 5,
      nextAttemptAt: NOW,
      lastResponseStatus: null,
      lastResponseBody: null,
      lastError: null,
      createdAt: OLD,
      startedAt: null,
      completedAt,
    };
    client.db.insert(webhookDeliveries).values(row).run();
    return id;
  }

  function insertBounce(createdAt: Date): string {
    const id = randomUUID();
    const row: BounceEventRow = {
      id,
      sendJobId: null,
      recipient: 'x@y.com',
      type: 'bounce',
      classification: 'hard',
      statusCode: '5.1.1',
      diagnostic: 'no such user',
      originalMessageId: null,
      createdAt,
    };
    client.db.insert(bounceEvents).values(row).run();
    return id;
  }

  function insertMigration(status: MigrationStatus, completedAt: Date | null): string {
    const id = randomUUID();
    const row: MigrationJobRow = {
      id,
      sourceHost: 'imap.example.com',
      sourcePort: 993,
      sourceUser: 'u',
      sourceSsl: 'imaps',
      sourcePasswordEnc: null,
      destAddress: 'd@example.com',
      status,
      log: 'x'.repeat(1000),
      error: null,
      createdAt: OLD,
      startedAt: null,
      completedAt,
    };
    client.db.insert(migrationJobs).values(row).run();
    return id;
  }

  beforeEach(() => {
    client = createDb(':memory:');
    migrateDatabase(client.sqlite);
    sendJobRepo = new SendJobRepository(client.db);
    webhookDeliveryRepo = new WebhookDeliveryRepository(client.db);
    bounceRepo = new BounceRepository(client.db);
    migrationRepo = new MigrationJobRepository(client.db);
    service = new RetentionService(
      sendJobRepo,
      webhookDeliveryRepo,
      bounceRepo,
      migrationRepo,
      silentLogger,
    );
  });

  afterEach(() => {
    client.close();
  });

  it('deletes only old finished rows, keeping pending and recent ones', () => {
    const oldDone = insertSendJob('done', OLD);
    const oldDead = insertSendJob('dead', OLD);
    const recentDone = insertSendJob('done', RECENT);
    const pending = insertSendJob('pending', null);

    const oldDeliveryDone = insertWebhookDelivery('done', OLD);
    const recentDeliveryDone = insertWebhookDelivery('done', RECENT);
    const pendingDelivery = insertWebhookDelivery('pending', null);

    const oldBounce = insertBounce(OLD);
    const recentBounce = insertBounce(RECENT);

    const oldMigrationDone = insertMigration('done', OLD);
    const oldMigrationFailed = insertMigration('failed', OLD);
    const recentMigrationDone = insertMigration('done', RECENT);
    const pendingMigration = insertMigration('pending', null);

    const result = service.prune(30, NOW);

    expect(result).toEqual({
      sendJobs: 2,
      webhookDeliveries: 1,
      bounceEvents: 1,
      migrationJobs: 2,
    });

    // Old finished send jobs gone; recent + pending kept.
    expect(sendJobRepo.findById(oldDone)).toBeUndefined();
    expect(sendJobRepo.findById(oldDead)).toBeUndefined();
    expect(sendJobRepo.findById(recentDone)).toBeDefined();
    expect(sendJobRepo.findById(pending)).toBeDefined();

    // Old finished delivery gone; recent + pending kept.
    expect(webhookDeliveryRepo.findById(oldDeliveryDone)).toBeUndefined();
    expect(webhookDeliveryRepo.findById(recentDeliveryDone)).toBeDefined();
    expect(webhookDeliveryRepo.findById(pendingDelivery)).toBeDefined();

    // Old bounce gone; recent kept.
    expect(bounceRepo.list().map((b) => b.id)).toEqual([recentBounce]);
    expect(oldBounce).toBeDefined();

    // Old terminal migrations gone; recent + pending kept.
    expect(migrationRepo.findById(oldMigrationDone)).toBeUndefined();
    expect(migrationRepo.findById(oldMigrationFailed)).toBeUndefined();
    expect(migrationRepo.findById(recentMigrationDone)).toBeDefined();
    expect(migrationRepo.findById(pendingMigration)).toBeDefined();
  });

  it('is a no-op when retentionDays <= 0', () => {
    const oldDone = insertSendJob('done', OLD);
    const oldDeliveryDone = insertWebhookDelivery('done', OLD);
    const oldBounce = insertBounce(OLD);
    const oldMigration = insertMigration('done', OLD);

    const result = service.prune(0, NOW);

    expect(result).toEqual({
      sendJobs: 0,
      webhookDeliveries: 0,
      bounceEvents: 0,
      migrationJobs: 0,
    });
    expect(sendJobRepo.findById(oldDone)).toBeDefined();
    expect(webhookDeliveryRepo.findById(oldDeliveryDone)).toBeDefined();
    expect(bounceRepo.list()).toHaveLength(1);
    expect(oldBounce).toBeDefined();
    expect(migrationRepo.findById(oldMigration)).toBeDefined();
  });
});
