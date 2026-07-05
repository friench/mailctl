import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { migrationJobs, type ImapSslMode, type MigrationJobRow } from '../../db/schema';

export interface CreateMigrationInput {
  sourceHost: string;
  sourcePort: number;
  sourceUser: string;
  sourceSsl: ImapSslMode;
  sourcePasswordEnc: string;
  destAddress: string;
}

export class MigrationJobRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateMigrationInput): MigrationJobRow {
    const row: MigrationJobRow = {
      id: randomUUID(),
      sourceHost: input.sourceHost,
      sourcePort: input.sourcePort,
      sourceUser: input.sourceUser,
      sourceSsl: input.sourceSsl,
      sourcePasswordEnc: input.sourcePasswordEnc,
      destAddress: input.destAddress,
      status: 'pending',
      log: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };
    this.db.insert(migrationJobs).values(row).run();
    return row;
  }

  findById(id: string): MigrationJobRow | undefined {
    return this.db.select().from(migrationJobs).where(eq(migrationJobs.id, id)).get();
  }

  list(limit = 100): MigrationJobRow[] {
    return this.db
      .select()
      .from(migrationJobs)
      .orderBy(desc(migrationJobs.createdAt))
      .limit(limit)
      .all();
  }

  /** Atomically claim the oldest pending job, marking it processing. */
  claimNextPending(now: Date = new Date()): MigrationJobRow | null {
    return this.db.transaction((tx) => {
      const next = tx
        .select()
        .from(migrationJobs)
        .where(eq(migrationJobs.status, 'pending'))
        .orderBy(migrationJobs.createdAt)
        .limit(1)
        .get();
      if (!next) return null;
      tx.update(migrationJobs)
        .set({ status: 'processing', startedAt: now })
        .where(and(eq(migrationJobs.id, next.id), eq(migrationJobs.status, 'pending')))
        .run();
      return { ...next, status: 'processing' as const, startedAt: now };
    });
  }

  /** Finish a job: set terminal status + log/error and wipe the stored password. */
  finish(
    id: string,
    status: 'done' | 'failed',
    fields: { log: string; error?: string | null },
    now: Date = new Date(),
  ): void {
    this.db
      .update(migrationJobs)
      .set({
        status,
        log: fields.log,
        error: fields.error ?? null,
        sourcePasswordEnc: null,
        completedAt: now,
      })
      .where(eq(migrationJobs.id, id))
      .run();
  }

  /** Recover jobs stuck in 'processing' after a crash (dsync is idempotent). */
  resetProcessingToPending(): number {
    const info = this.db
      .update(migrationJobs)
      .set({ status: 'pending', startedAt: null })
      .where(eq(migrationJobs.status, 'processing'))
      .run();
    return info.changes;
  }

  delete(id: string): boolean {
    const info = this.db.delete(migrationJobs).where(eq(migrationJobs.id, id)).run();
    return info.changes > 0;
  }
}
