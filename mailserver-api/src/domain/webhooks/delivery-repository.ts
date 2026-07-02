import { and, asc, desc, eq, inArray, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { webhookDeliveries, type WebhookDeliveryRow } from '../../db/schema';

export interface CreateWebhookDeliveryInput {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export class WebhookDeliveryRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateWebhookDeliveryInput): WebhookDeliveryRow {
    const now = new Date();
    const row: WebhookDeliveryRow = {
      id: randomUUID(),
      webhookId: input.webhookId,
      event: input.event,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextAttemptAt: input.nextAttemptAt ?? now,
      lastResponseStatus: null,
      lastResponseBody: null,
      lastError: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    this.db.insert(webhookDeliveries).values(row).run();
    return row;
  }

  findById(id: string): WebhookDeliveryRow | undefined {
    return this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).get();
  }

  listByWebhook(webhookId: string, limit = 50): WebhookDeliveryRow[] {
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
      .all();
  }

  /** Atomically claim the next pending delivery whose nextAttemptAt is in the past. */
  claimNextPending(now: Date): WebhookDeliveryRow | null {
    return this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now)),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(1)
        .get();
      if (!row) return null;

      const newAttempts = row.attempts + 1;
      tx.update(webhookDeliveries)
        .set({ status: 'processing', startedAt: now, attempts: newAttempts })
        .where(eq(webhookDeliveries.id, row.id))
        .run();
      return { ...row, status: 'processing' as const, startedAt: now, attempts: newAttempts };
    });
  }

  /** Atomically claim a specific delivery (used by `webhook test` endpoint). */
  claimById(id: string, now: Date): WebhookDeliveryRow | null {
    return this.db.transaction((tx) => {
      const row = tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).get();
      if (!row || row.status !== 'pending') return null;
      const newAttempts = row.attempts + 1;
      tx.update(webhookDeliveries)
        .set({ status: 'processing', startedAt: now, attempts: newAttempts })
        .where(eq(webhookDeliveries.id, id))
        .run();
      return { ...row, status: 'processing' as const, startedAt: now, attempts: newAttempts };
    });
  }

  markDone(id: string, responseStatus: number, responseBody: string, now: Date = new Date()): void {
    this.db
      .update(webhookDeliveries)
      .set({
        status: 'done',
        lastResponseStatus: responseStatus,
        lastResponseBody: responseBody,
        completedAt: now,
      })
      .where(eq(webhookDeliveries.id, id))
      .run();
  }

  markDead(
    id: string,
    errorMessage: string,
    responseStatus: number | null,
    now: Date = new Date(),
  ): void {
    this.db
      .update(webhookDeliveries)
      .set({
        status: 'dead',
        lastError: errorMessage,
        lastResponseStatus: responseStatus,
        completedAt: now,
      })
      .where(eq(webhookDeliveries.id, id))
      .run();
  }

  rescheduleForRetry(
    id: string,
    errorMessage: string,
    responseStatus: number | null,
    nextAttemptAt: Date,
  ): void {
    this.db
      .update(webhookDeliveries)
      .set({
        status: 'pending',
        lastError: errorMessage,
        lastResponseStatus: responseStatus,
        nextAttemptAt,
      })
      .where(eq(webhookDeliveries.id, id))
      .run();
  }

  /** Delete finished (done/dead) deliveries whose completedAt is before the cutoff. Returns rows removed. */
  deleteFinishedBefore(cutoff: Date): number {
    return this.db
      .delete(webhookDeliveries)
      .where(
        and(
          inArray(webhookDeliveries.status, ['done', 'dead']),
          lt(webhookDeliveries.completedAt, cutoff),
        ),
      )
      .run().changes;
  }

  resetProcessingToPending(): number {
    return this.db
      .update(webhookDeliveries)
      .set({ status: 'pending' })
      .where(eq(webhookDeliveries.status, 'processing'))
      .run().changes;
  }
}
