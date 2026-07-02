import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { featureFlags, type FeatureFlagRow } from '../../db/schema';

export class FeatureFlagRepository {
  constructor(private readonly db: Db) {}

  findByKey(key: string): FeatureFlagRow | undefined {
    return this.db.select().from(featureFlags).where(eq(featureFlags.key, key)).get();
  }

  list(): FeatureFlagRow[] {
    return this.db.select().from(featureFlags).all();
  }

  /** Upsert: insert if missing, update otherwise. */
  upsert(key: string, enabled: boolean, when: Date = new Date()): FeatureFlagRow {
    this.db
      .insert(featureFlags)
      .values({ key, enabled, updatedAt: when })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedAt: when },
      })
      .run();
    const row = this.findByKey(key);
    if (!row) throw new Error(`Failed to upsert feature flag: ${key}`);
    return row;
  }

  delete(key: string): boolean {
    const info = this.db.delete(featureFlags).where(eq(featureFlags.key, key)).run();
    return info.changes > 0;
  }
}

// Re-export sql for use elsewhere if needed (avoids unused-import warnings during refactors).
export const _sql = sql;
