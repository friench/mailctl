import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { domains, type DomainRow, type Source } from '../../db/schema';

export interface CreateDomainInput {
  name: string;
  dkimSelector?: string | null;
  dkimPublicKey?: string | null;
  dkimStatus?: string | null;
  source?: Source;
  active?: boolean;
  notes?: string | null;
}

export interface UpdateDomainInput {
  dkimSelector?: string | null;
  dkimPublicKey?: string | null;
  dkimStatus?: string | null;
  source?: Source;
  active?: boolean;
  notes?: string | null;
}

export class DomainRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateDomainInput): DomainRow {
    const row: DomainRow = {
      id: randomUUID(),
      name: input.name,
      dkimSelector: input.dkimSelector ?? null,
      dkimPublicKey: input.dkimPublicKey ?? null,
      dkimStatus: input.dkimStatus ?? null,
      source: input.source ?? 'panel',
      lastSyncedAt: null,
      active: input.active ?? true,
      notes: input.notes ?? null,
      createdAt: new Date(),
    };
    this.db.insert(domains).values(row).run();
    return row;
  }

  findById(id: string): DomainRow | undefined {
    return this.db.select().from(domains).where(eq(domains.id, id)).get();
  }

  findByName(name: string): DomainRow | undefined {
    return this.db.select().from(domains).where(eq(domains.name, name)).get();
  }

  list(): DomainRow[] {
    return this.db.select().from(domains).all();
  }

  update(id: string, input: UpdateDomainInput): DomainRow | undefined {
    const updates: Partial<DomainRow> = {};
    if (input.dkimSelector !== undefined) updates.dkimSelector = input.dkimSelector;
    if (input.dkimPublicKey !== undefined) updates.dkimPublicKey = input.dkimPublicKey;
    if (input.dkimStatus !== undefined) updates.dkimStatus = input.dkimStatus;
    if (input.source !== undefined) updates.source = input.source;
    if (input.active !== undefined) updates.active = input.active;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (Object.keys(updates).length === 0) return this.findById(id);

    this.db.update(domains).set(updates).where(eq(domains.id, id)).run();
    return this.findById(id);
  }

  touchSync(id: string, when: Date = new Date()): void {
    this.db.update(domains).set({ lastSyncedAt: when }).where(eq(domains.id, id)).run();
  }

  delete(id: string): boolean {
    const info = this.db.delete(domains).where(eq(domains.id, id)).run();
    return info.changes > 0;
  }
}
