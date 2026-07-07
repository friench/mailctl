import { desc, eq, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import {
  bounceEvents,
  type BounceClassificationType,
  type BounceEventRow,
  type BounceType,
} from '../../db/schema';

export interface CreateBounceInput {
  sendJobId?: string | null;
  recipient: string;
  type?: BounceType;
  classification?: BounceClassificationType;
  statusCode?: string | null;
  diagnostic?: string | null;
  originalMessageId?: string | null;
}

export class BounceRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateBounceInput): BounceEventRow {
    const row: BounceEventRow = {
      id: randomUUID(),
      sendJobId: input.sendJobId ?? null,
      recipient: input.recipient,
      type: input.type ?? 'bounce',
      classification: input.classification ?? 'unknown',
      statusCode: input.statusCode ?? null,
      diagnostic: input.diagnostic ?? null,
      originalMessageId: input.originalMessageId ?? null,
      createdAt: new Date(),
    };
    this.db.insert(bounceEvents).values(row).run();
    return row;
  }

  list(limit = 200): BounceEventRow[] {
    return this.db
      .select()
      .from(bounceEvents)
      .orderBy(desc(bounceEvents.createdAt))
      .limit(limit)
      .all();
  }

  listForJob(sendJobId: string): BounceEventRow[] {
    return this.db
      .select()
      .from(bounceEvents)
      .where(eq(bounceEvents.sendJobId, sendJobId))
      .orderBy(desc(bounceEvents.createdAt))
      .all();
  }

  /** Delete bounce events recorded before `cutoff`. Returns the row count. */
  deleteBefore(cutoff: Date): number {
    return this.db.delete(bounceEvents).where(lt(bounceEvents.createdAt, cutoff)).run().changes;
  }
}
