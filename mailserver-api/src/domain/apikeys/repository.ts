import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { apiKeys, type ApiKeyRow } from '../../db/schema';

export interface CreateApiKeyInput {
  name: string;
  hash: string;
  prefix: string;
  scopes?: string[];
  expiresAt?: Date | null;
  createdByUserId?: string | null;
}

export class ApiKeyRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateApiKeyInput): ApiKeyRow {
    const now = new Date();
    const row: ApiKeyRow = {
      id: randomUUID(),
      name: input.name,
      hash: input.hash,
      prefix: input.prefix,
      scopes: input.scopes ?? [],
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
    };
    this.db.insert(apiKeys).values(row).run();
    return row;
  }

  findByPrefix(prefix: string): ApiKeyRow | undefined {
    return this.db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix)).get();
  }

  findById(id: string): ApiKeyRow | undefined {
    return this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  }

  list(): ApiKeyRow[] {
    return this.db.select().from(apiKeys).all();
  }

  revoke(id: string, when: Date = new Date()): void {
    this.db.update(apiKeys).set({ revokedAt: when }).where(eq(apiKeys.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
  }

  touchLastUsed(id: string, when: Date = new Date()): void {
    this.db.update(apiKeys).set({ lastUsedAt: when }).where(eq(apiKeys.id, id)).run();
  }
}
