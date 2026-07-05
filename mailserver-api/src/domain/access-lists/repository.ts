import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import {
  accessRules,
  type AccessAction,
  type AccessMatchType,
  type AccessRuleRow,
} from '../../db/schema';

export interface CreateAccessRuleInput {
  matchType: AccessMatchType;
  action: AccessAction;
  value: string;
  recipient?: string | null;
  note?: string | null;
}

export class AccessRuleRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateAccessRuleInput): AccessRuleRow {
    const row: AccessRuleRow = {
      id: randomUUID(),
      matchType: input.matchType,
      action: input.action,
      value: input.value,
      recipient: input.recipient ?? null,
      note: input.note ?? null,
      createdAt: new Date(),
    };
    this.db.insert(accessRules).values(row).run();
    return row;
  }

  findById(id: string): AccessRuleRow | undefined {
    return this.db.select().from(accessRules).where(eq(accessRules.id, id)).get();
  }

  /** Find a rule with the same identity (type + value + recipient scope). */
  findDuplicate(
    matchType: AccessMatchType,
    value: string,
    recipient: string | null,
  ): AccessRuleRow | undefined {
    return this.db
      .select()
      .from(accessRules)
      .where(
        and(
          eq(accessRules.matchType, matchType),
          eq(accessRules.value, value),
          recipient === null ? isNull(accessRules.recipient) : eq(accessRules.recipient, recipient),
        ),
      )
      .get();
  }

  list(): AccessRuleRow[] {
    return this.db.select().from(accessRules).all();
  }

  delete(id: string): boolean {
    const info = this.db.delete(accessRules).where(eq(accessRules.id, id)).run();
    return info.changes > 0;
  }
}
