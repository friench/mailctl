import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import {
  fetchmailAccounts,
  type FetchmailAccountRow,
  type FetchmailProtocol,
} from '../../db/schema';

export interface CreateFetchmailInput {
  pollServer: string;
  protocol: FetchmailProtocol;
  port?: number | null;
  username: string;
  passwordEnc: string;
  destAddress: string;
  ssl?: boolean;
  keep?: boolean;
  active?: boolean;
}

export class FetchmailRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateFetchmailInput): FetchmailAccountRow {
    const row: FetchmailAccountRow = {
      id: randomUUID(),
      pollServer: input.pollServer,
      protocol: input.protocol,
      port: input.port ?? null,
      username: input.username,
      passwordEnc: input.passwordEnc,
      destAddress: input.destAddress,
      ssl: input.ssl ?? true,
      keep: input.keep ?? true,
      active: input.active ?? true,
      createdAt: new Date(),
    };
    this.db.insert(fetchmailAccounts).values(row).run();
    return row;
  }

  findById(id: string): FetchmailAccountRow | undefined {
    return this.db.select().from(fetchmailAccounts).where(eq(fetchmailAccounts.id, id)).get();
  }

  list(): FetchmailAccountRow[] {
    return this.db
      .select()
      .from(fetchmailAccounts)
      .orderBy(desc(fetchmailAccounts.createdAt))
      .all();
  }

  setActive(id: string, active: boolean): FetchmailAccountRow | undefined {
    this.db.update(fetchmailAccounts).set({ active }).where(eq(fetchmailAccounts.id, id)).run();
    return this.findById(id);
  }

  delete(id: string): boolean {
    const info = this.db.delete(fetchmailAccounts).where(eq(fetchmailAccounts.id, id)).run();
    return info.changes > 0;
  }
}
