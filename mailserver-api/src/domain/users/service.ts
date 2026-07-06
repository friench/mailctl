import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { BusinessError } from '../../lib/errors';
import type { UserRole, UserRow } from '../../db/schema';
import type { UserRepository } from './repository';

export interface OidcProvisionOptions {
  autoProvision: boolean;
  defaultRole: UserRole;
  /** Emails granted the `admin` role on first SSO login. */
  adminEmails: string[];
}

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

  listDomainIds(id: string): string[] {
    return this.repo.listDomainIds(id);
  }

  setDomains(id: string, domainIds: string[]): void {
    if (!this.repo.findById(id)) throw new BusinessError(404, 'User not found');
    this.repo.setDomains(id, domainIds);
  }

  /**
   * Resolve a user for an SSO (OIDC) login by email. Existing users are returned
   * as-is (keeping their role); unknown users are auto-provisioned when enabled
   * (with an unusable password, so password login stays disabled) or rejected
   * with null. Emails in `adminEmails` are provisioned as `admin`.
   */
  async findOrProvisionOidc(email: string, opts: OidcProvisionOptions): Promise<UserRow | null> {
    const normalized = email.toLowerCase();
    const existing = this.repo.findByEmail(normalized);
    if (existing) return existing;
    if (!opts.autoProvision) return null;

    const role: UserRole = opts.adminEmails.includes(normalized) ? 'admin' : opts.defaultRole;
    // Random unusable password — SSO users authenticate only via the IdP.
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);
    return this.repo.create({ email: normalized, passwordHash, role });
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
