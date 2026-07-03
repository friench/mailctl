import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { users, userDomains, type UserRole, type UserRow } from '../../db/schema';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateUserInput): UserRow {
    const row: UserRow = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role ?? 'admin',
      createdAt: new Date(),
      lastLoginAt: null,
    };
    this.db.insert(users).values(row).run();
    return row;
  }

  updateRole(id: string, role: UserRole): void {
    this.db.update(users).set({ role }).where(eq(users.id, id)).run();
  }

  /** Domains a domain-scoped user may manage. */
  listDomainIds(userId: string): string[] {
    return this.db
      .select({ domainId: userDomains.domainId })
      .from(userDomains)
      .where(eq(userDomains.userId, userId))
      .all()
      .map((r) => r.domainId);
  }

  /** Replace the user's assigned domains. */
  setDomains(userId: string, domainIds: string[]): void {
    this.db.delete(userDomains).where(eq(userDomains.userId, userId)).run();
    for (const domainId of new Set(domainIds)) {
      this.db.insert(userDomains).values({ userId, domainId }).run();
    }
  }

  findById(id: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }

  list(): UserRow[] {
    return this.db.select().from(users).all();
  }

  count(): number {
    return this.db.select().from(users).all().length;
  }

  updatePassword(id: string, passwordHash: string): void {
    this.db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
  }

  touchLastLogin(id: string, when: Date = new Date()): void {
    this.db.update(users).set({ lastLoginAt: when }).where(eq(users.id, id)).run();
  }

  delete(id: string): boolean {
    const info = this.db.delete(users).where(eq(users.id, id)).run();
    return info.changes > 0;
  }
}
