import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, type DbClient } from '../../src/db/client';
import { migrateDatabase } from '../../src/db/migrate';
import { SendJobRepository } from '../../src/domain/queue/repository';
import { WebhookDeliveryRepository } from '../../src/domain/webhooks/delivery-repository';
import { RetentionService } from '../../src/domain/retention/service';
import { createLogger } from '../../src/logger';
import { sendJobs, webhookDeliveries } from '../../src/db/schema';
import type { SendJobRow, WebhookDeliveryRow, SendJobStatus } from '../../src/db/schema';
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

  beforeEach(() => {
    client = createDb(':memory:');
    migrateDatabase(client.sqlite);
    sendJobRepo = new SendJobRepository(client.db);
    webhookDeliveryRepo = new WebhookDeliveryRepository(client.db);
    service = new RetentionService(sendJobRepo, webhookDeliveryRepo, silentLogger);
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

    const result = service.prune(30, NOW);

    expect(result).toEqual({ sendJobs: 2, webhookDeliveries: 1 });

    // Old finished send jobs gone
    expect(sendJobRepo.findById(oldDone)).toBeUndefined();
    expect(sendJobRepo.findById(oldDead)).toBeUndefined();
    // Recent + pending kept
    expect(sendJobRepo.findById(recentDone)).toBeDefined();
    expect(sendJobRepo.findById(pending)).toBeDefined();

    // Old finished delivery gone
    expect(webhookDeliveryRepo.findById(oldDeliveryDone)).toBeUndefined();
    // Recent + pending kept
    expect(webhookDeliveryRepo.findById(recentDeliveryDone)).toBeDefined();
    expect(webhookDeliveryRepo.findById(pendingDelivery)).toBeDefined();
  });

  it('is a no-op when retentionDays <= 0', () => {
    const oldDone = insertSendJob('done', OLD);
    const oldDeliveryDone = insertWebhookDelivery('done', OLD);

    const result = service.prune(0, NOW);

    expect(result).toEqual({ sendJobs: 0, webhookDeliveries: 0 });
    expect(sendJobRepo.findById(oldDone)).toBeDefined();
    expect(webhookDeliveryRepo.findById(oldDeliveryDone)).toBeDefined();
  });
});
