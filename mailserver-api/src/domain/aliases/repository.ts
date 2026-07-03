import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { aliases, type AliasRow, type Source } from '../../db/schema';

export interface CreateAliasInput {
  address: string;
  target: string;
  domainId?: string | null;
  source?: Source;
  notes?: string | null;
}

export interface UpdateAliasInput {
  target?: string;
  domainId?: string | null;
  source?: Source;
  notes?: string | null;
}

export class AliasRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateAliasInput): AliasRow {
    const row: AliasRow = {
      id: randomUUID(),
      address: input.address,
      target: input.target,
      domainId: input.domainId ?? null,
      source: input.source ?? 'panel',
      notes: input.notes ?? null,
      lastSyncedAt: null,
      createdAt: new Date(),
    };
    this.db.insert(aliases).values(row).run();
    return row;
  }

  findById(id: string): AliasRow | undefined {
    return this.db.select().from(aliases).where(eq(aliases.id, id)).get();
  }

  findByAddress(address: string): AliasRow | undefined {
    return this.db.select().from(aliases).where(eq(aliases.address, address)).get();
  }

  list(): AliasRow[] {
    return this.db.select().from(aliases).all();
  }

  update(id: string, input: UpdateAliasInput): AliasRow | undefined {
    const updates: Partial<AliasRow> = {};
    if (input.target !== undefined) updates.target = input.target;
    if (input.domainId !== undefined) updates.domainId = input.domainId;
    if (input.source !== undefined) updates.source = input.source;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (Object.keys(updates).length === 0) return this.findById(id);
    this.db.update(aliases).set(updates).where(eq(aliases.id, id)).run();
    return this.findById(id);
  }

  touchSync(id: string, when: Date = new Date()): void {
    this.db.update(aliases).set({ lastSyncedAt: when }).where(eq(aliases.id, id)).run();
  }

  delete(id: string): boolean {
    const info = this.db.delete(aliases).where(eq(aliases.id, id)).run();
    return info.changes > 0;
  }
}
