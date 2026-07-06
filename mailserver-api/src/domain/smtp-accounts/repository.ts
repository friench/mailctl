import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { smtpAccounts, type MinTlsVersion, type SmtpAccountRow } from '../../db/schema';

export interface CreateSmtpAccountInput {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  requireTls?: boolean;
  rejectUnauthorized?: boolean | null;
  minTlsVersion?: MinTlsVersion | null;
  userEnvVar?: string | null;
  passwordEnvVar?: string | null;
  fromAddress: string;
  fromName?: string | null;
  priority: number;
  active?: boolean;
  domainId?: string | null;
}

export interface UpdateSmtpAccountInput {
  name?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  requireTls?: boolean;
  rejectUnauthorized?: boolean | null;
  minTlsVersion?: MinTlsVersion | null;
  userEnvVar?: string | null;
  passwordEnvVar?: string | null;
  fromAddress?: string;
  fromName?: string | null;
  priority?: number;
  active?: boolean;
  domainId?: string | null;
}

export class SmtpAccountRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateSmtpAccountInput): SmtpAccountRow {
    const row: SmtpAccountRow = {
      id: randomUUID(),
      name: input.name,
      host: input.host,
      port: input.port,
      secure: input.secure,
      requireTls: input.requireTls ?? false,
      rejectUnauthorized: input.rejectUnauthorized ?? null,
      minTlsVersion: input.minTlsVersion ?? null,
      userEnvVar: input.userEnvVar ?? null,
      passwordEnvVar: input.passwordEnvVar ?? null,
      fromAddress: input.fromAddress,
      fromName: input.fromName ?? null,
      priority: input.priority,
      active: input.active ?? true,
      domainId: input.domainId ?? null,
      createdAt: new Date(),
    };
    this.db.insert(smtpAccounts).values(row).run();
    return row;
  }

  findById(id: string): SmtpAccountRow | undefined {
    return this.db.select().from(smtpAccounts).where(eq(smtpAccounts.id, id)).get();
  }

  list(): SmtpAccountRow[] {
    return this.db.select().from(smtpAccounts).orderBy(asc(smtpAccounts.priority)).all();
  }

  listActive(): SmtpAccountRow[] {
    return this.db
      .select()
      .from(smtpAccounts)
      .where(eq(smtpAccounts.active, true))
      .orderBy(asc(smtpAccounts.priority))
      .all();
  }

  listByDomain(domainId: string): SmtpAccountRow[] {
    return this.db
      .select()
      .from(smtpAccounts)
      .where(and(eq(smtpAccounts.domainId, domainId)))
      .orderBy(asc(smtpAccounts.priority))
      .all();
  }

  update(id: string, input: UpdateSmtpAccountInput): SmtpAccountRow | undefined {
    const updates: Partial<SmtpAccountRow> = {};
    for (const key of [
      'name',
      'host',
      'port',
      'secure',
      'requireTls',
      'rejectUnauthorized',
      'minTlsVersion',
      'userEnvVar',
      'passwordEnvVar',
      'fromAddress',
      'fromName',
      'priority',
      'active',
      'domainId',
    ] as const) {
      if (input[key] !== undefined) {
        // @ts-expect-error — narrow per-key but TS can't follow
        updates[key] = input[key];
      }
    }

    if (Object.keys(updates).length === 0) return this.findById(id);

    this.db.update(smtpAccounts).set(updates).where(eq(smtpAccounts.id, id)).run();
    return this.findById(id);
  }

  delete(id: string): boolean {
    const info = this.db.delete(smtpAccounts).where(eq(smtpAccounts.id, id)).run();
    return info.changes > 0;
  }
}
