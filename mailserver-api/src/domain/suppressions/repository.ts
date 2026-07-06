import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { suppressions, type SuppressionReason, type SuppressionRow } from '../../db/schema';

export interface UpsertSuppressionInput {
  address: string;
  reason: SuppressionReason;
  source?: string | null;
  note?: string | null;
}

export class SuppressionRepository {
  constructor(private readonly db: Db) {}

  /** Add or update a suppression, keyed by address (idempotent). */
  upsert(input: UpsertSuppressionInput): SuppressionRow {
    const address = input.address.trim().toLowerCase();
    const existing = this.db
      .select()
      .from(suppressions)
      .where(eq(suppressions.address, address))
      .get();
    if (existing) {
      this.db
        .update(suppressions)
        .set({ reason: input.reason, source: input.source ?? null, note: input.note ?? null })
        .where(eq(suppressions.id, existing.id))
        .run();
      return {
        ...existing,
        reason: input.reason,
        source: input.source ?? null,
        note: input.note ?? null,
      };
    }
    const row: SuppressionRow = {
      id: randomUUID(),
      address,
      reason: input.reason,
      source: input.source ?? null,
      note: input.note ?? null,
      createdAt: new Date(),
    };
    this.db.insert(suppressions).values(row).run();
    return row;
  }

  list(limit = 500): SuppressionRow[] {
    return this.db
      .select()
      .from(suppressions)
      .orderBy(desc(suppressions.createdAt))
      .limit(limit)
      .all();
  }

  /** Return the subset of the given (lowercased) addresses that are suppressed. */
  findSuppressed(addresses: string[]): SuppressionRow[] {
    if (addresses.length === 0) return [];
    return this.db
      .select()
      .from(suppressions)
      .where(inArray(suppressions.address, addresses))
      .all();
  }

  delete(id: string): boolean {
    const info = this.db.delete(suppressions).where(eq(suppressions.id, id)).run();
    return info.changes > 0;
  }
}
