import { and, asc, desc, eq, inArray, isNull, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { sendJobs, type SendJobPayload, type SendJobRow } from '../../db/schema';

export interface CreateSendJobInput {
  payload: SendJobPayload;
  apiKeyId?: string | null;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export interface ListSendJobsOptions {
  apiKeyId?: string | null;
  limit?: number;
}

export class SendJobRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateSendJobInput): SendJobRow {
    const now = new Date();
    const row: SendJobRow = {
      id: randomUUID(),
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextAttemptAt: input.nextAttemptAt ?? now,
      lastError: null,
      accountUsed: null,
      messageId: null,
      apiKeyId: input.apiKeyId ?? null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    this.db.insert(sendJobs).values(row).run();
    return row;
  }

  findById(id: string): SendJobRow | undefined {
    return this.db.select().from(sendJobs).where(eq(sendJobs.id, id)).get();
  }

  /** Correlate a bounce back to its send job via the SMTP Message-ID. */
  findByMessageId(messageId: string): SendJobRow | undefined {
    return this.db.select().from(sendJobs).where(eq(sendJobs.messageId, messageId)).get();
  }

  list(opts: ListSendJobsOptions = {}): SendJobRow[] {
    const limit = opts.limit ?? 100;
    const base = this.db.select().from(sendJobs);

    if (opts.apiKeyId === undefined) {
      return base.orderBy(desc(sendJobs.createdAt)).limit(limit).all();
    }
    const condition =
      opts.apiKeyId === null ? isNull(sendJobs.apiKeyId) : eq(sendJobs.apiKeyId, opts.apiKeyId);
    return base.where(condition).orderBy(desc(sendJobs.createdAt)).limit(limit).all();
  }

  /** Atomically pick the oldest pending job whose nextAttemptAt is in the past, mark it processing. */
  claimNextPending(now: Date): SendJobRow | null {
    return this.db.transaction((tx) => {
      const job = tx
        .select()
        .from(sendJobs)
        .where(and(eq(sendJobs.status, 'pending'), lte(sendJobs.nextAttemptAt, now)))
        .orderBy(asc(sendJobs.nextAttemptAt))
        .limit(1)
        .get();
      if (!job) return null;

      const newAttempts = job.attempts + 1;
      tx.update(sendJobs)
        .set({ status: 'processing', startedAt: now, attempts: newAttempts })
        .where(eq(sendJobs.id, job.id))
        .run();

      return { ...job, status: 'processing' as const, startedAt: now, attempts: newAttempts };
    });
  }

  /** Atomically claim a specific job (used for synchronous `?wait=true`). */
  claimById(id: string, now: Date): SendJobRow | null {
    return this.db.transaction((tx) => {
      const job = tx.select().from(sendJobs).where(eq(sendJobs.id, id)).get();
      if (!job || job.status !== 'pending') return null;

      const newAttempts = job.attempts + 1;
      tx.update(sendJobs)
        .set({ status: 'processing', startedAt: now, attempts: newAttempts })
        .where(eq(sendJobs.id, id))
        .run();

      return { ...job, status: 'processing' as const, startedAt: now, attempts: newAttempts };
    });
  }

  markDone(id: string, info: { account: string; messageId: string }, now: Date = new Date()): void {
    this.db
      .update(sendJobs)
      .set({
        status: 'done',
        accountUsed: info.account,
        messageId: info.messageId,
        completedAt: now,
      })
      .where(eq(sendJobs.id, id))
      .run();
  }

  markDead(id: string, errorMessage: string, now: Date = new Date()): void {
    this.db
      .update(sendJobs)
      .set({ status: 'dead', lastError: errorMessage, completedAt: now })
      .where(eq(sendJobs.id, id))
      .run();
  }

  /** Reschedule a job back to pending after a transient failure. */
  rescheduleForRetry(id: string, errorMessage: string, nextAttemptAt: Date): void {
    this.db
      .update(sendJobs)
      .set({ status: 'pending', lastError: errorMessage, nextAttemptAt })
      .where(eq(sendJobs.id, id))
      .run();
  }

  /** Delete finished (done/dead) jobs whose completedAt is before the cutoff. Returns rows removed. */
  deleteFinishedBefore(cutoff: Date): number {
    return this.db
      .delete(sendJobs)
      .where(and(inArray(sendJobs.status, ['done', 'dead']), lt(sendJobs.completedAt, cutoff)))
      .run().changes;
  }

  /** Reset all 'processing' jobs back to pending. Run on startup to recover from crashes. */
  resetProcessingToPending(): number {
    const info = this.db
      .update(sendJobs)
      .set({ status: 'pending' })
      .where(eq(sendJobs.status, 'processing'))
      .run();
    return info.changes;
  }
}
