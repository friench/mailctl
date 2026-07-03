import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { mailboxes, type MailboxRow, type Source } from '../../db/schema';

export interface CreateMailboxInput {
  address: string;
  domainId: string;
  quotaMb?: number | null;
  source?: Source;
  externallyManaged?: boolean;
  active?: boolean;
  notes?: string | null;
}

export interface UpdateMailboxInput {
  quotaMb?: number | null;
  active?: boolean;
  notes?: string | null;
}

export class MailboxRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateMailboxInput): MailboxRow {
    const row: MailboxRow = {
      id: randomUUID(),
      address: input.address,
      domainId: input.domainId,
      quotaMb: input.quotaMb ?? null,
      source: input.source ?? 'panel',
      externallyManaged: input.externallyManaged ?? false,
      active: input.active ?? true,
      notes: input.notes ?? null,
      lastSyncedAt: null,
      createdAt: new Date(),
    };
    this.db.insert(mailboxes).values(row).run();
    return row;
  }

  findById(id: string): MailboxRow | undefined {
    return this.db.select().from(mailboxes).where(eq(mailboxes.id, id)).get();
  }

  findByAddress(address: string): MailboxRow | undefined {
    return this.db.select().from(mailboxes).where(eq(mailboxes.address, address)).get();
  }

  list(): MailboxRow[] {
    return this.db.select().from(mailboxes).all();
  }

  update(id: string, input: UpdateMailboxInput): MailboxRow | undefined {
    if (Object.keys(input).length === 0) return this.findById(id);
    this.db.update(mailboxes).set(input).where(eq(mailboxes.id, id)).run();
    return this.findById(id);
  }

  touchSync(id: string, when: Date = new Date()): void {
    this.db.update(mailboxes).set({ lastSyncedAt: when }).where(eq(mailboxes.id, id)).run();
  }

  delete(id: string): boolean {
    const info = this.db.delete(mailboxes).where(eq(mailboxes.id, id)).run();
    return info.changes > 0;
  }
}
