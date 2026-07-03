import argon2 from 'argon2';
import { BusinessError } from '../../lib/errors';
import type { UserRole, UserRow } from '../../db/schema';
import type { UserRepository } from './repository';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // ~19 MB
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 8;

export class UserService {
  constructor(private readonly repo: UserRepository) {}

  list(): UserRow[] {
    return this.repo.list();
  }

  findById(id: string): UserRow | undefined {
    return this.repo.findById(id);
  }

  count(): number {
    return this.repo.count();
  }

  async create(email: string, password: string, role?: UserRole): Promise<UserRow> {
    if (!email.includes('@')) throw new BusinessError(400, 'Invalid email');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BusinessError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const normalized = email.toLowerCase();
    if (this.repo.findByEmail(normalized)) {
      throw new BusinessError(409, 'User with this email already exists');
    }
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    return this.repo.create({ email: normalized, passwordHash, role });
  }

  updateRole(id: string, role: UserRole): UserRow {
    const user = this.repo.findById(id);
    if (!user) throw new BusinessError(404, 'User not found');
    this.repo.updateRole(id, role);
    return { ...user, role };
  }

  async verifyPassword(email: string, password: string): Promise<UserRow | null> {
    const user = this.repo.findByEmail(email.toLowerCase());
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    return ok ? user : null;
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BusinessError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const user = this.repo.findById(id);
    if (!user) throw new BusinessError(404, 'User not found');
    const hash = await argon2.hash(newPassword, ARGON2_OPTIONS);
    this.repo.updatePassword(id, hash);
  }

  touchLastLogin(id: string): void {
    this.repo.touchLastLogin(id);
  }

  delete(id: string): void {
    if (this.repo.count() <= 1) {
      throw new BusinessError(400, 'Cannot delete the last admin user');
    }
    const ok = this.repo.delete(id);
    if (!ok) throw new BusinessError(404, 'User not found');
  }
}
