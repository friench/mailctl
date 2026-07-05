import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { mailboxSieve, type MailboxSieveRow, type SieveRule } from '../../db/schema';

export interface SieveState {
  vacationEnabled: boolean;
  vacationSubject: string | null;
  vacationMessage: string | null;
  vacationDays: number;
  rules: SieveRule[];
}

export class SieveRepository {
  constructor(private readonly db: Db) {}

  get(mailboxId: string): MailboxSieveRow | undefined {
    return this.db.select().from(mailboxSieve).where(eq(mailboxSieve.mailboxId, mailboxId)).get();
  }

  upsert(mailboxId: string, state: SieveState): void {
    const now = new Date();
    this.db
      .insert(mailboxSieve)
      .values({ mailboxId, ...state, updatedAt: now })
      .onConflictDoUpdate({ target: mailboxSieve.mailboxId, set: { ...state, updatedAt: now } })
      .run();
  }
}
