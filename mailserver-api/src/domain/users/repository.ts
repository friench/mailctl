import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { users, type UserRole, type UserRow } from '../../db/schema';

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
